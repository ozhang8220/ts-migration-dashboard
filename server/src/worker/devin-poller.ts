import { getDb } from '../database';
import { getSession, isDevinConfigured } from '../devin/client';

const POLL_INTERVAL_MS = 30_000; // 30 seconds
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

interface DevinSessionRow {
  id: string;
  devin_session_id: string;
  file_id: string;
  batch_id: string | null;
  status: string;
  started_at: string | null;
}

interface FileRow {
  id: string;
  path: string;
  status: string;
}

function logActivity(fileId: string, filePath: string, oldStatus: string, newStatus: string, message: string): void {
  const db = getDb();
  db.prepare(
    "INSERT INTO activity_log (file_id, file_path, old_status, new_status, message, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))"
  ).run(fileId, filePath, oldStatus, newStatus, message);
}

async function pollDevinSessions(): Promise<void> {
  if (!isDevinConfigured()) {
    return;
  }

  const db = getDb();
  const runningSessions = db.prepare(
    "SELECT * FROM devin_sessions WHERE status = 'running'"
  ).all() as DevinSessionRow[];

  if (runningSessions.length === 0) {
    return;
  }

  console.log(`[devin-poller] Checking ${runningSessions.length} running session(s)...`);

  for (const session of runningSessions) {
    try {
      // Check for timeout first
      if (session.started_at) {
        const startedAt = new Date(session.started_at.replace(' ', 'T') + 'Z').getTime();
        const elapsed = Date.now() - startedAt;
        if (elapsed > SESSION_TIMEOUT_MS) {
          console.log(`[devin-poller] Session ${session.devin_session_id} timed out after ${Math.round(elapsed / 60000)}min`);

          db.prepare(
            "UPDATE devin_sessions SET status = 'timed_out', completed_at = datetime('now') WHERE id = ?"
          ).run(session.id);

          const file = db.prepare('SELECT * FROM files WHERE id = ?').get(session.file_id) as FileRow | undefined;
          if (file) {
            db.prepare(
              "UPDATE files SET status = 'needs_human', error_reason = 'Devin session timed out after 30 minutes', updated_at = datetime('now') WHERE id = ?"
            ).run(session.file_id);
            logActivity(session.file_id, file.path, file.status, 'needs_human', `${file.path} → Needs Human (Timed Out) ⚠️`);
          }

          updateBatchProgress(session.batch_id, 'failed');
          continue;
        }
      }

      const sessionData = await getSession(session.devin_session_id);

      if (sessionData.status_enum === 'finished') {
        console.log(`[devin-poller] Session ${session.devin_session_id} finished`);

        // Try to extract PR URL from structured output
        let prUrl: string | null = null;
        let prNumber: number | null = null;

        if (sessionData.structured_output) {
          const output = sessionData.structured_output;
          if (typeof output === 'object') {
            prUrl = (output as Record<string, unknown>).pr_url as string || null;
            prNumber = (output as Record<string, unknown>).pr_number as number || null;
          }
        }

        db.prepare(
          "UPDATE devin_sessions SET status = 'completed', completed_at = datetime('now'), pr_url = ?, pr_number = ? WHERE id = ?"
        ).run(prUrl, prNumber, session.id);

        const file = db.prepare('SELECT * FROM files WHERE id = ?').get(session.file_id) as FileRow | undefined;
        if (file) {
          db.prepare(
            "UPDATE files SET status = 'pr_open', pr_url = ?, pr_number = ?, updated_at = datetime('now') WHERE id = ?"
          ).run(prUrl, prNumber, session.file_id);
          logActivity(session.file_id, file.path, file.status, 'pr_open', `${file.path} → PR Open 🟡`);
        }

        // Note: We do NOT increment batch.completed here — that happens in the
        // github-poller when the PR is actually merged. This avoids double-counting.

      } else if (sessionData.status_enum === 'failed' || sessionData.status_enum === 'stopped') {
        console.log(`[devin-poller] Session ${session.devin_session_id} ${sessionData.status_enum}`);

        const errorMessage = `Devin session ${sessionData.status_enum}`;

        db.prepare(
          "UPDATE devin_sessions SET status = 'failed', completed_at = datetime('now'), error_message = ? WHERE id = ?"
        ).run(errorMessage, session.id);

        const file = db.prepare('SELECT * FROM files WHERE id = ?').get(session.file_id) as FileRow | undefined;
        if (file) {
          db.prepare(
            "UPDATE files SET status = 'failed', error_reason = ?, updated_at = datetime('now') WHERE id = ?"
          ).run(errorMessage, session.file_id);
          logActivity(session.file_id, file.path, file.status, 'failed', `${file.path} → Failed ❌`);
        }

        updateBatchProgress(session.batch_id, 'failed');
      }
      // If still running, do nothing — will check again next poll
    } catch (err) {
      console.error(`[devin-poller] Error checking session ${session.devin_session_id}:`, err);
    }
  }
}

function updateBatchProgress(batchId: string | null, result: 'completed' | 'failed'): void {
  if (!batchId) return;

  const db = getDb();
  if (result === 'completed') {
    db.prepare("UPDATE batches SET completed = completed + 1 WHERE id = ?").run(batchId);
  } else {
    db.prepare("UPDATE batches SET failed = failed + 1 WHERE id = ?").run(batchId);
  }

  // Check if batch is fully done
  const batch = db.prepare('SELECT * FROM batches WHERE id = ?').get(batchId) as {
    total_files: number;
    completed: number;
    failed: number;
  } | undefined;

  if (batch && (batch.completed + batch.failed >= batch.total_files)) {
    const newStatus = batch.failed > 0 ? 'partial_failure' : 'completed';
    db.prepare(
      "UPDATE batches SET status = ?, completed_at = datetime('now') WHERE id = ?"
    ).run(newStatus, batchId);
    console.log(`[devin-poller] Batch ${batchId} finished with status: ${newStatus}`);
  }
}

let pollerInterval: ReturnType<typeof setInterval> | null = null;

export function startDevinPoller(): void {
  if (pollerInterval) {
    console.log('[devin-poller] Poller already running');
    return;
  }

  console.log(`[devin-poller] Starting poller (every ${POLL_INTERVAL_MS / 1000}s)`);
  pollerInterval = setInterval(() => {
    pollDevinSessions().catch((err) => {
      console.error('[devin-poller] Unhandled error in poller:', err);
    });
  }, POLL_INTERVAL_MS);

  // Run immediately on start
  pollDevinSessions().catch((err) => {
    console.error('[devin-poller] Unhandled error in initial poll:', err);
  });
}

export function stopDevinPoller(): void {
  if (pollerInterval) {
    clearInterval(pollerInterval);
    pollerInterval = null;
    console.log('[devin-poller] Poller stopped');
  }
}
