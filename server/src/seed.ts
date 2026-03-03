import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DB_DIR, 'migration.db');

// Ensure data directory exists
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

// Remove existing database
if (fs.existsSync(DB_PATH)) {
  fs.unlinkSync(DB_PATH);
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// Create schema
db.exec(`
  CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY,
    path TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    complexity TEXT DEFAULT 'low',
    loc INTEGER,
    import_count INTEGER DEFAULT 0,
    imported_by INTEGER DEFAULT 0,
    dep_depth INTEGER DEFAULT 0,
    batch_id TEXT,
    pr_url TEXT,
    pr_number INTEGER,
    error_reason TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS batches (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'running',
    total_files INTEGER,
    completed INTEGER DEFAULT 0,
    failed INTEGER DEFAULT 0,
    started_at TEXT DEFAULT (datetime('now')),
    completed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS devin_sessions (
    id TEXT PRIMARY KEY,
    devin_session_id TEXT,
    file_id TEXT NOT NULL,
    batch_id TEXT,
    status TEXT NOT NULL DEFAULT 'created',
    devin_url TEXT,
    pr_url TEXT,
    pr_number INTEGER,
    started_at TEXT,
    completed_at TEXT,
    error_message TEXT,
    duration_seconds INTEGER
  );

  CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_id TEXT,
    file_path TEXT,
    old_status TEXT,
    new_status TEXT,
    message TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS repo_config (
    id INTEGER PRIMARY KEY DEFAULT 1,
    owner TEXT NOT NULL,
    repo TEXT NOT NULL,
    branch TEXT NOT NULL DEFAULT 'main',
    auto_progress INTEGER NOT NULL DEFAULT 0,
    analyzed_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS error_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    message TEXT NOT NULL,
    details TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// Seed files
const files = [
  // Already merged
  { id: 'src/utils/formatDate.js', path: 'src/utils/formatDate.js', status: 'merged', complexity: 'low', loc: 121, dep_depth: 0, import_count: 2, imported_by: 1, pr_url: 'https://github.com/ozhang8220/shopdirect-frontend/pull/1', pr_number: 1 },
  { id: 'src/utils/slugify.js', path: 'src/utils/slugify.js', status: 'merged', complexity: 'low', loc: 69, dep_depth: 0, import_count: 1, imported_by: 1, pr_url: 'https://github.com/ozhang8220/shopdirect-frontend/pull/2', pr_number: 2 },

  // PR open (awaiting review)
  { id: 'src/components/Button.jsx', path: 'src/components/Button.jsx', status: 'pr_open', complexity: 'low', loc: 88, dep_depth: 0, import_count: 1, imported_by: 2, pr_url: 'https://github.com/ozhang8220/shopdirect-frontend/pull/3', pr_number: 3 },

  // High complexity — partial conversion with TODOs
  { id: 'src/services/analytics.js', path: 'src/services/analytics.js', status: 'needs_human', complexity: 'high', loc: 377, dep_depth: 2, import_count: 3, imported_by: 0, error_reason: 'Partial conversion — 3 TODO comments for dynamic event registry and plugin system types', pr_url: 'https://github.com/ozhang8220/shopdirect-frontend/pull/4', pr_number: 4 },

  // Pending — not started yet
  { id: 'src/utils/currency.js', path: 'src/utils/currency.js', status: 'pending', complexity: 'low', loc: 91, dep_depth: 0, import_count: 1, imported_by: 1 },
  { id: 'src/utils/debounce.js', path: 'src/utils/debounce.js', status: 'pending', complexity: 'medium', loc: 112, dep_depth: 0, import_count: 0, imported_by: 1 },
  { id: 'src/utils/validators.js', path: 'src/utils/validators.js', status: 'pending', complexity: 'low', loc: 128, dep_depth: 0, import_count: 1, imported_by: 0 },
  { id: 'src/utils/constants.js', path: 'src/utils/constants.js', status: 'pending', complexity: 'low', loc: 81, dep_depth: 0, import_count: 0, imported_by: 3 },
  { id: 'src/utils/apiClient.js', path: 'src/utils/apiClient.js', status: 'pending', complexity: 'medium', loc: 204, dep_depth: 1, import_count: 2, imported_by: 6 },
  { id: 'src/components/Modal.jsx', path: 'src/components/Modal.jsx', status: 'pending', complexity: 'medium', loc: 174, dep_depth: 1, import_count: 1, imported_by: 0 },
  { id: 'src/components/ProductCard.jsx', path: 'src/components/ProductCard.jsx', status: 'pending', complexity: 'low', loc: 195, dep_depth: 1, import_count: 2, imported_by: 0 },
  { id: 'src/components/SearchBar.jsx', path: 'src/components/SearchBar.jsx', status: 'pending', complexity: 'medium', loc: 238, dep_depth: 2, import_count: 2, imported_by: 0 },
  { id: 'src/hooks/useFetch.js', path: 'src/hooks/useFetch.js', status: 'pending', complexity: 'medium', loc: 212, dep_depth: 2, import_count: 1, imported_by: 0 },
  { id: 'src/hooks/useCart.js', path: 'src/hooks/useCart.js', status: 'pending', complexity: 'medium', loc: 241, dep_depth: 2, import_count: 1, imported_by: 0 },
  { id: 'src/hooks/useAuth.jsx', path: 'src/hooks/useAuth.jsx', status: 'pending', complexity: 'medium', loc: 213, dep_depth: 2, import_count: 1, imported_by: 0 },
  { id: 'src/services/featureFlags.js', path: 'src/services/featureFlags.js', status: 'pending', complexity: 'high', loc: 376, dep_depth: 2, import_count: 2, imported_by: 0 },
];

const insertFile = db.prepare(`
  INSERT INTO files (id, path, status, complexity, loc, dep_depth, import_count, imported_by, pr_url, pr_number, error_reason, batch_id, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', ?), datetime('now', ?))
`);

const insertBatch = db.prepare(`
  INSERT INTO batches (id, status, total_files, completed, failed, started_at, completed_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const insertSession = db.prepare(`
  INSERT INTO devin_sessions (id, devin_session_id, file_id, batch_id, status, devin_url, pr_url, pr_number, started_at, completed_at, error_message)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertActivity = db.prepare(`
  INSERT INTO activity_log (file_id, file_path, old_status, new_status, message, created_at)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const insertRepoConfig = db.prepare(`
  INSERT OR REPLACE INTO repo_config (id, owner, repo, branch, auto_progress, analyzed_at)
  VALUES (1, ?, ?, ?, ?, datetime('now'))
`);

const transaction = db.transaction(() => {
  // Insert files with staggered timestamps
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const offset = `-${files.length - i} hours`;
    insertFile.run(
      f.id, f.path, f.status, f.complexity, f.loc, f.dep_depth,
      f.import_count, f.imported_by,
      f.pr_url || null, f.pr_number || null, f.error_reason || null,
      f.status === 'merged' || f.status === 'pr_open' || f.status === 'needs_human' ? 'batch-001' : null,
      offset, offset
    );
  }

  // Seed batch #1 (completed)
  insertBatch.run(
    'batch-001', 'completed', 4, 2, 0,
    new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19),
    new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19)
  );

  // Seed Devin sessions for merged/active files
  const sessions = [
    { id: 'sess-001', devinId: 'dv-abc123', fileId: 'src/utils/formatDate.js', batchId: 'batch-001', status: 'completed', prUrl: 'https://github.com/ozhang8220/shopdirect-frontend/pull/1', prNumber: 1 },
    { id: 'sess-002', devinId: 'dv-def456', fileId: 'src/utils/slugify.js', batchId: 'batch-001', status: 'completed', prUrl: 'https://github.com/ozhang8220/shopdirect-frontend/pull/2', prNumber: 2 },
    { id: 'sess-003', devinId: 'dv-ghi789', fileId: 'src/components/Button.jsx', batchId: 'batch-001', status: 'completed', prUrl: 'https://github.com/ozhang8220/shopdirect-frontend/pull/3', prNumber: 3 },
    { id: 'sess-004', devinId: 'dv-jkl012', fileId: 'src/services/analytics.js', batchId: 'batch-001', status: 'completed', prUrl: 'https://github.com/ozhang8220/shopdirect-frontend/pull/4', prNumber: 4 },
  ];

  for (const s of sessions) {
    const startedAt = new Date(Date.now() - 2.5 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);
    const completedAt = new Date(Date.now() - 1.5 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);
    insertSession.run(
      s.id, s.devinId, s.fileId, s.batchId, s.status,
      `https://app.devin.ai/sessions/${s.devinId}`,
      s.prUrl, s.prNumber,
      startedAt, completedAt, null
    );
  }

  // Seed activity log
  const now = Date.now();
  const activities = [
    { fileId: 'src/utils/formatDate.js', path: 'src/utils/formatDate.js', from: 'pending', to: 'queued', msg: 'formatDate.js → Queued', offset: -180 },
    { fileId: 'src/utils/formatDate.js', path: 'src/utils/formatDate.js', from: 'queued', to: 'in_progress', msg: 'formatDate.js → In Progress', offset: -170 },
    { fileId: 'src/utils/formatDate.js', path: 'src/utils/formatDate.js', from: 'in_progress', to: 'pr_open', msg: 'formatDate.js → PR Open', offset: -140 },
    { fileId: 'src/utils/formatDate.js', path: 'src/utils/formatDate.js', from: 'pr_open', to: 'merged', msg: 'formatDate.js → Merged ✅', offset: -90 },
    { fileId: 'src/utils/slugify.js', path: 'src/utils/slugify.js', from: 'pending', to: 'queued', msg: 'slugify.js → Queued', offset: -175 },
    { fileId: 'src/utils/slugify.js', path: 'src/utils/slugify.js', from: 'queued', to: 'in_progress', msg: 'slugify.js → In Progress', offset: -165 },
    { fileId: 'src/utils/slugify.js', path: 'src/utils/slugify.js', from: 'in_progress', to: 'pr_open', msg: 'slugify.js → PR Open', offset: -130 },
    { fileId: 'src/utils/slugify.js', path: 'src/utils/slugify.js', from: 'pr_open', to: 'merged', msg: 'slugify.js → Merged ✅', offset: -80 },
    { fileId: 'src/components/Button.jsx', path: 'src/components/Button.jsx', from: 'pending', to: 'queued', msg: 'Button.jsx → Queued', offset: -160 },
    { fileId: 'src/components/Button.jsx', path: 'src/components/Button.jsx', from: 'queued', to: 'in_progress', msg: 'Button.jsx → In Progress', offset: -150 },
    { fileId: 'src/components/Button.jsx', path: 'src/components/Button.jsx', from: 'in_progress', to: 'pr_open', msg: 'Button.jsx → PR Open', offset: -60 },
    { fileId: 'src/services/analytics.js', path: 'src/services/analytics.js', from: 'pending', to: 'queued', msg: 'analytics.js → Queued', offset: -155 },
    { fileId: 'src/services/analytics.js', path: 'src/services/analytics.js', from: 'queued', to: 'in_progress', msg: 'analytics.js → In Progress', offset: -145 },
    { fileId: 'src/services/analytics.js', path: 'src/services/analytics.js', from: 'in_progress', to: 'needs_human', msg: 'analytics.js → Needs Human ⚠️', offset: -30 },
  ];

  for (const a of activities) {
    const ts = new Date(now + a.offset * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);
    insertActivity.run(a.fileId, a.path, a.from, a.to, a.msg, ts);
  }

  // Seed repo config so the header repo pill/sidebar show the active repo
  insertRepoConfig.run('ozhang8220', 'shopdirect-frontend', 'main', 0);
});

transaction();

console.log('✅ Database seeded successfully!');
console.log(`   📁 ${files.length} files`);
console.log('   📦 1 batch');
console.log('   🤖 4 Devin sessions');
console.log('   📋 14 activity log entries');
console.log(`   💾 Database at: ${DB_PATH}`);

db.close();
