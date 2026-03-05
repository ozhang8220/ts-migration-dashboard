import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(__dirname, '..', 'data', 'migration.db');

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    const fs = require('fs');
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initializeSchema();
    runMigrations();
  }
  return db;
}

function initializeSchema(): void {
  const schema = `
    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      path TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      assignee TEXT,
      complexity TEXT DEFAULT 'low',
      loc INTEGER,
      import_count INTEGER DEFAULT 0,
      imported_by INTEGER DEFAULT 0,
      dep_depth INTEGER DEFAULT 0,
      batch_id TEXT,
      pr_url TEXT,
      pr_number INTEGER,
      error_reason TEXT,
      reviewer_feedback TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS batches (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'running',
      batch_type TEXT NOT NULL DEFAULT 'new_conversions',
      total_files INTEGER,
      completed INTEGER DEFAULT 0,
      failed INTEGER DEFAULT 0,
      revision_count INTEGER DEFAULT 0,
      new_count INTEGER DEFAULT 0,
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
      archived INTEGER NOT NULL DEFAULT 0,
      analyzed_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS error_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      message TEXT NOT NULL,
      details TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `;
  db.exec(schema);
}

function runMigrations(): void {
  // Add duration_seconds to devin_sessions if missing (for existing DBs)
  try {
    db.prepare("SELECT duration_seconds FROM devin_sessions LIMIT 0").get();
  } catch {
    try { db.exec("ALTER TABLE devin_sessions ADD COLUMN duration_seconds INTEGER"); } catch { /* already exists */ }
  }

  // Add auto_progress to repo_config if missing (for existing DBs)
  try {
    db.prepare("SELECT auto_progress FROM repo_config LIMIT 0").get();
  } catch {
    try { db.exec("ALTER TABLE repo_config ADD COLUMN auto_progress INTEGER NOT NULL DEFAULT 0"); } catch { /* already exists */ }
  }

  // Add assignee to files if missing
  try {
    db.prepare("SELECT assignee FROM files LIMIT 0").get();
  } catch {
    try { db.exec("ALTER TABLE files ADD COLUMN assignee TEXT"); } catch { /* already exists */ }
  }

  // Add archived to repo_config if missing
  try {
    db.prepare("SELECT archived FROM repo_config LIMIT 0").get();
  } catch {
    try { db.exec("ALTER TABLE repo_config ADD COLUMN archived INTEGER NOT NULL DEFAULT 0"); } catch { /* already exists */ }
  }

  // Add reviewer_feedback to files if missing
  try {
    db.prepare("SELECT reviewer_feedback FROM files LIMIT 0").get();
  } catch {
    try { db.exec("ALTER TABLE files ADD COLUMN reviewer_feedback TEXT"); } catch { /* already exists */ }
  }

  // Add batch_type to batches if missing
  try {
    db.prepare("SELECT batch_type FROM batches LIMIT 0").get();
  } catch {
    try { db.exec("ALTER TABLE batches ADD COLUMN batch_type TEXT NOT NULL DEFAULT 'new_conversions'"); } catch { /* already exists */ }
  }

  // Add revision_count and new_count to batches if missing
  try {
    db.prepare("SELECT revision_count FROM batches LIMIT 0").get();
  } catch {
    try { db.exec("ALTER TABLE batches ADD COLUMN revision_count INTEGER DEFAULT 0"); } catch { /* already exists */ }
  }
  try {
    db.prepare("SELECT new_count FROM batches LIMIT 0").get();
  } catch {
    try { db.exec("ALTER TABLE batches ADD COLUMN new_count INTEGER DEFAULT 0"); } catch { /* already exists */ }
  }

  // Per-repo persistence: add repos table and repo_id columns
  migrateToPerRepoSchema();
}

function migrateToPerRepoSchema(): void {
  // Create repos table
  db.exec(`
    CREATE TABLE IF NOT EXISTS repos (
      id TEXT PRIMARY KEY,
      owner TEXT NOT NULL,
      repo TEXT NOT NULL,
      branch TEXT NOT NULL,
      analyzed_at TEXT,
      auto_progress INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Add repo_id to repo_config (which repo is currently viewed)
  try {
    db.prepare("SELECT repo_id FROM repo_config LIMIT 0").get();
  } catch {
    try { db.exec("ALTER TABLE repo_config ADD COLUMN repo_id TEXT"); } catch { /* already exists */ }
  }

  // Add repo_id to files, batches, devin_sessions, activity_log
  for (const table of ['files', 'batches', 'devin_sessions', 'activity_log']) {
    try {
      db.prepare(`SELECT repo_id FROM ${table} LIMIT 0`).get();
    } catch {
      try { db.exec(`ALTER TABLE ${table} ADD COLUMN repo_id TEXT`); } catch { /* already exists */ }
    }
  }

  // Backfill repo_id for existing data (single-repo migration)
  const config = db.prepare("SELECT owner, repo, branch, auto_progress FROM repo_config WHERE id = 1").get() as
    | { owner: string; repo: string; branch: string; auto_progress: number }
    | undefined;

  if (config && config.owner && config.repo) {
    const repoId = `${config.owner}/${config.repo}:${config.branch}`;
    db.prepare("INSERT OR IGNORE INTO repos (id, owner, repo, branch, auto_progress) VALUES (?, ?, ?, ?, ?)").run(
      repoId,
      config.owner,
      config.repo,
      config.branch,
      config.auto_progress ?? 0
    );
    db.prepare("UPDATE repo_config SET repo_id = ? WHERE id = 1").run(repoId);
    db.prepare("UPDATE files SET repo_id = ? WHERE repo_id IS NULL").run(repoId);
    db.prepare("UPDATE batches SET repo_id = ? WHERE repo_id IS NULL").run(repoId);
    db.prepare("UPDATE devin_sessions SET repo_id = ? WHERE repo_id IS NULL").run(repoId);
    db.prepare("UPDATE activity_log SET repo_id = ? WHERE repo_id IS NULL").run(repoId);

    // Migrate file ids to repo_id::path for multi-repo support (only legacy path-only ids)
    const legacyFiles = db.prepare("SELECT id, repo_id, path FROM files WHERE id NOT LIKE '%::%' AND repo_id IS NOT NULL").all() as
      { id: string; repo_id: string; path: string }[];
    for (const f of legacyFiles) {
      const newId = `${f.repo_id}::${f.path}`;
      db.prepare("UPDATE devin_sessions SET file_id = ? WHERE file_id = ? AND (repo_id = ? OR repo_id IS NULL)").run(newId, f.id, f.repo_id);
      db.prepare("UPDATE activity_log SET file_id = ? WHERE file_id = ? AND (repo_id = ? OR repo_id IS NULL)").run(newId, f.id, f.repo_id);
      db.prepare("UPDATE files SET id = ? WHERE id = ?").run(newId, f.id);
    }
  }
}

export function logError(source: string, message: string, details?: string): void {
  try {
    const database = getDb();
    database.prepare(
      "INSERT INTO error_log (source, message, details, created_at) VALUES (?, ?, ?, datetime('now'))"
    ).run(source, message, details || null);
  } catch (err) {
    console.error(`[error-log] Failed to log error from ${source}:`, err);
  }
}

export function closeDb(): void {
  if (db) {
    db.close();
  }
}
