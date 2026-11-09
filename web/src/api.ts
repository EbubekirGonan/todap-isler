export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

// Sunucu yanıtındaki { error } alanını okur; yoksa genel bir mesaj kullanır.
export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(path, { ...init, headers, credentials: 'same-origin' });
  if (response.status === 204) {
    return undefined as T;
  }

  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      typeof data === 'object' && data !== null && 'error' in data && typeof data.error === 'string'
        ? data.error
        : 'İstek tamamlanamadı. Tekrar deneyin.';
    throw new ApiError(response.status, message);
  }
  return data as T;
}

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
};

export type Team = {
  id: string;
  name: string;
  description: string | null;
  type: 'term' | 'ongoing';
  term_start: string | null;
  term_end: string | null;
  role_title: string | null;
};

export function requestLoginCode(email: string): Promise<void> {
  return request('/api/auth/request', { method: 'POST', body: JSON.stringify({ email }) });
}

export function verifyLoginLink(token: string): Promise<void> {
  return request('/api/auth/verify-link', { method: 'POST', body: JSON.stringify({ token }) });
}

export function verifyLoginCode(email: string, code: string): Promise<void> {
  return request('/api/auth/verify-code', { method: 'POST', body: JSON.stringify({ email, code }) });
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  try {
    const data = await request<{ user: CurrentUser }>('/api/auth/me');
    return data.user;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return null;
    }
    throw error;
  }
}

export function logout(): Promise<void> {
  return request('/api/auth/logout', { method: 'POST' });
}

export async function getMyTeams(): Promise<Team[]> {
  const data = await request<{ teams: Team[] }>('/api/teams/mine');
  return data.teams;
}
