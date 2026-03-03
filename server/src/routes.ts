import { Router, Request, Response } from 'express';
import { getDb, logError } from './database';
import { isDevinConfigured } from './devin/client';
import { analyzeRepo, saveAnalysisToDb } from './github/analyzer';
import { getRateLimitInfo, isGitHubConfigured } from './github/api';
import { startNextBatch, getRepoConfig } from './worker/batch-progression';

const router = Router();

// GET /api/stats
router.get('/stats', (_req: Request, res: Response) => {
  const db = getDb();

  const totalFiles = (db.prepare('SELECT COUNT(*) as count FROM files').get() as { count: number }).count;

  const statusRows = db.prepare('SELECT status, COUNT(*) as count FROM files GROUP BY status').all() as { status: string; count: number }[];
  const byStatus: Record<string, number> = {};
  for (const row of statusRows) {
    byStatus[row.status] = row.count;
  }

  const complexityRows = db.prepare('SELECT complexity, COUNT(*) as count FROM files GROUP BY complexity').all() as { complexity: string; count: number }[];
  const byComplexity: Record<string, number> = {};
  for (const row of complexityRows) {
    byComplexity[row.complexity] = row.count;
  }

  const mergedCount = byStatus['merged'] || 0;
  const progressPercent = totalFiles > 0 ? Math.round((mergedCount / totalFiles) * 1000) / 10 : 0;

  // Session duration stats
  const durationRow = db.prepare(
    "SELECT SUM(duration_seconds) as total, COUNT(*) as count FROM devin_sessions WHERE duration_seconds IS NOT NULL"
  ).get() as { total: number | null; count: number };

  const rateLimit = getRateLimitInfo();
  const config = getRepoConfig();

  res.json({
    totalFiles,
    byStatus,
    byComplexity,
    progressPercent,
    totalSessionDurationSeconds: durationRow.total || 0,
    sessionCount: durationRow.count,
    rateLimit,
    repoConfig: config,
    devinConfigured: isDevinConfigured(),
    githubConfigured: isGitHubConfigured(),
  });
});

// GET /api/files
router.get('/files', (req: Request, res: Response) => {
  const db = getDb();
  const { status, sort } = req.query;

  let query = `SELECT f.*,
    (SELECT duration_seconds FROM devin_sessions WHERE file_id = f.id AND duration_seconds IS NOT NULL ORDER BY started_at DESC LIMIT 1) as session_duration,
    (SELECT devin_url FROM devin_sessions WHERE file_id = f.id ORDER BY started_at DESC LIMIT 1) as devin_url
  FROM files f`;
  const params: string[] = [];

  if (status && typeof status === 'string') {
    query += ' WHERE f.status = ?';
    params.push(status);
  }

  const allowedSorts = ['dep_depth', 'loc', 'complexity', 'status', 'path', 'imported_by', 'import_count'];
  if (sort && typeof sort === 'string' && allowedSorts.includes(sort)) {
    query += ` ORDER BY f.${sort} ASC`;
  } else {
    query += ' ORDER BY f.dep_depth ASC, f.path ASC';
  }

  const files = db.prepare(query).all(...params);
  res.json(files);
});

// GET /api/files/:id
router.get('/files/:id(*)', (req: Request, res: Response) => {
  const db = getDb();
  const fileId = req.params.id;

  const file = db.prepare('SELECT * FROM files WHERE id = ?').get(fileId);
  if (!file) {
    res.status(404).json({ error: 'File not found' });
    return;
  }

  const sessions = db.prepare('SELECT * FROM devin_sessions WHERE file_id = ? ORDER BY started_at DESC').all(fileId);

  res.json({ ...file as object, sessions });
});

// PATCH /api/files/:id
router.patch('/files/:id(*)', (req: Request, res: Response) => {
  const db = getDb();
  const fileId = req.params.id;
  const { status } = req.body;

  const validStatuses = ['pending', 'queued', 'in_progress', 'pr_open', 'merged', 'needs_human', 'failed', 'skipped'];
  if (!status || !validStatuses.includes(status)) {
    res.status(400).json({ error: 'Invalid status. Must be one of: ' + validStatuses.join(', ') });
    return;
  }

  const file = db.prepare('SELECT * FROM files WHERE id = ?').get(fileId) as { id: string; path: string; status: string } | undefined;
  if (!file) {
    res.status(404).json({ error: 'File not found' });
    return;
  }

  const oldStatus = file.status;
  db.prepare("UPDATE files SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, fileId);

  db.prepare("INSERT INTO activity_log (file_id, file_path, old_status, new_status, message, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))").run(
    fileId,
    file.path,
    oldStatus,
    status,
    `${file.path} → ${capitalize(status)}`
  );

  const updated = db.prepare('SELECT * FROM files WHERE id = ?').get(fileId);
  res.json(updated);
});

// GET /api/batches
router.get('/batches', (_req: Request, res: Response) => {
  const db = getDb();
  const batches = db.prepare('SELECT * FROM batches ORDER BY started_at DESC').all();
  res.json(batches);
});

// POST /api/batches
router.post('/batches', async (req: Request, res: Response) => {
  try {
    const batchSize = req.body.batchSize || 5;

    if (!isDevinConfigured()) {
      // Still allow batch creation without Devin (files go to queued state)
    }

    const result = await startNextBatch(batchSize);
    const db = getDb();
    const files = db.prepare('SELECT * FROM files WHERE batch_id = ?').all(result.batchId);

    res.json({
      batchId: result.batchId,
      filesQueued: result.filesQueued,
      devinEnabled: result.devinEnabled,
      files,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to create batch';
    logError('batch_create', msg);
    res.status(400).json({ error: msg });
  }
});

// POST /api/batches/:id/resume — resume a halted batch
router.post('/batches/:id/resume', (_req: Request, res: Response) => {
  const db = getDb();
  const batchId = _req.params.id;

  const batch = db.prepare('SELECT * FROM batches WHERE id = ?').get(batchId) as { id: string; status: string } | undefined;
  if (!batch) {
    res.status(404).json({ error: 'Batch not found' });
    return;
  }

  if (batch.status !== 'halted') {
    res.status(400).json({ error: 'Batch is not halted' });
    return;
  }

  // Resume by setting status back to running so auto-progression can continue
  db.prepare("UPDATE batches SET status = 'running' WHERE id = ?").run(batchId);

  db.prepare(
    "INSERT INTO activity_log (file_id, file_path, old_status, new_status, message, created_at) VALUES (NULL, NULL, 'halted', 'running', ?, datetime('now'))"
  ).run(`Batch ${batchId} resumed by user`);

  res.json({ ok: true, batchId, status: 'running' });
});

// GET /api/batches/:id/files
router.get('/batches/:id/files', (req: Request, res: Response) => {
  const db = getDb();
  const batchId = req.params.id;

  const files = db.prepare(
    `SELECT f.*,
      (SELECT devin_url FROM devin_sessions WHERE file_id = f.id ORDER BY started_at DESC LIMIT 1) as devin_url
    FROM files f WHERE f.batch_id = ? ORDER BY f.path ASC`
  ).all(batchId);
  res.json(files);
});

// GET /api/activity
router.get('/activity', (_req: Request, res: Response) => {
  const db = getDb();
  const activity = db.prepare('SELECT * FROM activity_log ORDER BY created_at DESC LIMIT 20').all();
  res.json(activity);
});

// POST /api/analyze
router.post('/analyze', async (req: Request, res: Response) => {
  try {
    const { repoFullName, branch } = req.body;
    if (!repoFullName || typeof repoFullName !== 'string') {
      res.status(400).json({ error: 'repoFullName is required (format: owner/repo)' });
      return;
    }

    if (!isGitHubConfigured()) {
      res.status(400).json({ error: 'GITHUB_TOKEN not configured — cannot analyze repos' });
      return;
    }

    const parts = repoFullName.split('/');
    if (parts.length !== 2) {
      res.status(400).json({ error: 'repoFullName must be in format: owner/repo' });
      return;
    }

    const [owner, repo] = parts;
    const targetBranch = branch || 'main';

    console.log(`[analyze] Starting analysis of ${owner}/${repo}@${targetBranch}`);

    const result = await analyzeRepo(owner, repo, targetBranch);

    if (result.totalFiles === 0) {
      res.json({ ...result, message: 'No .js/.jsx files found under src/' });
      return;
    }

    // Save to database
    saveAnalysisToDb(owner, repo, targetBranch, result.files);

    res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Analysis failed';
    console.error('[analyze] Error:', msg);
    logError('analyze', msg);
    res.status(500).json({ error: msg });
  }
});

// GET /api/config
router.get('/config', (_req: Request, res: Response) => {
  const config = getRepoConfig();
  res.json(config || { owner: null, repo: null, branch: 'main', autoProgress: false });
});

// PATCH /api/config
router.patch('/config', (req: Request, res: Response) => {
  const db = getDb();
  const { autoProgress } = req.body;

  if (autoProgress !== undefined) {
    const config = getRepoConfig();
    if (config) {
      db.prepare("UPDATE repo_config SET auto_progress = ? WHERE id = 1").run(autoProgress ? 1 : 0);
    } else {
      // Create a default config entry
      db.prepare(
        "INSERT OR REPLACE INTO repo_config (id, owner, repo, branch, auto_progress) VALUES (1, '', '', 'main', ?)"
      ).run(autoProgress ? 1 : 0);
    }
  }

  const updatedConfig = getRepoConfig();
  res.json(updatedConfig || { autoProgress: false });
});

// GET /api/errors
router.get('/errors', (_req: Request, res: Response) => {
  const db = getDb();
  const errors = db.prepare('SELECT * FROM error_log ORDER BY created_at DESC LIMIT 50').all();
  res.json(errors);
});

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');
}

export default router;
