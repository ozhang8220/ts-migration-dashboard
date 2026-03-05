import { logError } from '../database';

let rateLimitRemaining: number | null = null;
let rateLimitReset: number | null = null;
let rateLimitTotal: number | null = null;

export interface RateLimitInfo {
  remaining: number | null;
  total: number | null;
  resetsAt: string | null;
}

export function getRateLimitInfo(): RateLimitInfo {
  return {
    remaining: rateLimitRemaining,
    total: rateLimitTotal,
    resetsAt: rateLimitReset ? new Date(rateLimitReset * 1000).toISOString() : null,
  };
}

function getGitHubToken(): string | null {
  return process.env.GITHUB_TOKEN || null;
}

function updateRateLimit(headers: Headers): void {
  const remaining = headers.get('x-ratelimit-remaining');
  const reset = headers.get('x-ratelimit-reset');
  const limit = headers.get('x-ratelimit-limit');

  if (remaining !== null) rateLimitRemaining = parseInt(remaining, 10);
  if (reset !== null) rateLimitReset = parseInt(reset, 10);
  if (limit !== null) rateLimitTotal = parseInt(limit, 10);

  if (rateLimitRemaining !== null && rateLimitRemaining < 100) {
    console.warn(`[github-api] Rate limit warning: ${rateLimitRemaining} remaining`);
  }
}

function isRateLimited(): boolean {
  if (rateLimitRemaining !== null && rateLimitRemaining === 0 && rateLimitReset !== null) {
    const now = Math.floor(Date.now() / 1000);
    if (now < rateLimitReset) {
      console.warn(`[github-api] Rate limited until ${new Date(rateLimitReset * 1000).toISOString()}`);
      return true;
    }
  }
  return false;
}

export async function githubFetch(urlPath: string, init: RequestInit = {}): Promise<Response> {
  const token = getGitHubToken();
  if (!token) {
    throw new Error('GITHUB_TOKEN not configured');
  }

  if (isRateLimited()) {
    throw new Error(`GitHub API rate limited. Resets at ${new Date(rateLimitReset! * 1000).toISOString()}`);
  }

  const url = urlPath.startsWith('https://') ? urlPath : `https://api.github.com${urlPath}`;

  const extraHeaders = (init.headers || {}) as Record<string, string>;
  const response = await fetch(url, {
    ...init,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'ts-migration-dashboard',
      ...extraHeaders,
    },
  });

  updateRateLimit(response.headers);

  if (!response.ok) {
    const body = await response.text();
    logError('github_api', `GitHub API error ${response.status}: ${urlPath}`, body);
    throw new Error(`GitHub API error (${response.status}): ${body}`);
  }

  return response;
}

export async function githubFetchJson<T>(urlPath: string): Promise<T> {
  const response = await githubFetch(urlPath);
  return response.json() as Promise<T>;
}

function extractGitHubUsername(assignee: string): string {
  const trimmed = assignee.trim();
  const sep = ' - ';
  const idx = trimmed.lastIndexOf(sep);
  if (idx >= 0) return trimmed.slice(idx + sep.length).trim();
  return trimmed;
}

export async function assignPullRequestAssignee(
  owner: string,
  repo: string,
  prNumber: number,
  assignee: string
): Promise<void> {
  const username = extractGitHubUsername(assignee);
  if (!username) return;

  await githubFetch(`/repos/${owner}/${repo}/issues/${prNumber}/assignees`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ assignees: [username] }),
  });
}

export function isGitHubConfigured(): boolean {
  return !!process.env.GITHUB_TOKEN;
}
