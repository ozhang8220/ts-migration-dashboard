import { getDb } from '../database';

const POLL_INTERVAL_MS = 30_000; // 30 seconds

const GITHUB_OWNER = process.env.GITHUB_OWNER || 'ozhang8220';
const GITHUB_REPO = process.env.GITHUB_REPO || 'shopdirect-frontend';

interface FileRow {
  id: string;
  path: string;
  status: string;
  pr_number: number;
}

function getGitHubToken(): string | null {
  return process.env.GITHUB_TOKEN || null;
}

function logActivity(fileId: string, filePath: string, oldStatus: string, newStatus: string, message: string): void {
  const db = getDb();
  db.prepare(
    "INSERT INTO activity_log (file_id, file_path, old_status, new_status, message, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))"
  ).run(fileId, filePath, oldStatus, newStatus, message);
}

async function pollGitHubPRs(): Promise<void> {
  const token = getGitHubToken();
  if (!token) {
    return;
  }

  const db = getDb();
  const openPRFiles = db.prepare(
    "SELECT * FROM files WHERE status = 'pr_open' AND pr_number IS NOT NULL"
  ).all() as FileRow[];

  if (openPRFiles.length === 0) {
    return;
  }

  console.log(`[github-poller] Checking ${openPRFiles.length} open PR(s)...`);

  for (const file of openPRFiles) {
    try {
      const response = await fetch(
        `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/pulls/${file.pr_number}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'ts-migration-dashboard',
          },
        }
      );

      if (!response.ok) {
        console.error(`[github-poller] GitHub API error for PR #${file.pr_number}: ${response.status}`);
        continue;
      }

      const pr = await response.json() as { merged: boolean; state: string; merged_at: string | null };

      if (pr.merged) {
        console.log(`[github-poller] PR #${file.pr_number} merged for ${file.path}`);
        db.prepare(
          "UPDATE files SET status = 'merged', updated_at = datetime('now') WHERE id = ?"
        ).run(file.id);
        logActivity(file.id, file.path, 'pr_open', 'merged', `${file.path} → Merged ✅`);

        // Update batch progress
        const batchId = (db.prepare('SELECT batch_id FROM files WHERE id = ?').get(file.id) as { batch_id: string | null })?.batch_id;
        if (batchId) {
          db.prepare("UPDATE batches SET completed = completed + 1 WHERE id = ?").run(batchId);
        }
      } else if (pr.state === 'closed') {
        console.log(`[github-poller] PR #${file.pr_number} closed without merge for ${file.path}`);
        db.prepare(
          "UPDATE files SET status = 'needs_human', error_reason = 'PR closed without merge', updated_at = datetime('now') WHERE id = ?"
        ).run(file.id);
        logActivity(file.id, file.path, 'pr_open', 'needs_human', `${file.path} → Needs Human (PR Closed) ⚠️`);
      }
      // If still open, do nothing — will check again next poll
    } catch (err) {
      console.error(`[github-poller] Error checking PR #${file.pr_number}:`, err);
    }
  }
}

let pollerInterval: ReturnType<typeof setInterval> | null = null;

export function startGitHubPoller(): void {
  if (pollerInterval) {
    console.log('[github-poller] Poller already running');
    return;
  }

  console.log(`[github-poller] Starting poller (every ${POLL_INTERVAL_MS / 1000}s)`);
  pollerInterval = setInterval(() => {
    pollGitHubPRs().catch((err) => {
      console.error('[github-poller] Unhandled error in poller:', err);
    });
  }, POLL_INTERVAL_MS);

  // Run immediately on start
  pollGitHubPRs().catch((err) => {
    console.error('[github-poller] Unhandled error in initial poll:', err);
  });
}

export function stopGitHubPoller(): void {
  if (pollerInterval) {
    clearInterval(pollerInterval);
    pollerInterval = null;
    console.log('[github-poller] Poller stopped');
  }
}
