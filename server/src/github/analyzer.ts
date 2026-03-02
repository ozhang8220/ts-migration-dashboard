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
];

function shouldInclude(filePath: string): boolean {
  if (!filePath.startsWith('src/')) return false;
  if (!/\.(js|jsx)$/.test(filePath)) return false;
  return !EXCLUDE_PATTERNS.some(p => p.test(filePath));
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
  // Dynamic pattern detection for HIGH complexity
  const dynamicPatterns = [
    /\[[\w]+\]/,               // computed property access [variable]
    /\.reduce\s*\(/,           // .reduce( on arrays (potential function composition)
    /typeof\s+\w+\s*===?\s*['"]function['"]/,  // typeof plugin === 'function'
    /eval\s*\(/,               // eval()
    /new\s+Function\s*\(/,     // new Function()
    /Object\.defineProperty/,  // monkey-patching
    /Object\.assign\s*\(\s*\w+\.prototype/,  // prototype extension
    /history\.\w+\s*=/,        // history override
    /Proxy\s*\(/,              // Proxy usage
    /Symbol\./,                // Symbol usage for meta-programming
  ];

  const hasDynamicPatterns = dynamicPatterns.some(p => p.test(content));

  if (loc > 250 || hasDynamicPatterns) return 'high';
  if (loc >= 100 || hasJsx) return 'medium';
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

export async function analyzeRepo(
  owner: string,
  repo: string,
  branch: string
): Promise<AnalysisResult> {
  console.log(`[analyzer] Starting analysis of ${owner}/${repo}@${branch}`);

  // 1. Get repo tree
  const tree = await githubFetchJson<TreeResponse>(
    `/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`
  );

  if (tree.truncated) {
    console.warn('[analyzer] Tree was truncated — very large repo');
  }

  // 2. Filter for .js/.jsx files under src/
  const jsFiles = tree.tree.filter(item =>
    item.type === 'blob' && shouldInclude(item.path)
  );

  console.log(`[analyzer] Found ${jsFiles.length} JS/JSX files to analyze`);

  if (jsFiles.length === 0) {
    return { totalFiles: 0, byComplexity: {}, byDepth: {}, files: [] };
  }

  const allFilePaths = new Set(jsFiles.map(f => f.path));

  // 3. Fetch content and analyze each file
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

  // 4. Build dependency graph
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

  // 5. Compute dep depths
  const fileIds = Array.from(allFilePaths);
  const depDepths = computeDepDepths(fileIds, importedByMap);

  // 6. Build analyzed files
  const analyzedFiles: AnalyzedFile[] = [];

  for (const filePath of fileIds) {
    const data = fileDataMap.get(filePath);
    if (!data) continue;

    const importCount = data.imports.length;
    const importedBySet = importedByMap.get(filePath);
    const importedBy = importedBySet ? importedBySet.size : 0;
    const depDepth = depDepths.get(filePath) || 0;
    const complexity = classifyComplexity(data.loc, data.content, data.hasJsx);

    analyzedFiles.push({
      id: filePath,
      path: filePath,
      loc: data.loc,
      importCount,
      importedBy,
      depDepth,
      complexity,
      hasJsx: data.hasJsx,
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

export function saveAnalysisToDb(
  owner: string,
  repo: string,
  branch: string,
  files: AnalyzedFile[]
): void {
  const db = getDb();

  const transaction = db.transaction(() => {
    // Clear existing files and related data
    db.exec("DELETE FROM files");
    db.exec("DELETE FROM devin_sessions");
    db.exec("DELETE FROM batches");
    db.exec("DELETE FROM activity_log");

    // Save repo config (upsert)
    db.prepare(
      "INSERT OR REPLACE INTO repo_config (id, owner, repo, branch, analyzed_at) VALUES (1, ?, ?, ?, datetime('now'))"
    ).run(owner, repo, branch);

    // Insert files
    const insertFile = db.prepare(
      `INSERT INTO files (id, path, status, complexity, loc, import_count, imported_by, dep_depth, created_at, updated_at)
       VALUES (?, ?, 'pending', ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
    );

    for (const file of files) {
      insertFile.run(file.id, file.path, file.complexity, file.loc, file.importCount, file.importedBy, file.depDepth);
    }

    // Log activity
    const insertActivity = db.prepare(
      "INSERT INTO activity_log (file_id, file_path, old_status, new_status, message, created_at) VALUES (?, ?, NULL, 'pending', ?, datetime('now'))"
    );

    insertActivity.run(null, null, `Analyzed ${owner}/${repo}@${branch} — ${files.length} files found`);
  });

  transaction();
}
