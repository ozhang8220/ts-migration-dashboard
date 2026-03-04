import { getDb, logError } from '../database';
import { getSession, isDevinConfigured } from '../devin/client';
import { assignPullRequestAssignee, githubFetchJson } from '../github/api';
import { updateFileStatus, shouldHaltBatch, getRepoConfig } from './batch-progression';

const POLL_INTERVAL_MS = 15_000; // 15 seconds — faster updates when Devin creates PRs
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

interface DevinSessionRow {
  id: string;
  devin_session_id: string;
  file_id: string;
  batch_id: string | null;
  status: string;
  started_at: string | null;
}

interface FileAssignmentRow {
  assignee: string | null;
}

interface PullRequestDetails {
  body: string | null;
}

function hasNeedsHumanIndicators(prBody: string | null | undefined): boolean {
  if (!prBody) return false;
  const normalized = prBody.toLowerCase();
  return (
    normalized.includes('todo') ||
    normalized.includes('partial') ||
    normalized.includes('needs human') ||
    normalized.includes('needs manual') ||
    prBody.includes('⚠')
  );
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

      // Devin API may use status_enum or status
      const isFinished =
        sessionData.status_enum === 'finished' ||
        (sessionData as Record<string, unknown>).status === 'finished';

      if (isFinished) {
        console.log(`[devin-poller] Session ${session.devin_session_id} finished`);
        const duration = computeDurationSeconds(session.started_at);

        let prUrl: string | null = null;
        let prNumber: number | null = null;

        // 1. Try structured_output (if Devin wrote it per our schema)
        if (sessionData.structured_output && typeof sessionData.structured_output === 'object') {
          const output = sessionData.structured_output as Record<string, unknown>;
          prUrl = (output.pr_url as string) || null;
          prNumber = typeof output.pr_number === 'number' ? output.pr_number : null;
        }

        // 2. Fallback: Devin API provides pull_request.url when a PR is created
        if ((!prUrl || prNumber == null) && sessionData.pull_request?.url) {
          prUrl = sessionData.pull_request.url;
          const match = prUrl.match(/\/pull\/(\d+)(?:\/|$)/);
          if (match) prNumber = parseInt(match[1], 10);
        }

        db.prepare(
          "UPDATE devin_sessions SET status = 'completed', completed_at = datetime('now'), pr_url = ?, pr_number = ?, duration_seconds = ? WHERE id = ?"
        ).run(prUrl, prNumber, duration, session.id);

        let nextStatus: 'pr_open' | 'needs_human' = 'pr_open';
        if (prNumber) {
          // If PR body suggests partial/manual work, route to Feedback Needed.
          try {
            const config = getRepoConfig();
            const owner = config?.owner || process.env.GITHUB_OWNER;
            const repo = config?.repo || process.env.GITHUB_REPO;
            if (owner && repo) {
              const pr = await githubFetchJson<PullRequestDetails>(`/repos/${owner}/${repo}/pulls/${prNumber}`);
              if (hasNeedsHumanIndicators(pr.body)) {
                nextStatus = 'needs_human';
              }
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`[devin-poller] Failed to inspect PR #${prNumber} body, defaulting to Ready for Review: ${msg}`);
          }
        }

        updateFileStatus(session.file_id, nextStatus, undefined, prUrl || undefined, prNumber ?? undefined);
        if (prNumber) {
          const config = getRepoConfig();
          const assignment = db.prepare('SELECT assignee FROM files WHERE id = ?').get(session.file_id) as FileAssignmentRow | undefined;
          if (config?.owner && config.repo && assignment?.assignee) {
            try {
              await assignPullRequestAssignee(config.owner, config.repo, prNumber, assignment.assignee);
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              console.warn(`[devin-poller] Failed to assign PR #${prNumber} to ${assignment.assignee}: ${msg}`);
              logError('devin_poller', `Failed to assign PR #${prNumber} to ${assignment.assignee}`, msg);
            }
          }
        }

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

/**
 * Backfill devin_url for sessions that have devin_session_id but missing URL.
 * Runs once on startup to retroactively add links for older sessions.
 */
async function backfillDevinUrls(): Promise<void> {
  if (!isDevinConfigured()) return;

  const db = getDb();
  const sessions = db.prepare(
    "SELECT id, devin_session_id FROM devin_sessions WHERE (devin_url IS NULL OR devin_url = '') AND devin_session_id IS NOT NULL"
  ).all() as { id: string; devin_session_id: string }[];

  if (sessions.length === 0) return;

  console.log(`[devin-poller] Backfilling devin_url for ${sessions.length} session(s)...`);
  const updateUrl = db.prepare('UPDATE devin_sessions SET devin_url = ? WHERE id = ?');

  for (const row of sessions) {
    try {
      const data = await getSession(row.devin_session_id);
      if (data.url) {
        updateUrl.run(data.url, row.id);
      }
    } catch (err) {
      console.warn(`[devin-poller] Could not backfill URL for session ${row.devin_session_id}:`, err instanceof Error ? err.message : err);
    }
  }
}

export function startDevinPoller(): void {
  if (pollerInterval) {
    console.log('[devin-poller] Poller already running');
    return;
  }

  // Retroactively fill devin_url for sessions missing it
  backfillDevinUrls().catch((err) => {
    console.warn('[devin-poller] Backfill devin_url failed:', err instanceof Error ? err.message : err);
  });

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
