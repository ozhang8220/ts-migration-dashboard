import { getDb, logError } from '../database';
import { githubFetch } from '../github/api';
import { checkBatchProgression, updateFileStatus, getRepoConfig, shouldHaltBatch } from './batch-progression';

const POLL_INTERVAL_MS = 120_000; // 2 minutes (reduced — webhooks are primary)

interface FileRow {
  id: string;
  path: string;
  status: string;
  pr_number: number;
  batch_id: string | null;
}

async function pollGitHubPRs(): Promise<void> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return;

  const db = getDb();
  const config = getRepoConfig();
  const owner = config?.owner || process.env.GITHUB_OWNER || 'ozhang8220';
  const repo = config?.repo || process.env.GITHUB_REPO || 'shopdirect-frontend';

  const openPRFiles = db.prepare(
    "SELECT * FROM files WHERE status = 'pr_open' AND pr_number IS NOT NULL"
  ).all() as FileRow[];

  if (openPRFiles.length === 0) return;

  console.log(`[github-poller] Checking ${openPRFiles.length} open PR(s) on ${owner}/${repo}...`);

  for (const file of openPRFiles) {
    try {
      const response = await githubFetch(`/repos/${owner}/${repo}/pulls/${file.pr_number}`);
      const pr = await response.json() as { merged: boolean; state: string };

      if (pr.merged) {
        console.log(`[github-poller] PR #${file.pr_number} merged for ${file.path}`);
        updateFileStatus(file.id, 'merged');

        if (file.batch_id) {
          db.prepare("UPDATE batches SET completed = completed + 1 WHERE id = ?").run(file.batch_id);
        }

        await checkBatchProgression();

      } else if (pr.state === 'closed') {
        console.log(`[github-poller] PR #${file.pr_number} closed without merge for ${file.path}`);
        updateFileStatus(file.id, 'needs_human', 'PR closed without merge');

        if (file.batch_id) {
          db.prepare("UPDATE batches SET failed = failed + 1 WHERE id = ?").run(file.batch_id);
          shouldHaltBatch(file.batch_id);
        }

        await checkBatchProgression();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[github-poller] Error checking PR #${file.pr_number}:`, msg);
      logError('github_poller', `Error checking PR #${file.pr_number}`, msg);
    }
  }
}

let pollerInterval: ReturnType<typeof setInterval> | null = null;

export function startGitHubPoller(): void {
  if (pollerInterval) {
    console.log('[github-poller] Poller already running');
    return;
  }

  console.log(`[github-poller] Starting poller (every ${POLL_INTERVAL_MS / 1000}s — fallback, webhooks are primary)`);
  pollerInterval = setInterval(() => {
    pollGitHubPRs().catch((err) => {
      console.error('[github-poller] Unhandled error in poller:', err);
      logError('github_poller', 'Unhandled poller error', err instanceof Error ? err.message : String(err));
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
