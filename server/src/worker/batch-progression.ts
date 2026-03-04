import { v4 as uuidv4 } from 'uuid';
import { getDb, logError } from '../database';
import { createSessionWithRetry, sendSessionMessage, MIGRATION_STRUCTURED_OUTPUT_SCHEMA } from '../devin/client';
import { buildMigrationPrompt } from '../devin/prompt-builder';

export type BatchType = 'new_conversions' | 'revisions' | 'all';

const BATCH_FAILURE_HALT_THRESHOLD = 3;

interface FileRow {
  id: string;
  path: string;
  status: string;
  assignee?: string | null;
  loc: number;
  complexity: string;
  imported_by: number;
  dep_depth: number;
  batch_id: string | null;
}

interface BatchRow {
  id: string;
  status: string;
  total_files: number;
  completed: number;
  failed: number;
}

export function getRepoConfig(): { owner: string; repo: string; branch: string; autoProgress: boolean; repoId: string | null } | null {
  const db = getDb();
  const config = db.prepare('SELECT * FROM repo_config WHERE id = 1').get() as {
    owner: string;
    repo: string;
    branch: string;
    auto_progress: number;
    repo_id: string | null;
  } | undefined;

  if (!config) return null;

  return {
    owner: config.owner,
    repo: config.repo,
    branch: config.branch,
    autoProgress: config.auto_progress === 1,
    repoId: config.repo_id || (config.owner && config.repo ? `${config.owner}/${config.repo}:${config.branch}` : null),
  };
}

interface FileRowFull extends FileRow {
  repo_id: string | null;
}

export function updateFileStatus(
  fileId: string,
  newStatus: string,
  errorReason?: string,
  prUrl?: string,
  prNumber?: number
): void {
  const db = getDb();
  const file = db.prepare('SELECT * FROM files WHERE id = ?').get(fileId) as FileRowFull | undefined;
  if (!file) return;

  const oldStatus = file.status;
  const repoId = file.repo_id ?? null;

  if (errorReason) {
    db.prepare(
      "UPDATE files SET status = ?, error_reason = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(newStatus, errorReason, fileId);
  } else if (prUrl !== undefined) {
    db.prepare(
      "UPDATE files SET status = ?, pr_url = ?, pr_number = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(newStatus, prUrl, prNumber || null, fileId);
  } else {
    db.prepare(
      "UPDATE files SET status = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(newStatus, fileId);
  }

  db.prepare(
    "INSERT INTO activity_log (file_id, file_path, old_status, new_status, message, repo_id, created_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))"
  ).run(fileId, file.path, oldStatus, newStatus, `${file.path} → ${capitalize(newStatus)}`, repoId);
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');
}

export function updateBatchCompleted(batchId: string): void {
  const db = getDb();
  db.prepare("UPDATE batches SET completed = completed + 1 WHERE id = ?").run(batchId);
  checkBatchCompletion(batchId);
}

export function updateBatchFailed(batchId: string): void {
  const db = getDb();
  db.prepare("UPDATE batches SET failed = failed + 1 WHERE id = ?").run(batchId);
  checkBatchCompletion(batchId);
}

function checkBatchCompletion(batchId: string): void {
  const db = getDb();
  const batch = db.prepare('SELECT * FROM batches WHERE id = ?').get(batchId) as BatchRow | undefined;
  if (!batch) return;

  if (batch.completed + batch.failed >= batch.total_files) {
    const newStatus = batch.failed > 0 ? 'partial_failure' : 'completed';
    db.prepare(
      "UPDATE batches SET status = ?, completed_at = datetime('now') WHERE id = ?"
    ).run(newStatus, batchId);
    console.log(`[batch] Batch ${batchId} finished with status: ${newStatus}`);
  }
}

/**
 * Check if we should halt auto-progression due to too many failures in the batch.
 * Returns true if the batch should be halted.
 */
export function shouldHaltBatch(batchId: string): boolean {
  const db = getDb();
  const batch = db.prepare('SELECT * FROM batches WHERE id = ?').get(batchId) as BatchRow | undefined;
  if (!batch) return false;

  if (batch.failed >= BATCH_FAILURE_HALT_THRESHOLD && batch.status === 'running') {
    db.prepare(
      "UPDATE batches SET status = 'halted', completed_at = datetime('now') WHERE id = ?"
    ).run(batchId);
    console.log(`[batch] Batch ${batchId} HALTED — ${batch.failed} failures exceeded threshold`);

    const batchRepoId = (batch as BatchRow & { repo_id?: string | null }).repo_id ?? null;
    db.prepare(
      "INSERT INTO activity_log (file_id, file_path, old_status, new_status, message, repo_id, created_at) VALUES (NULL, NULL, NULL, 'halted', ?, ?, datetime('now'))"
    ).run(`Batch ${batchId} halted: ${batch.failed} failures — human investigation needed`, batchRepoId);

    return true;
  }
  return false;
}

/**
 * Check if batch progression should happen after a file status change.
 * Called by the GitHub poller and webhook handler.
 */
export async function checkBatchProgression(): Promise<void> {
  const db = getDb();
  const config = getRepoConfig();
  if (!config || !config.autoProgress) {
    return;
  }

  const repoId = config.repoId;
  if (!repoId) return;

  // 1. Find current running batch for this repo
  const currentBatch = db.prepare(
    "SELECT * FROM batches WHERE status = 'running' AND repo_id = ? LIMIT 1"
  ).get(repoId) as BatchRow | undefined;

  if (!currentBatch) {
    const pendingCount = (db.prepare(
      "SELECT COUNT(*) as count FROM files WHERE status = 'pending' AND repo_id = ?"
    ).get(repoId) as { count: number }).count;

    if (pendingCount > 0) {
      console.log(`[batch-progression] No active batch, ${pendingCount} files pending — auto-starting`);
      // Wait 10 seconds to let GitHub update the main branch
      setTimeout(() => {
        startNextBatch(5).catch(err => {
          console.error('[batch-progression] Auto-start failed:', err);
          logError('batch_progression', 'Auto-start failed', err instanceof Error ? err.message : String(err));
        });
      }, 10_000);
    }
    return;
  }

  // 2. Check if all files in current batch are in terminal state
  const batchFiles = db.prepare(
    'SELECT * FROM files WHERE batch_id = ?'
  ).all(currentBatch.id) as FileRow[];

  const terminalStatuses = ['merged', 'failed', 'needs_human', 'skipped', 'revision_needed'];
  const allTerminal = batchFiles.every(f => terminalStatuses.includes(f.status));

  if (!allTerminal) return;

  // 3. Mark batch as completed
  const failed = batchFiles.filter(f => ['failed', 'needs_human'].includes(f.status)).length;
  const completed = batchFiles.filter(f => f.status === 'merged').length;
  const newStatus = failed > 0 ? 'partial_failure' : 'completed';

  db.prepare(
    "UPDATE batches SET status = ?, completed = ?, failed = ?, completed_at = datetime('now') WHERE id = ?"
  ).run(newStatus, completed, failed, currentBatch.id);

  console.log(`[batch-progression] Batch ${currentBatch.id} finalized: ${newStatus} (${completed} completed, ${failed} failed)`);

  // 4. Check if there are more pending files for this repo
  const remaining = (db.prepare(
    "SELECT COUNT(*) as count FROM files WHERE status = 'pending' AND repo_id = ?"
  ).get(repoId) as { count: number }).count;

  if (remaining > 0) {
    console.log(`[batch-progression] ${remaining} files remaining — starting next batch in 10s`);
    setTimeout(() => {
      startNextBatch(5).catch(err => {
        console.error('[batch-progression] Auto-start failed:', err);
        logError('batch_progression', 'Auto-start failed', err instanceof Error ? err.message : String(err));
      });
    }, 10_000);
  } else {
    console.log('[batch-progression] All files processed!');
  }
}

interface RevisionFileRow extends FileRow {
  reviewer_feedback: string | null;
  pr_url: string | null;
  pr_number: number | null;
  repo_id: string | null;
}

/**
 * Start a new batch of files. Supports three batch types:
 * - 'new_conversions': picks pending files (default, same as old behavior)
 * - 'revisions': picks revision_needed files, sends feedback to Devin
 * - 'all': picks revision_needed first, then pending to fill remaining slots
 */
export async function startNextBatch(
  batchSize: number,
  assignee?: string | null,
  batchType: BatchType = 'new_conversions'
): Promise<{
  batchId: string;
  filesQueued: number;
  devinEnabled: boolean;
}> {
  const db = getDb();
  const config = getRepoConfig();
  const repoId = config?.repoId;
  if (!repoId) {
    throw new Error('No repository selected. Analyze a repo first.');
  }
  const normalizedAssignee = assignee?.trim() || null;

  const { isDevinConfigured } = await import('../devin/client');
  const devinEnabled = isDevinConfigured();

  // Gather files based on batch type
  let revisionFiles: RevisionFileRow[] = [];
  let pendingFiles: FileRow[] = [];

  if (batchType === 'revisions' || batchType === 'all') {
    revisionFiles = db.prepare(
      `SELECT * FROM files WHERE status = 'revision_needed' AND repo_id = ?
       ORDER BY updated_at ASC
       LIMIT ?`
    ).all(repoId, batchSize) as RevisionFileRow[];
  }

  const remainingSlots = batchSize - revisionFiles.length;

  if ((batchType === 'new_conversions' || batchType === 'all') && remainingSlots > 0) {
    pendingFiles = db.prepare(
      `SELECT * FROM files WHERE status = 'pending' AND repo_id = ?
       ORDER BY dep_depth ASC,
       CASE complexity WHEN 'low' THEN 0 WHEN 'medium' THEN 1 WHEN 'high' THEN 2 END ASC,
       loc ASC
       LIMIT ?`
    ).all(repoId, batchType === 'new_conversions' ? batchSize : remainingSlots) as FileRow[];
  }

  const totalFiles = revisionFiles.length + pendingFiles.length;
  if (totalFiles === 0) {
    if (batchType === 'revisions') {
      throw new Error('No revision_needed files available');
    } else if (batchType === 'all') {
      throw new Error('No revision_needed or pending files available');
    } else {
      throw new Error('No pending files available');
    }
  }

  const batchId = `batch-${uuidv4().slice(0, 8)}`;

  // Determine display batch type for mixed batches
  const effectiveBatchType: BatchType = batchType === 'all' && revisionFiles.length > 0 && pendingFiles.length > 0
    ? 'all'
    : batchType;

  const insertBatch = db.prepare(
    "INSERT INTO batches (id, repo_id, status, batch_type, total_files, revision_count, new_count, started_at) VALUES (?, ?, 'running', ?, ?, ?, ?, datetime('now'))"
  );
  const updateFileQueued = normalizedAssignee
    ? db.prepare(
      "UPDATE files SET status = 'queued', batch_id = ?, assignee = ?, updated_at = datetime('now') WHERE id = ?"
    )
    : db.prepare(
      "UPDATE files SET status = 'queued', batch_id = ?, updated_at = datetime('now') WHERE id = ?"
    );
  const insertActivity = db.prepare(
    "INSERT INTO activity_log (file_id, file_path, old_status, new_status, message, repo_id, created_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))"
  );

  const transaction = db.transaction(() => {
    insertBatch.run(batchId, repoId, effectiveBatchType, totalFiles, revisionFiles.length, pendingFiles.length);
    for (const file of revisionFiles) {
      if (normalizedAssignee) {
        updateFileQueued.run(batchId, normalizedAssignee, file.id);
      } else {
        updateFileQueued.run(batchId, file.id);
      }
      insertActivity.run(file.id, file.path, 'revision_needed', 'queued', `${file.path} \u2192 Queued for Revision (Batch ${batchId})`, repoId);
    }
    for (const file of pendingFiles) {
      if (normalizedAssignee) {
        updateFileQueued.run(batchId, normalizedAssignee, file.id);
      } else {
        updateFileQueued.run(batchId, file.id);
      }
      insertActivity.run(file.id, file.path, 'pending', 'queued', `${file.path} \u2192 Queued (Batch ${batchId})`, repoId);
    }
  });

  transaction();

  // Log batch start to activity
  const batchTypeLabel = effectiveBatchType === 'all'
    ? `${revisionFiles.length} revisions + ${pendingFiles.length} new`
    : effectiveBatchType === 'revisions'
    ? `${revisionFiles.length} revisions`
    : `${pendingFiles.length} new conversions`;
  db.prepare(
    "INSERT INTO activity_log (file_id, file_path, old_status, new_status, message, repo_id, created_at) VALUES (NULL, NULL, NULL, 'running', ?, ?, datetime('now'))"
  ).run(`Batch ${batchId} started \u2014 ${batchTypeLabel} \uD83D\uDD01`, repoId);

  // If Devin API is configured, create sessions
  if (devinEnabled) {
    const batchConfig = getRepoConfig();
    const repoFullName = batchConfig
      ? `${batchConfig.owner}/${batchConfig.repo}`
      : `${process.env.GITHUB_OWNER || 'ozhang8220'}/${process.env.GITHUB_REPO || 'shopdirect-frontend'}`;
    const baseBranch = batchConfig?.branch || process.env.GITHUB_BASE_BRANCH || 'main';

    const mergedFiles = db.prepare(
      "SELECT path FROM files WHERE status = 'merged' AND repo_id = ?"
    ).all(repoId) as { path: string }[];
    const alreadyConverted = mergedFiles.map(f =>
      f.path.endsWith('.jsx')
        ? f.path.replace(/\.jsx$/, '.tsx')
        : f.path.replace(/\.js$/, '.ts')
    );

    // Process revision files
    for (const file of revisionFiles) {
      try {
        // Try to send follow-up message to existing Devin session
        const existingSession = db.prepare(
          "SELECT devin_session_id FROM devin_sessions WHERE file_id = ? ORDER BY started_at DESC LIMIT 1"
        ).get(file.id) as { devin_session_id: string } | undefined;

        let sessionCreated = false;
        let newSessionUrl = '';

        if (existingSession?.devin_session_id) {
          try {
            const feedbackMsg = `The PR was rejected by the reviewer. Here is their feedback:\n\n${file.reviewer_feedback || '(No specific feedback provided)'}\n\nPlease address all of this feedback and open a new PR against the ${baseBranch} branch. Keep the same conversion standards as before.`;
            await sendSessionMessage(existingSession.devin_session_id, feedbackMsg);
            sessionCreated = true;
            console.log(`[batch] Sent revision message to existing session ${existingSession.devin_session_id} for ${file.path}`);

            insertActivity.run(file.id, file.path, 'queued', 'in_progress', `${file.path} \u2192 Sent to Devin with feedback \uD83D\uDD01`, repoId);
          } catch (msgErr) {
            console.warn(`[batch] Failed to send message to session ${existingSession.devin_session_id}, falling back to new session:`, msgErr);
          }
        }

        if (!sessionCreated) {
          // Fall back to creating a new session with revision context
          const closedPrUrl = file.pr_url || '';
          const revisionPrefix = `## Previous Attempt\nA previous conversion was attempted but the PR was rejected.\nClosed PR: ${closedPrUrl}\n\n## Reviewer Feedback\nThe reviewer provided the following feedback. Address ALL of it:\n${file.reviewer_feedback || '(No specific feedback provided)'}\n\n## Important\nOpen a NEW PR. Do not try to reopen the closed one.\nNote in the PR description what changed compared to the previous attempt.\n\n`;

          const basePrompt = buildMigrationPrompt(
            {
              path: file.path,
              loc: file.loc,
              complexity: file.complexity,
              importedBy: file.imported_by,
              depDepth: file.dep_depth,
            },
            { repoFullName, baseBranch, alreadyConverted }
          );

          const fullPrompt = revisionPrefix + basePrompt;

          const session = await createSessionWithRetry(
            fullPrompt,
            file.path,
            3,
            MIGRATION_STRUCTURED_OUTPUT_SCHEMA as Record<string, unknown>,
            repoFullName
          );

          const sessionId = `sess-${uuidv4().slice(0, 8)}`;
          db.prepare(
            "INSERT INTO devin_sessions (id, devin_session_id, file_id, batch_id, repo_id, status, devin_url, started_at) VALUES (?, ?, ?, ?, ?, 'running', ?, datetime('now'))"
          ).run(sessionId, session.session_id, file.id, batchId, repoId, session.url);
          newSessionUrl = session.url;

          insertActivity.run(file.id, file.path, 'queued', 'in_progress', `${file.path} \u2192 Sent to Devin with feedback \uD83D\uDD01`, repoId);
          console.log(`[batch] Created new revision session for ${file.path}: ${session.session_id}`);
        }

        db.prepare(
          "UPDATE files SET status = 'in_progress', updated_at = datetime('now') WHERE id = ?"
        ).run(file.id);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to process revision';
        console.error(`[batch] Failed to process revision for ${file.path}:`, errorMsg);
        logError('batch_create', `Failed to process revision for ${file.path}`, errorMsg);

        db.prepare(
          "UPDATE files SET status = 'failed', error_reason = ?, updated_at = datetime('now') WHERE id = ?"
        ).run(errorMsg, file.id);

        insertActivity.run(file.id, file.path, 'queued', 'failed', `${file.path} \u2192 Failed (${errorMsg})`, repoId);
        db.prepare("UPDATE batches SET failed = failed + 1 WHERE id = ?").run(batchId);

        if (shouldHaltBatch(batchId)) break;
      }
    }

    // Process new conversion files (same as before)
    for (const file of pendingFiles) {
      try {
        const prompt = buildMigrationPrompt(
          {
            path: file.path,
            loc: file.loc,
            complexity: file.complexity,
            importedBy: file.imported_by,
            depDepth: file.dep_depth,
          },
          { repoFullName, baseBranch, alreadyConverted }
        );

        const session = await createSessionWithRetry(
          prompt,
          file.path,
          3,
          MIGRATION_STRUCTURED_OUTPUT_SCHEMA as Record<string, unknown>,
          repoFullName
        );

        const sessionId = `sess-${uuidv4().slice(0, 8)}`;
        db.prepare(
          "INSERT INTO devin_sessions (id, devin_session_id, file_id, batch_id, repo_id, status, devin_url, started_at) VALUES (?, ?, ?, ?, ?, 'running', ?, datetime('now'))"
        ).run(sessionId, session.session_id, file.id, batchId, repoId, session.url);

        db.prepare(
          "UPDATE files SET status = 'in_progress', updated_at = datetime('now') WHERE id = ?"
        ).run(file.id);

        insertActivity.run(file.id, file.path, 'queued', 'in_progress', `${file.path} \u2192 In Progress (Devin Session Started)`, repoId);
        console.log(`[batch] Created Devin session for ${file.path}: ${session.session_id}`);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to create Devin session';
        console.error(`[batch] Failed to create Devin session for ${file.path}:`, errorMsg);
        logError('batch_create', `Failed to create session for ${file.path}`, errorMsg);

        db.prepare(
          "UPDATE files SET status = 'failed', error_reason = ?, updated_at = datetime('now') WHERE id = ?"
        ).run(errorMsg, file.id);

        insertActivity.run(file.id, file.path, 'queued', 'failed', `${file.path} \u2192 Failed (${errorMsg})`, repoId);
        db.prepare("UPDATE batches SET failed = failed + 1 WHERE id = ?").run(batchId);

        if (shouldHaltBatch(batchId)) break;
      }
    }
  } else {
    console.log(`[batch] Devin API not configured — batch ${batchId} created with ${totalFiles} files in queued state only`);
  }

  return { batchId, filesQueued: totalFiles, devinEnabled };
}
