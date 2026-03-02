import { logError } from '../database';

const DEVIN_API_BASE_URL = process.env.DEVIN_API_BASE_URL || 'https://api.devin.ai/v1';

function getToken(): string {
  const token = process.env.DEVIN_API_TOKEN;
  if (!token) {
    throw new Error('Devin API token not configured');
  }
  return token;
}

interface CreateSessionResponse {
  session_id: string;
  url: string;
}

interface GetSessionResponse {
  session_id: string;
  status_enum: string;
  url: string;
  structured_output?: Record<string, unknown>;
  title?: string;
  created_at?: string;
  updated_at?: string;
}

export async function createSession(prompt: string): Promise<CreateSessionResponse> {
  const token = getToken();

  const response = await fetch(`${DEVIN_API_BASE_URL}/sessions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prompt }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Devin API createSession failed (${response.status}): ${errorBody}`);
  }

  const data = await response.json() as CreateSessionResponse;
  return data;
}

/**
 * Create a Devin session with exponential backoff retry.
 * Retries up to maxRetries times with delays of 2s, 4s, 8s.
 */
export async function createSessionWithRetry(
  prompt: string,
  maxRetries: number = 3
): Promise<CreateSessionResponse> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await createSession(prompt);
      return response;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);

      if (attempt === maxRetries) {
        logError('devin_api', `createSession failed after ${maxRetries} attempts`, errorMsg);
        throw err;
      }

      const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
      console.error(`[devin-client] Attempt ${attempt} failed, retrying in ${delay}ms: ${errorMsg}`);
      logError('devin_api', `createSession attempt ${attempt} failed, retrying`, errorMsg);
      await new Promise(r => setTimeout(r, delay));
    }
  }

  // Unreachable but TypeScript needs it
  throw new Error('createSessionWithRetry: unreachable');
}

export async function getSession(sessionId: string): Promise<GetSessionResponse> {
  const token = getToken();

  const response = await fetch(`${DEVIN_API_BASE_URL}/sessions/${sessionId}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Devin API getSession failed (${response.status}): ${errorBody}`);
  }

  const data = await response.json() as GetSessionResponse;
  return data;
}

export function isDevinConfigured(): boolean {
  return !!process.env.DEVIN_API_TOKEN;
}
