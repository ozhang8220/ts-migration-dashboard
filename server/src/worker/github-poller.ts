import { getDb, logError } from '../database';
import { assignPullRequestAssignee, githubFetch } from '../github/api';
import { checkBatchProgression, updateFileStatus, getRepoConfig, shouldHaltBatch } from './batch-progression';

const POLL_INTERVAL_MS = 120_000; // 2 minutes for merged-PR check
const SYNC_IN_PROGRESS_INTERVAL_MS = 30_000; // 30 seconds — detect new PRs for in_progress files

interface FileRow {
  id: string;
  path: string;
  status: string;
  assignee?: string | null;
  pr_number: number;
  batch_id: string | null;
}

/** Branch name for a file: ts-migrate/src-utils-foo -> src/utils/foo.js */
function pathToBranch(path: string): string {
  return `ts-migrate/${path.replace(/\//g, '-').replace(/\.(js|jsx)$/, '')}`;
}

/**
 * Sync in_progress/queued files with GitHub open PRs.
 * When Devin creates a PR, the Devin API may not return it — so we detect via GitHub.
 */
async function syncInProgressWithPRs(): Promise<void> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return;

  const db = getDb();
  const config = getRepoConfig();
  const repoId = config?.repoId;
  if (!repoId) return;

  const owner = config.owner || process.env.GITHUB_OWNER || 'ozhang8220';
  const repo = config.repo || process.env.GITHUB_REPO || 'shopdirect-frontend';
  const branch = config.branch || 'main';

  const inProgressFiles = db.prepare(
    "SELECT * FROM files WHERE status IN ('in_progress', 'queued') AND repo_id = ?"
  ).all(repoId) as FileRow[];

  if (inProgressFiles.length === 0) return;

  try {
    const prs = await githubFetch(
      `/repos/${owner}/${repo}/pulls?state=open&base=${encodeURIComponent(branch)}&per_page=100`
    ).then((r) => r.json()) as Array<{ number: number; html_url: string; head: { ref: string } }>;

    const branchToFile = new Map<string, FileRow>();
    for (const f of inProgressFiles) {
      branchToFile.set(pathToBranch(f.path), f);
    }

    for (const pr of prs) {
      const headRef = pr.head.ref;
      const file = branchToFile.get(headRef);
      if (file) {
        console.log(`[github-poller] Found PR #${pr.number} for in_progress file ${file.path} — syncing to Ready for Review`);
        db.prepare(
          "UPDATE devin_sessions SET pr_url = ?, pr_number = ?, status = 'completed', completed_at = datetime('now') WHERE file_id = ?"
        ).run(pr.html_url, pr.number, file.id);
        updateFileStatus(file.id, 'pr_open', undefined, pr.html_url, pr.number);
        if (file.assignee) {
          try {
            await assignPullRequestAssignee(owner, repo, pr.number, file.assignee);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`[github-poller] Failed to assign PR #${pr.number} to ${file.assignee}: ${msg}`);
            logError('github_poller', `Failed to assign PR #${pr.number} to ${file.assignee}`, msg);
          }
        }
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[github-poller] syncInProgressWithPRs error:', msg);
    logError('github_poller', 'syncInProgressWithPRs error', msg);
  }
}

async function pollGitHubPRs(): Promise<void> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return;

  const db = getDb();
  const config = getRepoConfig();
  const repoId = config?.repoId;
  if (!repoId) return;

  const owner = config.owner || process.env.GITHUB_OWNER || 'ozhang8220';
  const repo = config.repo || process.env.GITHUB_REPO || 'shopdirect-frontend';

  const openPRFiles = db.prepare(
    "SELECT * FROM files WHERE status = 'pr_open' AND pr_number IS NOT NULL AND repo_id = ?"
  ).all(repoId) as FileRow[];

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
let syncInterval: ReturnType<typeof setInterval> | null = null;

export function startGitHubPoller(): void {
  if (pollerInterval) {
    console.log('[github-poller] Poller already running');
    return;
  }

  console.log(`[github-poller] Starting poller (merged check every ${POLL_INTERVAL_MS / 1000}s, in_progress sync every ${SYNC_IN_PROGRESS_INTERVAL_MS / 1000}s)`);
  pollerInterval = setInterval(() => {
    pollGitHubPRs().catch((err) => {
      console.error('[github-poller] Unhandled error in poller:', err);
      logError('github_poller', 'Unhandled poller error', err instanceof Error ? err.message : String(err));
    });
  }, POLL_INTERVAL_MS);

  syncInterval = setInterval(() => {
    syncInProgressWithPRs().catch((err) => {
      console.error('[github-poller] syncInProgress error:', err);
    });
  }, SYNC_IN_PROGRESS_INTERVAL_MS);

  // Run immediately on start
  Promise.all([syncInProgressWithPRs(), pollGitHubPRs()]).catch((err) => {
    console.error('[github-poller] Unhandled error in initial poll:', err);
  });
}

export function stopGitHubPoller(): void {
  if (pollerInterval) {
    clearInterval(pollerInterval);
    pollerInterval = null;
  }
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
  console.log('[github-poller] Poller stopped');
}
