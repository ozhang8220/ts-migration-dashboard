export type FileStatus = 'pending' | 'queued' | 'in_progress' | 'pr_open' | 'merged' | 'needs_human' | 'failed' | 'skipped' | 'revision_needed';
export type BatchType = 'new_conversions' | 'revisions' | 'all';
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
  assignee: string | null;
  reviewer_feedback: string | null;
  error_reason: string | null;
  created_at: string;
  updated_at: string;
  session_duration: number | null;
  devin_url: string | null;
}

export interface RateLimitInfo {
  remaining: number | null;
  total: number | null;
  resetsAt: string | null;
}

export interface RepoConfig {
  owner: string | null;
  repo: string | null;
  branch: string;
  autoProgress: boolean;
  repoId?: string | null;
  archived?: boolean;
}

export interface Stats {
  totalFiles: number;
  byStatus: Record<string, number>;
  byComplexity: Record<string, number>;
  progressPercent: number;
  totalSessionDurationSeconds: number;
  sessionCount: number;
  rateLimit: RateLimitInfo;
  repoConfig: RepoConfig | null;
  devinConfigured: boolean;
  githubConfigured: boolean;
}

export interface Batch {
  id: string;
  status: string;
  batch_type: BatchType;
  total_files: number;
  completed: number;
  failed: number;
  revision_count: number;
  new_count: number;
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

export interface RepoInfo {
  id: number;
  owner: string;
  repo: string;
  branch: string;
  repoId: string | null;
  autoProgress: boolean;
  archived: boolean;
}

export interface ErrorLogEntry {
  id: number;
  source: string;
  message: string;
  details: string | null;
  created_at: string;
}

export interface AnalysisResult {
  totalFiles: number;
  byComplexity: Record<string, number>;
  byDepth: Record<string, number>;
  files: Array<{
    id: string;
    path: string;
    loc: number;
    importCount: number;
    importedBy: number;
    depDepth: number;
    complexity: string;
    hasJsx: boolean;
  }>;
  message?: string;
}
