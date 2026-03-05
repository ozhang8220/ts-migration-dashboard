import { githubFetchJson } from './api';
import { getDb, logError } from '../database';

interface TreeItem {
  path: string;
  type: string;
  size?: number;
}

interface TreeResponse {
  tree: TreeItem[];
  truncated: boolean;
}

interface FileContentResponse {
  content: string;
  encoding: string;
}

interface AnalyzedFile {
  id: string;
  path: string;
  loc: number;
  importCount: number;
  importedBy: number;
  depDepth: number;
  complexity: 'low' | 'medium' | 'high';
  hasJsx: boolean;
  /** Set when .ts/.tsx exists (merged) or open PR exists (pr_open) */
  initialStatus?: 'merged' | 'pr_open';
  /** Set when open PR exists for this file */
  prUrl?: string;
  prNumber?: number;
}

interface AnalysisResult {
  totalFiles: number;
  byComplexity: Record<string, number>;
  byDepth: Record<string, number>;
  files: AnalyzedFile[];
}

const EXCLUDE_PATTERNS = [
  /node_modules/,
  /dist\//,
  /build\//,
  /__tests__/,
  /\.test\./,
  /\.spec\./,
  /test\//,
  /tests\//,
  /\.stories\./,
  /\.d\.ts$/,
  /test-setup\.(js|jsx)$/i,
];

/** Only include source dirs: utils, components, hooks, services, and root app files */
const INCLUDE_DIRS = ['src/utils/', 'src/components/', 'src/hooks/', 'src/services/'];

function isIncludedSourcePath(filePath: string): boolean {
  if (!filePath.startsWith('src/')) return false;
  const afterSrc = filePath.slice(4); // after "src/"
  if (!afterSrc.includes('/')) return true; // root: src/App.js, src/index.js
  return INCLUDE_DIRS.some(d => filePath.startsWith(d));
}

function shouldInclude(filePath: string): boolean {
  if (!/\.(js|jsx)$/.test(filePath)) return false;
  if (!isIncludedSourcePath(filePath)) return false;
  return !EXCLUDE_PATTERNS.some(p => p.test(filePath));
}

/** Check if path is a converted .ts/.tsx under src/ (exclude tests, same dirs as shouldInclude) */
function isConvertedTsFile(filePath: string): boolean {
  if (!/\.(ts|tsx)$/.test(filePath)) return false;
  if (!isIncludedSourcePath(filePath)) return false;
  return !EXCLUDE_PATTERNS.some(p => p.test(filePath));
}

/** Convert ts-migrate branch name to original file path. e.g. ts-migrate/src-utils-formatDate -> src/utils/formatDate.js */
function branchToFilePath(branchName: string, jsFilePaths: Set<string>): string | null {
  if (!branchName.startsWith('ts-migrate/')) return null;
  const suffix = branchName.slice('ts-migrate/'.length);
  const pathNoExt = suffix.replace(/-/g, '/');
  // Could be .js or .jsx
  const jsPath = `${pathNoExt}.js`;
  const jsxPath = `${pathNoExt}.jsx`;
  if (jsFilePaths.has(jsPath)) return jsPath;
  if (jsFilePaths.has(jsxPath)) return jsxPath;
  return null;
}

function parseImports(content: string): string[] {
  const imports: string[] = [];

  // ES module imports: import ... from './...' or import ... from '../...'
  const esImportRegex = /(?:import\s+.*?\s+from\s+|import\s+)['"](\.[^'"]+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = esImportRegex.exec(content)) !== null) {
    imports.push(match[1]);
  }

  // CommonJS requires: require('./...')
  const requireRegex = /require\(\s*['"](\.[^'"]+)['"]\s*\)/g;
  while ((match = requireRegex.exec(content)) !== null) {
    imports.push(match[1]);
  }

  return imports;
}

function detectJsx(content: string): boolean {
  // Check for JSX-like syntax: <ComponentName or React.createElement
  if (/React\.createElement/.test(content)) return true;
  if (/<[A-Z][a-zA-Z]*[\s/>]/.test(content)) return true;
  return false;
}

function classifyComplexity(loc: number, content: string, hasJsx: boolean): 'low' | 'medium' | 'high' {
  // Dynamic pattern detection for HIGH complexity.
  // Keep this narrow to avoid over-classifying normal files as high.
  const dynamicPatterns = [
    /\b[a-zA-Z_$][a-zA-Z0-9_$]*\s*\[\s*[a-zA-Z_$][a-zA-Z0-9_$]{1,}\s*\]/, // computed access: obj[variable]
    /\.reduce\s*\(\s*\([^)]*\)\s*=>\s*[^)]*=>/, // reduce with function-array composition
    /eval\s*\(/,               // eval()
    /new\s+Function\s*\(/,     // new Function()
    /Object\.defineProperty/,  // monkey-patching
    /Object\.assign\s*\(\s*\w+\.prototype/,  // prototype extension
    /\.prototype\.[a-zA-Z_$][a-zA-Z0-9_$]*\s*=/, // direct prototype patching
    /Proxy\s*\(/,              // Proxy usage
    /\b(registerPlugin|addPlugin|createPlugin|createFactory)\s*\(/, // plugin/factory patterns
  ];

  const hasDynamicPatterns = dynamicPatterns.some(p => p.test(content));

  // React hooks/components for Medium
  const hasReactHooks = /\buse[A-Z][a-zA-Z]*\s*\(/.test(content);

  // High: over 250 lines, OR contains dynamic patterns
  if (loc > 250 || hasDynamicPatterns) return 'high';
  // Medium: 100-250 lines, OR contains React hooks/components
  if (loc >= 100 || hasJsx || hasReactHooks) return 'medium';
  // Low: under 100 lines AND no dynamic patterns
  return 'low';
}

function resolveImportPath(fromFile: string, importPath: string, allFiles: Set<string>): string | null {
  // Resolve relative import path to an actual file in the tree
  const fromDir = fromFile.substring(0, fromFile.lastIndexOf('/'));
  let resolved = '';

  if (importPath.startsWith('./') || importPath.startsWith('../')) {
    const parts = fromDir.split('/');
    const importParts = importPath.split('/');

    for (const part of importParts) {
      if (part === '.') continue;
      if (part === '..') {
        parts.pop();
      } else {
        parts.push(part);
      }
    }
    resolved = parts.join('/');
  } else {
    return null; // Not a relative import
  }

  // Try various extensions
  const extensions = ['.js', '.jsx', '.ts', '.tsx', '/index.js', '/index.jsx', '/index.ts', '/index.tsx'];
  for (const ext of extensions) {
    const candidate = resolved + ext;
    if (allFiles.has(candidate)) return candidate;
  }

  // Try exact match (import already has extension)
  if (allFiles.has(resolved)) return resolved;

  return null;
}

function computeDepDepths(
  fileIds: string[],
  importedByMap: Map<string, Set<string>>
): Map<string, number> {
  // BFS from leaf nodes: files that import nothing (or only external modules)
  // dep_depth = 0 for leaves, 1 for files that only depend on leaves, etc.
  const depths = new Map<string, number>();
  const importsMap = new Map<string, Set<string>>(); // reverse of importedBy

  // Build forward dependency map (who does each file import?)
  for (const fileId of fileIds) {
    importsMap.set(fileId, new Set());
  }

  for (const [imported, importers] of importedByMap) {
    for (const importer of importers) {
      const deps = importsMap.get(importer);
      if (deps) deps.add(imported);
    }
  }

  // BFS: start with leaf nodes (files that have no local dependencies)
  const queue: string[] = [];
  for (const fileId of fileIds) {
    const deps = importsMap.get(fileId);
    if (!deps || deps.size === 0) {
      depths.set(fileId, 0);
      queue.push(fileId);
    }
  }

  // Process: for each file, if all its dependencies have depths, its depth = max(dep depths) + 1
  let changed = true;
  let iteration = 0;
  const maxIterations = fileIds.length + 1;

  while (changed && iteration < maxIterations) {
    changed = false;
    iteration++;

    for (const fileId of fileIds) {
      if (depths.has(fileId)) continue;

      const deps = importsMap.get(fileId);
      if (!deps) continue;

      let allResolved = true;
      let maxDepth = 0;

      for (const dep of deps) {
        const depDepth = depths.get(dep);
        if (depDepth === undefined) {
          allResolved = false;
          break;
        }
        maxDepth = Math.max(maxDepth, depDepth);
      }

      if (allResolved) {
        depths.set(fileId, maxDepth + 1);
        changed = true;
      }
    }
  }

  // Any remaining files (circular deps) get max depth + 1
  const maxDepth = Math.max(0, ...Array.from(depths.values()));
  for (const fileId of fileIds) {
    if (!depths.has(fileId)) {
      depths.set(fileId, maxDepth + 1);
    }
  }

  return depths;
}

interface CommitResponse {
  sha: string;
  commit: { tree: { sha: string } };
}

export async function analyzeRepo(
  owner: string,
  repo: string,
  branch: string
): Promise<AnalysisResult> {
  console.log(`[analyzer] Starting analysis of ${owner}/${repo}@${branch}`);

  // 1. Resolve branch to commit (validates repo + branch exist, gives clearer errors)
  const commitsUrl = `/repos/${owner}/${repo}/commits/${encodeURIComponent(branch)}`;
  let treeSha: string;
  try {
    console.log(`[analyzer] Fetching commits: ${commitsUrl}`);
    const commit = await githubFetchJson<CommitResponse>(commitsUrl);
    treeSha = commit?.commit?.tree?.sha;
    if (!treeSha) {
      console.error('[analyzer] Unexpected commit response:', JSON.stringify(commit).slice(0, 500));
      throw new Error(`GitHub returned an unexpected commit structure for ${owner}/${repo}@${branch}. The repo may be empty or in an unusual state.`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('404')) {
      throw new Error(
        `Repository or branch not found (404 on ${commitsUrl}). Check that "${owner}/${repo}" exists, your token has access (fine-grained tokens must include this repo), and branch "${branch}" is correct.`
      );
    }
    throw err;
  }

  // 2. Get repo tree
  const treeUrl = `/repos/${owner}/${repo}/git/trees/${treeSha}?recursive=1`;
  let tree: TreeResponse;
  try {
    console.log(`[analyzer] Fetching tree for sha ${treeSha.slice(0, 7)}...`);
    tree = await githubFetchJson<TreeResponse>(treeUrl);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('404')) {
      throw new Error(
        `Git tree not found (404). This can happen if the repo has no files yet, or the commit structure is unusual. Try adding a file (e.g. README) to the repo and retry.`
      );
    }
    throw err;
  }

  if (tree.truncated) {
    console.warn('[analyzer] Tree was truncated — very large repo');
  }

  // 3. Filter for .js/.jsx files under src/
  const jsFiles = tree.tree.filter(item =>
    item.type === 'blob' && shouldInclude(item.path)
  );

  // 3b. Find already-converted files (.ts/.tsx exist; original .js/.jsx may be deleted)
  const convertedPaths = new Set<string>();
  for (const item of tree.tree) {
    if (item.type === 'blob' && isConvertedTsFile(item.path)) {
      const originalPath = item.path.replace(/\.tsx$/, '.jsx').replace(/\.ts$/, '.js');
      convertedPaths.add(originalPath);
    }
  }

  // 3c. Fetch open PRs and map branch names to files (ts-migrate/* pattern)
  const prMap = new Map<string, { url: string; number: number }>();
  try {
    const prs = await githubFetchJson<Array<{ head: { ref: string }; html_url: string; number: number }>>(
      `/repos/${owner}/${repo}/pulls?state=open&base=${encodeURIComponent(branch)}&per_page=100`
    );
    const jsPathSet = new Set(jsFiles.map(f => f.path));
    for (const pr of prs) {
      const filePath = branchToFilePath(pr.head.ref, jsPathSet);
      if (filePath) {
        prMap.set(filePath, { url: pr.html_url, number: pr.number });
      }
    }
    if (prMap.size > 0) {
      console.log(`[analyzer] Found ${prMap.size} open PR(s) for migration files`);
    }
  } catch (err) {
    console.warn('[analyzer] Could not fetch open PRs:', err instanceof Error ? err.message : err);
  }

  console.log(`[analyzer] Found ${jsFiles.length} JS/JSX files to analyze, ${convertedPaths.size} already converted`);

  if (jsFiles.length === 0 && convertedPaths.size === 0) {
    return { totalFiles: 0, byComplexity: {}, byDepth: {}, files: [] };
  }

  const allFilePaths = new Set(jsFiles.map(f => f.path));

  // 4. Fetch content and analyze each file
  const fileDataMap = new Map<string, { content: string; loc: number; imports: string[]; hasJsx: boolean }>();

  for (const file of jsFiles) {
    try {
      const contentResp = await githubFetchJson<FileContentResponse>(
        `/repos/${owner}/${repo}/contents/${file.path}?ref=${branch}`
      );

      const content = Buffer.from(contentResp.content, 'base64').toString('utf-8');
      const lines = content.split('\n');
      const loc = lines.filter(l => l.trim().length > 0).length;
      const imports = parseImports(content);
      const hasJsx = detectJsx(content);

      fileDataMap.set(file.path, { content, loc, imports, hasJsx });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[analyzer] Failed to fetch ${file.path}: ${msg}`);
      logError('analyzer', `Failed to fetch ${file.path}`, msg);
      // Use minimal data
      fileDataMap.set(file.path, { content: '', loc: 0, imports: [], hasJsx: false });
    }
  }

  // 5. Build dependency graph
  const importedByMap = new Map<string, Set<string>>();
  for (const filePath of allFilePaths) {
    importedByMap.set(filePath, new Set());
  }

  for (const [filePath, data] of fileDataMap) {
    for (const imp of data.imports) {
      const resolved = resolveImportPath(filePath, imp, allFilePaths);
      if (resolved) {
        const importers = importedByMap.get(resolved);
        if (importers) importers.add(filePath);
      }
    }
  }

  // 6. Compute dep depths
  const fileIds = Array.from(allFilePaths);
  const depDepths = computeDepDepths(fileIds, importedByMap);

  // 7. Build analyzed files
  const analyzedFiles: AnalyzedFile[] = [];

  for (const filePath of fileIds) {
    const data = fileDataMap.get(filePath);
    if (!data) continue;

    const importCount = data.imports.length;
    const importedBySet = importedByMap.get(filePath);
    const importedBy = importedBySet ? importedBySet.size : 0;
    const depDepth = depDepths.get(filePath) || 0;
    const complexity = classifyComplexity(data.loc, data.content, data.hasJsx);

    const prInfo = prMap.get(filePath);
    const alreadyConverted = convertedPaths.has(filePath);

    analyzedFiles.push({
      id: filePath,
      path: filePath,
      loc: data.loc,
      importCount,
      importedBy,
      depDepth,
      complexity,
      hasJsx: data.hasJsx,
      ...(alreadyConverted && { initialStatus: 'merged' as const }),
      ...(prInfo && !alreadyConverted && { initialStatus: 'pr_open' as const, prUrl: prInfo.url, prNumber: prInfo.number }),
    });
  }

  // 7b. Add already-converted files (exist as .ts/.tsx, original .js deleted)
  for (const originalPath of convertedPaths) {
    if (allFilePaths.has(originalPath)) continue; // Already in list (both .js and .ts exist)
    analyzedFiles.push({
      id: originalPath,
      path: originalPath,
      loc: 0,
      importCount: 0,
      importedBy: 0,
      depDepth: 0,
      complexity: 'low',
      hasJsx: originalPath.endsWith('.jsx'),
      initialStatus: 'merged',
    });
  }

  // Sort by dep_depth ASC, then complexity, then loc
  analyzedFiles.sort((a, b) => {
    if (a.depDepth !== b.depDepth) return a.depDepth - b.depDepth;
    const cOrder = { low: 0, medium: 1, high: 2 };
    if (cOrder[a.complexity] !== cOrder[b.complexity]) return cOrder[a.complexity] - cOrder[b.complexity];
    return a.loc - b.loc;
  });

  // Compute summaries
  const byComplexity: Record<string, number> = {};
  const byDepth: Record<string, number> = {};
  for (const f of analyzedFiles) {
    byComplexity[f.complexity] = (byComplexity[f.complexity] || 0) + 1;
    const depKey = String(f.depDepth);
    byDepth[depKey] = (byDepth[depKey] || 0) + 1;
  }

  console.log(`[analyzer] Analysis complete: ${analyzedFiles.length} files`);

  return {
    totalFiles: analyzedFiles.length,
    byComplexity,
    byDepth,
    files: analyzedFiles,
  };
}

function getRepoId(owner: string, repo: string, branch: string): string {
  return `${owner}/${repo}:${branch}`;
}

function getCurrentRepoConfig(): { owner: string; repo: string; branch: string; repoId: string } | null {
  const db = getDb();
  const row = db.prepare('SELECT owner, repo, branch FROM repo_config WHERE id = 1').get() as
    | { owner: string; repo: string; branch: string }
    | undefined;
  return row && row.owner && row.repo
    ? { ...row, repoId: getRepoId(row.owner, row.repo, row.branch) }
    : null;
}

export function saveAnalysisToDb(
  owner: string,
  repo: string,
  branch: string,
  files: AnalyzedFile[]
): void {
  const db = getDb();
  const repoId = getRepoId(owner, repo, branch);
  const current = getCurrentRepoConfig();
  const hasExistingData = (db.prepare('SELECT 1 FROM files WHERE repo_id = ? LIMIT 1').get(repoId) as unknown) != null;
  // Merge when this is the current repo OR we already have data (e.g. switching back) — avoids wiping sessions
  const isSameRepo = (current && current.repoId === repoId) || hasExistingData;

  const transaction = db.transaction(() => {
    const existingConfig = db.prepare('SELECT auto_progress FROM repo_config WHERE id = 1').get() as
      | { auto_progress: number }
      | undefined;
    const autoProgress = existingConfig?.auto_progress ?? 0;

    db.prepare(
      "INSERT OR REPLACE INTO repo_config (id, owner, repo, branch, repo_id, auto_progress, analyzed_at) VALUES (1, ?, ?, ?, ?, ?, datetime('now'))"
    ).run(owner, repo, branch, repoId, autoProgress);

    db.prepare(
      "INSERT OR REPLACE INTO repos (id, owner, repo, branch, auto_progress, analyzed_at) VALUES (?, ?, ?, ?, ?, datetime('now'))"
    ).run(repoId, owner, repo, branch, autoProgress);

    if (isSameRepo) {
      const existingRows = db.prepare('SELECT id, path, status, pr_url, pr_number FROM files WHERE repo_id = ?').all(repoId) as {
        id: string;
        path: string;
        status: string;
        pr_url: string | null;
        pr_number: number | null;
      }[];
      const existingByPath = new Map(existingRows.map((r) => [r.path, r]));
      const newPaths = new Set(files.map((f) => f.path));

      const insertFile = db.prepare(
        `INSERT INTO files (id, repo_id, path, status, complexity, loc, import_count, imported_by, dep_depth, pr_url, pr_number, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
      );
      const updateFile = db.prepare(
        `UPDATE files SET complexity = ?, loc = ?, import_count = ?, imported_by = ?, dep_depth = ?, updated_at = datetime('now') WHERE id = ?`
      );
      const updateFileWithStatus = db.prepare(
        `UPDATE files SET status = ?, pr_url = ?, pr_number = ?, complexity = ?, loc = ?, import_count = ?, imported_by = ?, dep_depth = ?, updated_at = datetime('now') WHERE id = ?`
      );
      const deleteFile = db.prepare('DELETE FROM files WHERE id = ?');
      const deleteSessionsForFile = db.prepare('DELETE FROM devin_sessions WHERE file_id = ?');

      for (const file of files) {
        const status =
          file.initialStatus === 'merged'
            ? 'merged'
            : file.initialStatus === 'pr_open'
              ? 'pr_open'
              : null;
        const prUrl = file.prUrl ?? null;
        const prNumber = file.prNumber ?? null;

        const existing = existingByPath.get(file.path);
        if (existing) {
          if (status !== null) {
            updateFileWithStatus.run(
              status,
              prUrl,
              prNumber,
              file.complexity,
              file.loc,
              file.importCount,
              file.importedBy,
              file.depDepth,
              existing.id
            );
          } else {
            updateFile.run(
              file.complexity,
              file.loc,
              file.importCount,
              file.importedBy,
              file.depDepth,
              existing.id
            );
          }
        } else {
          const fileStatus = status ?? 'pending';
          const fileId = `${repoId}::${file.path}`;
          insertFile.run(
            fileId,
            repoId,
            file.path,
            fileStatus,
            file.complexity,
            file.loc,
            file.importCount,
            file.importedBy,
            file.depDepth,
            prUrl,
            prNumber
          );
        }
      }

      for (const path of existingByPath.keys()) {
        if (!newPaths.has(path)) {
          const row = existingByPath.get(path)!;
          deleteSessionsForFile.run(row.id);
          deleteFile.run(row.id);
        }
      }
    } else {
      // Different repo: only delete THIS repo's data, keep other repos
      db.prepare('DELETE FROM devin_sessions WHERE repo_id = ?').run(repoId);
      db.prepare('DELETE FROM files WHERE repo_id = ?').run(repoId);
      db.prepare('DELETE FROM batches WHERE repo_id = ?').run(repoId);
      db.prepare('DELETE FROM activity_log WHERE repo_id = ?').run(repoId);

      const insertFile = db.prepare(
        `INSERT INTO files (id, repo_id, path, status, complexity, loc, import_count, imported_by, dep_depth, pr_url, pr_number, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
      );

      for (const file of files) {
        const status =
          file.initialStatus === 'merged'
            ? 'merged'
            : file.initialStatus === 'pr_open'
              ? 'pr_open'
              : 'pending';
        const fileId = `${repoId}::${file.path}`;
        insertFile.run(
          fileId,
          repoId,
          file.path,
          status,
          file.complexity,
          file.loc,
          file.importCount,
          file.importedBy,
          file.depDepth,
          file.prUrl ?? null,
          file.prNumber ?? null
        );
      }

      db.prepare(
        "INSERT INTO activity_log (file_id, file_path, old_status, new_status, message, repo_id, created_at) VALUES (NULL, NULL, NULL, 'pending', ?, ?, datetime('now'))"
      ).run(`Analyzed ${owner}/${repo}@${branch} — ${files.length} files found`, repoId);
    }
  });

  transaction();
}
