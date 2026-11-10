import type pg from "pg";
import { query, withTransaction } from "../db.js";
import { HttpError } from "../http-error.js";
import { activeTeamIds, canJoinTask, isActiveTeamMember, poolSql, scopeSql, visibleToUserSql, type TaskScope } from "../policy/visibility.js";

export const TASK_STATUSES = ["planning", "in_progress", "nearly_done", "done"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export type NewTaskInput = {
  title: string;
  description: string | null;
  projectId: string | null;
  teamId: string | null;
  dueDate: string | null;
  targetDate: string | null;
  estimatedPeople: number;
  teamOnly: boolean;
};

export type TaskPatch = Partial<{
  title: string;
  description: string | null;
  status: TaskStatus;
  dueDate: string | null;
  targetDate: string | null;
  estimatedPeople: number;
  teamOnly: boolean;
  teamId: string | null;
  projectId: string | null;
}>;

export type TaskFilters = {
  view: "all" | "mine" | "pool";
  scope: TaskScope;
  status?: TaskStatus;
  projectId?: string;
  // Yalnızca bu ekibe bağlı görevler (ekip sekmesi).
  teamId?: string;
  // Durum verilmemişse varsayılan olarak tamamlananlar gizlenir; bu bayrak onları da ekler.
  includeDone?: boolean;
  // Yalnızca tahmini kişi sayısına ulaşılmamış görevler (kişi aranıyor).
  seeking?: boolean;
  // Varsayılan termin sıralaması; "changed" son değişiklik tarihine göre en yeni önce sıralar.
  sort?: "due" | "changed";
  // Yalnızca tamamlanmamış ve termin tarihi bugünden (Europe/Istanbul) önce olan görevler.
  overdue?: boolean;
};

type AssignmentRow = { userId: string; name: string; role: string; source: string };

type TaskRow = {
  id: string;
  project_id: string | null;
  team_id: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  due_date: string | null;
  target_date: string | null;
  completed_at: Date | null;
  estimated_people: number;
  team_only: boolean;
  created_by: string;
  created_at: Date;
  updated_at: Date;
  last_activity_at: Date;
  project_name: string | null;
  team_name: string | null;
  parent_task_id: string | null;
  parent_title: string | null;
  assignments: AssignmentRow[];
};

// Kilitleme ve güncelleme için kullanılan ham görev satırı.
type TaskBaseRow = {
  id: string;
  project_id: string | null;
  team_id: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  due_date: string | null;
  target_date: string | null;
  team_only: boolean;
  estimated_people: number;
};

const TASK_SELECT = `
  SELECT t.id, t.project_id, t.team_id, t.title, t.description, t.status, t.due_date, t.target_date,
         t.completed_at, t.estimated_people, t.team_only, t.created_by, t.created_at, t.updated_at, t.last_activity_at,
         p.name AS project_name, tm.name AS team_name,
         t.parent_task_id, parent.title AS parent_title,
         COALESCE((
           SELECT json_agg(json_build_object('userId', u.id::text, 'name', u.name, 'role', a.role, 'source', a.source)
                           ORDER BY a.role, a.started_at)
             FROM task_assignments a
             JOIN users u ON u.id = a.user_id
            WHERE a.task_id = t.id AND a.ended_at IS NULL
         ), '[]'::json) AS assignments
    FROM tasks t
    LEFT JOIN projects p ON p.id = t.project_id
    LEFT JOIN teams tm ON tm.id = t.team_id
    LEFT JOIN tasks parent ON parent.id = t.parent_task_id`;

// Ürün kuralları: görev düzenlenebilir ve silinebilir (herkes), ekibe özel görevlere yalnızca ekip üyeleri katılabilir.
// Katkı sağlayan (owner) kişi sayısı tahmini gerekli kişi sayısını geçemez; destek (support) kaydı sayılmaz.
function toTaskDto(row: TaskRow, teamIds: Set<string>) {
  return {
    id: row.id,
    projectId: row.project_id,
    projectName: row.project_name,
    teamId: row.team_id,
    teamName: row.team_name,
    parentTaskId: row.parent_task_id,
    parentTitle: row.parent_title,
    title: row.title,
    description: row.description,
    status: row.status,
    dueDate: row.due_date,
    targetDate: row.target_date,
    completedAt: row.completed_at,
    estimatedPeople: row.estimated_people,
    teamOnly: row.team_only,
    canJoin: canJoinTask(row, teamIds),
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastActivityAt: row.last_activity_at,
    assignments: row.assignments,
  };
}

// Aktif katkı sağlayan kişi sayısı. Görev tablosu üzerinde çalışan sorgularda t.id ile kullanılır.
const OWNER_COUNT_SQL = `(SELECT COUNT(*) FROM task_assignments a
                           WHERE a.task_id = t.id AND a.role = 'owner' AND a.ended_at IS NULL)`;

export async function listTasks(userId: string, filters: TaskFilters) {
  const params: unknown[] = [];
  const bind = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };
  const conditions = [visibleToUserSql(), scopeSql(filters.scope, filters.scope === "mine-team" ? bind(userId) : "NULL")];

  if (filters.view === "mine") {
    conditions.push(
      `EXISTS (SELECT 1 FROM task_assignments a WHERE a.task_id = t.id AND a.user_id = ${bind(userId)} AND a.ended_at IS NULL)`,
    );
  }
  if (filters.view === "pool" && filters.scope !== "mine-team") {
    conditions.push(poolSql());
  }
  if (filters.view === "pool" || filters.seeking) {
    conditions.push(`${OWNER_COUNT_SQL} < t.estimated_people`);
  }

  if (filters.status) {
    conditions.push(`t.status = ${bind(filters.status)}`);
  } else if (!filters.includeDone) {
    conditions.push("t.status <> 'done'");
  }
  if (filters.projectId) {
    conditions.push(`t.project_id = ${bind(filters.projectId)}`);
  }
  if (filters.teamId) {
    conditions.push(`t.team_id = ${bind(filters.teamId)}`);
  }

  if (filters.overdue) {
    conditions.push("t.status <> 'done' AND t.due_date < (now() AT TIME ZONE 'Europe/Istanbul')::date");
  }

  const teamIds = await activeTeamIds(userId);
  const order =
    filters.sort === "changed"
      ? "t.last_activity_at DESC, t.id DESC"
      : // En gecikmişten başlayan sıralama: en erken son tarih önce, tarihsizler sonda.
        "t.due_date ASC NULLS LAST, t.created_at ASC, t.id ASC";
  const result = await query<TaskRow>(
    `${TASK_SELECT}
      WHERE ${conditions.join(" AND ")}
      ORDER BY ${order}`,
    params,
  );
  return result.rows.map((row) => toTaskDto(row, teamIds));
}

export async function getTask(userId: string, taskId: string) {
  const result = await query<TaskRow>(`${TASK_SELECT} WHERE t.id = $1 AND ${visibleToUserSql()}`, [taskId]);
  const row = result.rows[0];
  if (!row) {
    return null;
  }

  const comments = await query(
    `SELECT c.id, c.body, c.created_at, u.name AS author_name
       FROM task_comments c
       JOIN users u ON u.id = c.user_id
      WHERE c.task_id = $1
      ORDER BY c.created_at, c.id`,
    [taskId],
  );
  const history = await query(
    `SELECT h.field, h.old_value, h.new_value, h.created_at, u.name AS actor_name
       FROM task_history h
       JOIN users u ON u.id = h.user_id
      WHERE h.task_id = $1
      ORDER BY h.created_at, h.id`,
    [taskId],
  );

  return { ...toTaskDto(row, await activeTeamIds(userId)), comments: comments.rows, history: history.rows };
}

export async function createTask(userId: string, input: NewTaskInput): Promise<string> {
  if (input.teamOnly && !input.teamId) {
    throw new HttpError(400, "Ekibe özel görev için ekip seçmelisiniz.");
  }

  return withTransaction(async (client) => {
    await ensureProjectAndTeam(client, input.projectId, input.teamId);

    const result = await client.query<{ id: string }>(
      `INSERT INTO tasks (project_id, team_id, title, description, due_date, target_date, estimated_people,
                          team_only, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        input.projectId,
        input.teamId,
        input.title,
        input.description,
        input.dueDate,
        input.targetDate,
        input.estimatedPeople,
        input.teamOnly,
        userId,
      ],
    );
    const taskId = result.rows[0].id;
    await recordHistory(client, taskId, userId, "created", null, input.title);
    return taskId;
  });
}

export async function updateTask(userId: string, taskId: string, patch: TaskPatch): Promise<void> {
  await withTransaction(async (client) => {
    const current = await lockVisibleTask(client, userId, taskId);

    const next = {
      title: patch.title ?? current.title,
      description: "description" in patch ? (patch.description ?? null) : current.description,
      status: patch.status ?? current.status,
      dueDate: "dueDate" in patch ? (patch.dueDate ?? null) : current.due_date,
      targetDate: "targetDate" in patch ? (patch.targetDate ?? null) : current.target_date,
      estimatedPeople: patch.estimatedPeople ?? current.estimated_people,
      teamOnly: patch.teamOnly ?? current.team_only,
      teamId: "teamId" in patch ? (patch.teamId ?? null) : current.team_id,
      projectId: "projectId" in patch ? (patch.projectId ?? null) : current.project_id,
    };

    if (next.teamOnly && !next.teamId) {
      throw new HttpError(400, "Ekibe özel görev için ekip seçmelisiniz.");
    }
    await ensureProjectAndTeam(client, next.projectId, next.teamId);

    if (next.estimatedPeople < (await getOwnerCount(client, taskId))) {
      throw new HttpError(409, "Tahmini kişi sayısı, görevdeki katkı sağlayan kişi sayısından az olamaz.");
    }

    // Ekibe özel hale gelen ya da ekibi değişen görevde, mevcut atananlar yeni ekibin üyesi olmalıdır.
    if (next.teamOnly && (!current.team_only || next.teamId !== current.team_id)) {
      const outsider = await client.query(
        `SELECT 1
           FROM task_assignments a
          WHERE a.task_id = $1 AND a.ended_at IS NULL
            AND NOT EXISTS (
              SELECT 1 FROM team_members m
               WHERE m.team_id = $2 AND m.user_id = a.user_id AND m.ended_at IS NULL
            )
          LIMIT 1`,
        [taskId, next.teamId],
      );
      if (outsider.rowCount) {
        throw new HttpError(409, "Görevde bu ekibin üyesi olmayan biri atanmış. Önce ataması kaldırılmalı.");
      }
    }

    const changes: [string, string | null, string | null][] = [];
    const compare = (field: string, oldValue: unknown, newValue: unknown) => {
      const before = oldValue === null || oldValue === undefined ? null : String(oldValue);
      const after = newValue === null || newValue === undefined ? null : String(newValue);
      if (before !== after) {
        changes.push([field, before, after]);
      }
    };
    compare("title", current.title, next.title);
    compare("description", current.description, next.description);
    compare("status", current.status, next.status);
    compare("due_date", current.due_date, next.dueDate);
    compare("target_date", current.target_date, next.targetDate);
    compare("estimated_people", current.estimated_people, next.estimatedPeople);
    compare("team_only", current.team_only, next.teamOnly);
    compare("team_id", current.team_id, next.teamId);
    compare("project_id", current.project_id, next.projectId);

    if (changes.length === 0) {
      return;
    }

    const completedAtSql =
      next.status === "done" && current.status !== "done"
        ? "now()"
        : next.status !== "done" && current.status === "done"
          ? "NULL"
          : "completed_at";

    await client.query(
      `UPDATE tasks
          SET title = $2, description = $3, status = $4, due_date = $5, estimated_people = $6,
              team_only = $7, team_id = $8, project_id = $9, target_date = $10,
              completed_at = ${completedAtSql},
              updated_at = now(), last_activity_at = now()
        WHERE id = $1`,
      [
        taskId,
        next.title,
        next.description,
        next.status,
        next.dueDate,
        next.estimatedPeople,
        next.teamOnly,
        next.teamId,
        next.projectId,
        next.targetDate,
      ],
    );

    for (const [field, before, after] of changes) {
      await recordHistory(client, taskId, userId, field, before, after);
    }
  });
}

export async function deleteTask(userId: string, taskId: string): Promise<void> {
  await withTransaction(async (client) => {
    await lockVisibleTask(client, userId, taskId);
    await client.query(
      "UPDATE tasks SET deleted_at = now(), updated_at = now(), last_activity_at = now() WHERE id = $1",
      [taskId],
    );
    await recordHistory(client, taskId, userId, "deleted", null, "true");
  });
}

export async function claimTask(userId: string, taskId: string): Promise<void> {
  await withTransaction(async (client) => {
    const task = await lockVisibleTask(client, userId, taskId);
    if (task.status === "done") {
      throw new HttpError(409, "Tamamlanmış görev üstlenilemez.");
    }
    await assertCanJoin(client, task, userId, "Ekibe özel göreve yalnızca ekip üyeleri katkı sağlayabilir.");
    if (await isOwner(client, taskId, userId)) {
      throw new HttpError(409, "Bu görevde zaten katkı sağlıyorsunuz.");
    }
    if ((await getOwnerCount(client, taskId)) >= task.estimated_people) {
      throw new HttpError(409, "Bu görevde tahmini kişi sayısı dolu.");
    }

    const name = await getUserName(client, userId);
    // Kişi bu görevde destek olarak yer alıyorsa, katkı sağlayınca destek kaydı kapanır.
    await endAssignments(client, taskId, userId, userId, name);

    await client.query(
      `INSERT INTO task_assignments (task_id, user_id, role, source, assigned_by)
       VALUES ($1, $2, 'owner', 'claimed', NULL)`,
      [taskId, userId],
    );
    await recordHistory(client, taskId, userId, "owner", null, name);
    await touchTask(client, taskId);
  });
}

export async function releaseTask(userId: string, taskId: string): Promise<void> {
  await withTransaction(async (client) => {
    await lockVisibleTask(client, userId, taskId);
    const name = await getUserName(client, userId);
    const roles = await endAssignments(client, taskId, userId, userId, name);
    if (roles.length === 0) {
      throw new HttpError(409, "Bu görevde üstlenmiş biriniz yok.");
    }
    await touchTask(client, taskId);
  });
}

// Yönetici, bir görevdeki herhangi bir kişinin üstlenme ya da destek kaydını kapatır. Görünürlük kuralı admin için uygulanmaz.
export async function removeTaskAssignments(adminId: string, taskId: string, targetUserId: string): Promise<void> {
  await withTransaction(async (client) => {
    const task = await client.query("SELECT id FROM tasks WHERE id = $1 AND deleted_at IS NULL FOR UPDATE", [taskId]);
    if (!task.rowCount) {
      throw new HttpError(404, "Görev bulunamadı.");
    }
    const name = await getUserName(client, targetUserId);
    const roles = await endAssignments(client, taskId, targetUserId, adminId, name);
    if (roles.length === 0) {
      throw new HttpError(409, "Bu görevde bu kişinin aktif bir üstlenmesi yok.");
    }
    await touchTask(client, taskId);
  });
}

export async function supportTask(userId: string, taskId: string): Promise<void> {
  await withTransaction(async (client) => {
    const task = await lockVisibleTask(client, userId, taskId);
    if (task.status === "done") {
      throw new HttpError(409, "Tamamlanmış göreve destek olunamaz.");
    }
    await assertCanJoin(client, task, userId, "Ekibe özel göreve yalnızca ekip üyeleri destek olabilir.");
    const existing = await client.query(
      "SELECT 1 FROM task_assignments WHERE task_id = $1 AND user_id = $2 AND ended_at IS NULL",
      [taskId, userId],
    );
    if (existing.rowCount) {
      throw new HttpError(409, "Bu görevde zaten yer alıyorsunuz.");
    }

    const name = await getUserName(client, userId);
    await client.query(
      `INSERT INTO task_assignments (task_id, user_id, role, source, assigned_by)
       VALUES ($1, $2, 'support', 'claimed', NULL)`,
      [taskId, userId],
    );
    await recordHistory(client, taskId, userId, "support", null, name);
    await touchTask(client, taskId);
  });
}

// Görevi başka bir kişiye katkı sağlayan olarak ekler. Mevcut katkı sağlayanlar kalır; kapasite dolu değilse ekleme yapılır.
// Hedef kişinin varsa destek kaydı katkı kaydına dönüşür.
export async function assignTask(userId: string, taskId: string, targetUserId: string): Promise<void> {
  await withTransaction(async (client) => {
    const task = await lockVisibleTask(client, userId, taskId);
    if (task.status === "done") {
      throw new HttpError(409, "Tamamlanmış göreve atama yapılamaz.");
    }

    const target = await client.query<{ name: string; active: boolean }>(
      "SELECT name, active FROM users WHERE id = $1",
      [targetUserId],
    );
    const targetUser = target.rows[0];
    if (!targetUser || !targetUser.active) {
      throw new HttpError(400, "Atanacak kişi bulunamadı veya pasif.");
    }
    if (task.team_only && task.team_id && !(await isActiveTeamMember(client, task.team_id, targetUserId))) {
      throw new HttpError(400, "Ekibe özel görevlere yalnızca ekip üyeleri atanabilir.");
    }
    if (await isOwner(client, taskId, targetUserId)) {
      throw new HttpError(409, "Görev zaten bu kişide.");
    }
    if ((await getOwnerCount(client, taskId)) >= task.estimated_people) {
      throw new HttpError(409, "Bu görevde tahmini kişi sayısı dolu.");
    }

    await endAssignments(client, taskId, targetUserId, userId, targetUser.name);
    await client.query(
      `INSERT INTO task_assignments (task_id, user_id, role, source, assigned_by)
       VALUES ($1, $2, 'owner', 'assigned', $3)`,
      [taskId, targetUserId, userId],
    );
    await recordHistory(client, taskId, userId, "owner", null, targetUser.name);
    await touchTask(client, taskId);
  });
}

export async function addComment(userId: string, taskId: string, body: string): Promise<void> {
  await withTransaction(async (client) => {
    await lockVisibleTask(client, userId, taskId);
    await client.query("INSERT INTO task_comments (task_id, user_id, body) VALUES ($1, $2, $3)", [
      taskId,
      userId,
      body,
    ]);
    await touchTask(client, taskId);
  });
}

// Görevi görünürse kilitler. Görünmüyorsa 404 döner; böylece görevin varlığı da sızdırılmaz.
async function lockVisibleTask(client: pg.PoolClient, userId: string, taskId: string): Promise<TaskBaseRow> {
  const result = await client.query<TaskBaseRow>(
    `SELECT t.id, t.project_id, t.team_id, t.title, t.description, t.status, t.due_date,
            t.team_only, t.estimated_people
       FROM tasks t
      WHERE t.id = $1 AND ${visibleToUserSql()}
      FOR UPDATE OF t`,
    [taskId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new HttpError(404, "Görev bulunamadı.");
  }
  return row;
}

// Ekibe özel görevlerde katılımı yalnızca o ekibin aktif üyeleri yapabilir. Üye değilse 409 döner.
async function assertCanJoin(
  client: pg.PoolClient,
  task: TaskBaseRow,
  userId: string,
  message: string,
): Promise<void> {
  if (!task.team_only) {
    return;
  }
  if (!task.team_id || !(await isActiveTeamMember(client, task.team_id, userId))) {
    throw new HttpError(409, message);
  }
}

async function ensureProjectAndTeam(
  client: pg.PoolClient,
  projectId: string | null,
  teamId: string | null,
): Promise<void> {
  if (projectId) {
    const project = await client.query("SELECT 1 FROM projects WHERE id = $1", [projectId]);
    if (!project.rowCount) {
      throw new HttpError(400, "Proje bulunamadı.");
    }
  }
  if (teamId) {
    const team = await client.query("SELECT 1 FROM teams WHERE id = $1", [teamId]);
    if (!team.rowCount) {
      throw new HttpError(400, "Ekip bulunamadı.");
    }
  }
}

async function getOwnerCount(client: pg.PoolClient, taskId: string): Promise<number> {
  const result = await client.query<{ count: string }>(
    "SELECT COUNT(*)::text AS count FROM task_assignments WHERE task_id = $1 AND role = 'owner' AND ended_at IS NULL",
    [taskId],
  );
  return Number(result.rows[0].count);
}

async function isOwner(client: pg.PoolClient, taskId: string, userId: string): Promise<boolean> {
  const result = await client.query(
    "SELECT 1 FROM task_assignments WHERE task_id = $1 AND user_id = $2 AND role = 'owner' AND ended_at IS NULL",
    [taskId, userId],
  );
  return (result.rowCount ?? 0) > 0;
}

async function getUserName(client: pg.PoolClient, userId: string): Promise<string> {
  const result = await client.query<{ name: string }>("SELECT name FROM users WHERE id = $1", [userId]);
  return result.rows[0]?.name ?? "";
}

// Kişinin görevdeki aktif kayıtlarını kapatır ve her biri için geçmiş yazar. Kapatılan rollerin listesini döner.
async function endAssignments(
  client: pg.PoolClient,
  taskId: string,
  targetUserId: string,
  actorId: string,
  name: string,
): Promise<string[]> {
  const result = await client.query<{ role: string }>(
    `UPDATE task_assignments SET ended_at = now()
      WHERE task_id = $1 AND user_id = $2 AND ended_at IS NULL
      RETURNING role`,
    [taskId, targetUserId],
  );
  for (const row of result.rows) {
    await recordHistory(client, taskId, actorId, row.role, name, null);
  }
  return result.rows.map((row) => row.role);
}

async function recordHistory(
  client: pg.PoolClient,
  taskId: string,
  userId: string,
  field: string,
  oldValue: string | null,
  newValue: string | null,
): Promise<void> {
  await client.query(
    "INSERT INTO task_history (task_id, user_id, field, old_value, new_value) VALUES ($1, $2, $3, $4, $5)",
    [taskId, userId, field, oldValue, newValue],
  );
}

async function touchTask(client: pg.PoolClient, taskId: string): Promise<void> {
  await client.query("UPDATE tasks SET last_activity_at = now() WHERE id = $1", [taskId]);
}
