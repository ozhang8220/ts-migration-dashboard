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

export async function githubFetch(urlPath: string): Promise<Response> {
  const token = getGitHubToken();
  if (!token) {
    throw new Error('GITHUB_TOKEN not configured');
  }

  if (isRateLimited()) {
    throw new Error(`GitHub API rate limited. Resets at ${new Date(rateLimitReset! * 1000).toISOString()}`);
  }

  const url = urlPath.startsWith('https://') ? urlPath : `https://api.github.com${urlPath}`;

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'ts-migration-dashboard',
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

export function isGitHubConfigured(): boolean {
  return !!process.env.GITHUB_TOKEN;
}
