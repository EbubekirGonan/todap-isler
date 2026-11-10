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

export type TeamMember = {
  userId: string;
  name: string;
  roleTitle: string | null;
  startedAt: string;
};

export type TeamProjectSummary = {
  id: string;
  name: string;
  status: string;
  dueDate: string | null;
};

// Takım listesi ve detayı: kontenjan bilgisi ve katılım durumu dahil.
export type TeamSummary = {
  id: string;
  name: string;
  description: string | null;
  type: 'term' | 'ongoing';
  termStart: string | null;
  termEnd: string | null;
  requiredPeople: number;
  activeCount: number;
  openSlots: number;
  isMember: boolean;
  canJoin: boolean;
};

export type TeamDetail = TeamSummary & {
  members: TeamMember[];
  projects: TeamProjectSummary[];
};

export async function listTeams(): Promise<TeamSummary[]> {
  const data = await request<{ teams: TeamSummary[] }>('/api/teams');
  return data.teams;
}

export async function getTeam(teamId: string): Promise<TeamDetail> {
  const data = await request<{ team: TeamDetail }>(`/api/teams/${teamId}`);
  return data.team;
}

export function joinTeam(teamId: string): Promise<void> {
  return request(`/api/teams/${teamId}/join`, { method: 'POST' });
}

export function leaveTeam(teamId: string): Promise<void> {
  return request(`/api/teams/${teamId}/leave`, { method: 'POST' });
}

export async function updateTeamRequiredPeople(teamId: string, requiredPeople: number): Promise<TeamDetail> {
  const data = await request<{ team: TeamDetail }>(`/api/teams/${teamId}`, {
    method: 'PATCH',
    body: JSON.stringify({ requiredPeople }),
  });
  return data.team;
}

// Akış kaydı: görev hareketleri (kind 'task'), faaliyet ve ekip hareketleri.
export type FeedEntry = {
  kind: 'task' | 'project' | 'team';
  entityId: string;
  entityName: string;
  action: string | null;
  field: string | null;
  oldValue: string | null;
  newValue: string | null;
  userId: string;
  userName: string;
  createdAt: string;
};

export async function listFeed(before?: string): Promise<FeedEntry[]> {
  const params = new URLSearchParams({ limit: '50' });
  if (before) params.set('before', before);
  const data = await request<{ entries: FeedEntry[] }>(`/api/feed?${params.toString()}`);
  return data.entries;
}

export type TaskStatus = 'planning' | 'in_progress' | 'nearly_done' | 'done';

export type Assignment = {
  userId: string;
  name: string;
  role: 'owner' | 'support';
  source: string;
};

export type Task = {
  id: string;
  projectId: string | null;
  projectName: string | null;
  teamId: string | null;
  teamName: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  dueDate: string | null;
  targetDate: string | null;
  estimatedPeople: number;
  parentTaskId: string | null;
  parentTitle: string | null;
  teamOnly: boolean;
  // Ekibe özel görevlerde yalnızca ekip üyeleri katkı sağlayabilir ya da destek olabilir.
  canJoin: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string;
  assignments: Assignment[];
};

export type TaskComment = {
  id: string;
  body: string;
  created_at: string;
  author_name: string;
};

export type TaskHistoryEntry = {
  field: string;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
  actor_name: string;
};

export type TaskDetail = Task & {
  comments: TaskComment[];
  history: TaskHistoryEntry[];
};

export type UserOption = {
  id: string;
  name: string;
};

export type PoolScope = 'public' | 'mine-team';

export type NewTask = {
  title: string;
  description: string | null;
  teamId: string | null;
  teamOnly: boolean;
  estimatedPeople: number | null;
  dueDate: string | null;
};

export async function listMyTasks(): Promise<Task[]> {
  const data = await request<{ tasks: Task[] }>('/api/tasks/mine');
  return data.tasks;
}

export async function listPoolTasks(scope: PoolScope): Promise<Task[]> {
  const data = await request<{ tasks: Task[] }>(`/api/tasks/pool?scope=${scope}`);
  return data.tasks;
}

export async function getTask(taskId: string): Promise<TaskDetail> {
  const data = await request<{ task: TaskDetail }>(`/api/tasks/${taskId}`);
  return data.task;
}

export function createTask(input: NewTask): Promise<{ id: string }> {
  return request('/api/tasks', { method: 'POST', body: JSON.stringify(input) });
}

export function claimTask(taskId: string): Promise<void> {
  return request(`/api/tasks/${taskId}/claim`, { method: 'POST' });
}

export function supportTask(taskId: string): Promise<void> {
  return request(`/api/tasks/${taskId}/support`, { method: 'POST' });
}

export function releaseTask(taskId: string): Promise<void> {
  return request(`/api/tasks/${taskId}/release`, { method: 'POST' });
}

export type TaskPatch = {
  title?: string;
  description?: string | null;
  status?: TaskStatus;
  dueDate?: string | null;
  targetDate?: string | null;
  estimatedPeople?: number;
};

export function updateTask(taskId: string, patch: TaskPatch): Promise<void> {
  return request(`/api/tasks/${taskId}`, { method: 'PATCH', body: JSON.stringify(patch) });
}

export function assignTask(taskId: string, userId: string): Promise<void> {
  return request(`/api/tasks/${taskId}/assign`, { method: 'POST', body: JSON.stringify({ userId }) });
}

export function addTaskComment(taskId: string, body: string): Promise<void> {
  return request(`/api/tasks/${taskId}/comments`, { method: 'POST', body: JSON.stringify({ body }) });
}

export async function listUsers(): Promise<UserOption[]> {
  const data = await request<{ users: UserOption[] }>('/api/users');
  return data.users;
}

export type TaskListScope = 'all' | 'public' | 'mine-team';

export type TaskListFilters = {
  scope: TaskListScope;
  includeDone: boolean;
  seeking: boolean;
  sort?: 'due' | 'changed';
  overdue?: boolean;
};

export async function listAllTasks(filters: TaskListFilters): Promise<Task[]> {
  const params = new URLSearchParams({ scope: filters.scope });
  if (filters.includeDone) params.set('includeDone', 'true');
  if (filters.seeking) params.set('seeking', 'true');
  if (filters.sort === 'changed') params.set('sort', 'changed');
  if (filters.overdue) params.set('overdue', 'true');
  const data = await request<{ tasks: Task[] }>(`/api/tasks?${params.toString()}`);
  return data.tasks;
}

export type ProjectProgress = {
  total: number;
  done: number;
  percent: number;
  openCount: number;
};

// Faaliyet (sunucuda proje olarak tutulur).
export type Project = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  startDate: string | null;
  dueDate: string | null;
  teams: { id: string; name: string }[];
  progress: ProjectProgress;
};

export type NewProject = {
  name: string;
  description: string | null;
  startDate: string | null;
  dueDate: string | null;
  teamIds: string[];
};

export async function listProjects(): Promise<Project[]> {
  const data = await request<{ projects: Project[] }>('/api/projects');
  return data.projects;
}

export async function listProjectTasks(projectId: string): Promise<Task[]> {
  const data = await request<{ tasks: Task[] }>(`/api/projects/${projectId}/tasks`);
  return data.tasks;
}

export function createProject(input: NewProject): Promise<{ id: string }> {
  return request('/api/projects', { method: 'POST', body: JSON.stringify(input) });
}
