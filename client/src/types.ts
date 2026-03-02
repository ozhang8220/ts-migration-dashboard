export type FileStatus = 'pending' | 'queued' | 'in_progress' | 'pr_open' | 'merged' | 'needs_human' | 'failed' | 'skipped';
export type Complexity = 'low' | 'medium' | 'high';

export interface MigrationFile {
  id: string;
  path: string;
  status: FileStatus;
  complexity: Complexity;
  loc: number;
  import_count: number;
  imported_by: number;
  dep_depth: number;
  batch_id: string | null;
  pr_url: string | null;
  pr_number: number | null;
  error_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface Stats {
  totalFiles: number;
  byStatus: Record<string, number>;
  byComplexity: Record<string, number>;
  progressPercent: number;
}

export interface Batch {
  id: string;
  status: string;
  total_files: number;
  completed: number;
  failed: number;
  started_at: string;
  completed_at: string | null;
}

export interface ActivityEntry {
  id: number;
  file_id: string;
  file_path: string;
  old_status: string;
  new_status: string;
  message: string;
  created_at: string;
}

export interface BatchResponse {
  batchId: string;
  filesQueued: number;
  devinEnabled?: boolean;
  files: MigrationFile[];
}
