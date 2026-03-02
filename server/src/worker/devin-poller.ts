import { getDb, logError } from '../database';
import { getSession, isDevinConfigured } from '../devin/client';
import { updateFileStatus, shouldHaltBatch } from './batch-progression';

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

function computeDurationSeconds(startedAt: string | null): number | null {
  if (!startedAt) return null;
  try {
    const start = new Date(startedAt.replace(' ', 'T') + 'Z').getTime();
    return Math.round((Date.now() - start) / 1000);
  } catch {
    return null;
  }
}

async function pollDevinSessions(): Promise<void> {
  if (!isDevinConfigured()) return;

  const db = getDb();
  const runningSessions = db.prepare(
    "SELECT * FROM devin_sessions WHERE status = 'running'"
  ).all() as DevinSessionRow[];

  if (runningSessions.length === 0) return;

  console.log(`[devin-poller] Checking ${runningSessions.length} running session(s)...`);

  for (const session of runningSessions) {
    try {
      // Check for timeout first
      if (session.started_at) {
        const startedAt = new Date(session.started_at.replace(' ', 'T') + 'Z').getTime();
        const elapsed = Date.now() - startedAt;
        if (elapsed > SESSION_TIMEOUT_MS) {
          console.log(`[devin-poller] Session ${session.devin_session_id} timed out after ${Math.round(elapsed / 60000)}min`);
          const duration = computeDurationSeconds(session.started_at);

          db.prepare(
            "UPDATE devin_sessions SET status = 'timed_out', completed_at = datetime('now'), duration_seconds = ? WHERE id = ?"
          ).run(duration, session.id);

          updateFileStatus(session.file_id, 'needs_human', 'Devin session timed out after 30 minutes');

          if (session.batch_id) {
            db.prepare("UPDATE batches SET failed = failed + 1 WHERE id = ?").run(session.batch_id);
            shouldHaltBatch(session.batch_id);
          }
          continue;
        }
      }

      const sessionData = await getSession(session.devin_session_id);

      if (sessionData.status_enum === 'finished') {
        console.log(`[devin-poller] Session ${session.devin_session_id} finished`);
        const duration = computeDurationSeconds(session.started_at);

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
          "UPDATE devin_sessions SET status = 'completed', completed_at = datetime('now'), pr_url = ?, pr_number = ?, duration_seconds = ? WHERE id = ?"
        ).run(prUrl, prNumber, duration, session.id);

        updateFileStatus(session.file_id, 'pr_open', undefined, prUrl || undefined, prNumber || undefined);

        // Note: We do NOT increment batch.completed here — that happens in the
        // github-poller when the PR is actually merged. This avoids double-counting.

      } else if (sessionData.status_enum === 'failed' || sessionData.status_enum === 'stopped') {
        console.log(`[devin-poller] Session ${session.devin_session_id} ${sessionData.status_enum}`);
        const duration = computeDurationSeconds(session.started_at);
        const errorMessage = `Devin session ${sessionData.status_enum}`;

        db.prepare(
          "UPDATE devin_sessions SET status = 'failed', completed_at = datetime('now'), error_message = ?, duration_seconds = ? WHERE id = ?"
        ).run(errorMessage, duration, session.id);

        updateFileStatus(session.file_id, 'failed', errorMessage);

        if (session.batch_id) {
          db.prepare("UPDATE batches SET failed = failed + 1 WHERE id = ?").run(session.batch_id);
          shouldHaltBatch(session.batch_id);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[devin-poller] Error checking session ${session.devin_session_id}:`, msg);
      logError('devin_poller', `Error checking session ${session.devin_session_id}`, msg);
    }
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
      logError('devin_poller', 'Unhandled poller error', err instanceof Error ? err.message : String(err));
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
