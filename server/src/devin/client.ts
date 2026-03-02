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
