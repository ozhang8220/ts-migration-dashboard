import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from './database';

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

  res.json({
    totalFiles,
    byStatus,
    byComplexity,
    progressPercent,
  });
});

// GET /api/files
router.get('/files', (req: Request, res: Response) => {
  const db = getDb();
  const { status, sort } = req.query;

  let query = 'SELECT * FROM files';
  const params: string[] = [];

  if (status && typeof status === 'string') {
    query += ' WHERE status = ?';
    params.push(status);
  }

  const allowedSorts = ['dep_depth', 'loc', 'complexity', 'status', 'path', 'imported_by', 'import_count'];
  if (sort && typeof sort === 'string' && allowedSorts.includes(sort)) {
    query += ` ORDER BY ${sort} ASC`;
  } else {
    query += ' ORDER BY dep_depth ASC, path ASC';
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

  // Log activity
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
router.post('/batches', (req: Request, res: Response) => {
  const db = getDb();
  const batchSize = req.body.batchSize || 5;

  // Pick next N pending files ordered by dep_depth ASC, complexity ASC
  const pendingFiles = db.prepare(
    `SELECT * FROM files WHERE status = 'pending' 
     ORDER BY dep_depth ASC, 
     CASE complexity WHEN 'low' THEN 0 WHEN 'medium' THEN 1 WHEN 'high' THEN 2 END ASC 
     LIMIT ?`
  ).all(batchSize) as { id: string; path: string }[];

  if (pendingFiles.length === 0) {
    res.status(400).json({ error: 'No pending files available' });
    return;
  }

  const batchId = `batch-${uuidv4().slice(0, 8)}`;

  const insertBatch = db.prepare(
    "INSERT INTO batches (id, status, total_files, started_at) VALUES (?, 'running', ?, datetime('now'))"
  );
  const updateFile = db.prepare(
    "UPDATE files SET status = 'queued', batch_id = ?, updated_at = datetime('now') WHERE id = ?"
  );
  const insertActivity = db.prepare(
    "INSERT INTO activity_log (file_id, file_path, old_status, new_status, message, created_at) VALUES (?, ?, 'pending', 'queued', ?, datetime('now'))"
  );

  const transaction = db.transaction(() => {
    insertBatch.run(batchId, pendingFiles.length);
    for (const file of pendingFiles) {
      updateFile.run(batchId, file.id);
      insertActivity.run(file.id, file.path, `${file.path} → Queued (Batch ${batchId})`);
    }
  });

  transaction();

  const files = db.prepare('SELECT * FROM files WHERE batch_id = ?').all(batchId);

  res.json({
    batchId,
    filesQueued: pendingFiles.length,
    files,
  });
});

// GET /api/activity
router.get('/activity', (_req: Request, res: Response) => {
  const db = getDb();
  const activity = db.prepare('SELECT * FROM activity_log ORDER BY created_at DESC LIMIT 20').all();
  res.json(activity);
});

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');
}

export default router;
