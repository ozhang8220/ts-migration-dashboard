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
  }
  return db;
}

function initializeSchema(): void {
  const schema = `
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
      error_message TEXT
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
  `;
  db.exec(schema);
}

export function closeDb(): void {
  if (db) {
    db.close();
  }
}
