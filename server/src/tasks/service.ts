import type pg from "pg";
import { query, withTransaction } from "../db.js";
import { HttpError } from "../http-error.js";
import { isActiveTeamMember, scopeSql, visibleToUserSql, type TaskScope } from "../policy/visibility.js";

export type TaskStatus = "todo" | "doing" | "done";

export type NewTaskInput = {
  title: string;
  description: string | null;
  projectId: string | null;
  teamId: string | null;
  dueDate: string | null;
  needsAssignee: boolean;
  teamOnly: boolean;
};

export type TaskPatch = Partial<{
  title: string;
  description: string | null;
  status: TaskStatus;
  dueDate: string | null;
  needsAssignee: boolean;
  teamOnly: boolean;
  teamId: string | null;
  projectId: string | null;
}>;

export type TaskFilters = {
  view: "all" | "mine" | "pool";
  scope: TaskScope;
  status?: TaskStatus;
  projectId?: string;
  needsAssignee?: boolean;
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
  completed_at: Date | null;
  needs_assignee: boolean;
  team_only: boolean;
  created_by: string;
  created_at: Date;
  updated_at: Date;
  last_activity_at: Date;
  project_name: string | null;
  team_name: string | null;
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
  team_only: boolean;
  needs_assignee: boolean;
};

const TASK_SELECT = `
  SELECT t.id, t.project_id, t.team_id, t.title, t.description, t.status, t.due_date, t.completed_at,
         t.needs_assignee, t.team_only, t.created_by, t.created_at, t.updated_at, t.last_activity_at,
         p.name AS project_name, tm.name AS team_name,
         COALESCE((
           SELECT json_agg(json_build_object('userId', u.id::text, 'name', u.name, 'role', a.role, 'source', a.source)
                           ORDER BY a.role, a.started_at)
             FROM task_assignments a
             JOIN users u ON u.id = a.user_id
            WHERE a.task_id = t.id AND a.ended_at IS NULL
         ), '[]'::json) AS assignments
    FROM tasks t
    LEFT JOIN projects p ON p.id = t.project_id
    LEFT JOIN teams tm ON tm.id = t.team_id`;

// Ürün kuralları: görev düzenlenebilir ve silinebilir (herkes), ekibe özel görevlere yalnızca ekip üyeleri atanabilir.
function toTaskDto(row: TaskRow) {
  return {
    id: row.id,
    projectId: row.project_id,
    projectName: row.project_name,
    teamId: row.team_id,
    teamName: row.team_name,
    title: row.title,
    description: row.description,
    status: row.status,
    dueDate: row.due_date,
    completedAt: row.completed_at,
    needsAssignee: row.needs_assignee,
    teamOnly: row.team_only,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastActivityAt: row.last_activity_at,
    assignments: row.assignments,
  };
}

export async function listTasks(userId: string, filters: TaskFilters) {
  const params: unknown[] = [userId];
  const conditions = ["t.deleted_at IS NULL", visibleToUserSql("$1"), scopeSql(filters.scope, "$1")];

  if (filters.view === "mine") {
    conditions.push(
      "EXISTS (SELECT 1 FROM task_assignments a WHERE a.task_id = t.id AND a.user_id = $1 AND a.ended_at IS NULL)",
    );
  }
  if (filters.view === "pool") {
    conditions.push(
      "NOT EXISTS (SELECT 1 FROM task_assignments a WHERE a.task_id = t.id AND a.role = 'owner' AND a.ended_at IS NULL)",
    );
  }

  if (filters.status) {
    params.push(filters.status);
    conditions.push(`t.status = $${params.length}`);
  } else {
    conditions.push("t.status <> 'done'");
  }
  if (filters.projectId) {
    params.push(filters.projectId);
    conditions.push(`t.project_id = $${params.length}`);
  }
  if (filters.needsAssignee !== undefined) {
    params.push(filters.needsAssignee);
    conditions.push(`t.needs_assignee = $${params.length}`);
  }

  // En gecikmişten başlayan sıralama: en erken son tarih önce, tarihsizler sonda.
  const result = await query<TaskRow>(
    `${TASK_SELECT}
      WHERE ${conditions.join(" AND ")}
      ORDER BY t.due_date ASC NULLS LAST, t.created_at ASC, t.id ASC`,
    params,
  );
  return result.rows.map(toTaskDto);
}

export async function getTask(userId: string, taskId: string) {
  const result = await query<TaskRow>(
    `${TASK_SELECT}
      WHERE t.id = $1 AND t.deleted_at IS NULL AND ${visibleToUserSql("$2")}`,
    [taskId, userId],
  );
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

  return { ...toTaskDto(row), comments: comments.rows, history: history.rows };
}

export async function createTask(userId: string, input: NewTaskInput): Promise<string> {
  if (input.teamOnly && !input.teamId) {
    throw new HttpError(400, "Ekibe özel görev için ekip seçmelisiniz.");
  }

  return withTransaction(async (client) => {
    await ensureProjectAndTeam(client, input.projectId, input.teamId);

    const result = await client.query<{ id: string }>(
      `INSERT INTO tasks (project_id, team_id, title, description, due_date, needs_assignee, team_only, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        input.projectId,
        input.teamId,
        input.title,
        input.description,
        input.dueDate,
        input.needsAssignee,
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
      needsAssignee: patch.needsAssignee ?? current.needs_assignee,
      teamOnly: patch.teamOnly ?? current.team_only,
      teamId: "teamId" in patch ? (patch.teamId ?? null) : current.team_id,
      projectId: "projectId" in patch ? (patch.projectId ?? null) : current.project_id,
    };

    if (next.teamOnly && !next.teamId) {
      throw new HttpError(400, "Ekibe özel görev için ekip seçmelisiniz.");
    }
    await ensureProjectAndTeam(client, next.projectId, next.teamId);

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
    compare("needs_assignee", current.needs_assignee, next.needsAssignee);
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
          SET title = $2, description = $3, status = $4, due_date = $5, needs_assignee = $6,
              team_only = $7, team_id = $8, project_id = $9,
              completed_at = ${completedAtSql},
              updated_at = now(), last_activity_at = now()
        WHERE id = $1`,
      [
        taskId,
        next.title,
        next.description,
        next.status,
        next.dueDate,
        next.needsAssignee,
        next.teamOnly,
        next.teamId,
        next.projectId,
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
    if (await getActiveOwnerId(client, taskId)) {
      throw new HttpError(409, "Bu görev zaten birine atanmış.");
    }

    const name = await getUserName(client, userId);
    // Kişi bu görevde destek olarak yer alıyorsa, sahiplenince destek kaydı kapanır.
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

export async function supportTask(userId: string, taskId: string): Promise<void> {
  await withTransaction(async (client) => {
    const task = await lockVisibleTask(client, userId, taskId);
    if (task.status === "done") {
      throw new HttpError(409, "Tamamlanmış göreve destek olunamaz.");
    }
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

// Görevi başka bir kişiye atar. Mevcut sahip çıkarılır, hedef kişinin destek kaydı sahiplik kaydına dönüşür.
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

    const currentOwnerId = await getActiveOwnerId(client, taskId);
    if (currentOwnerId === targetUserId) {
      throw new HttpError(409, "Görev zaten bu kişide.");
    }

    const oldOwnerName = currentOwnerId ? await getUserName(client, currentOwnerId) : null;
    if (currentOwnerId) {
      await client.query(
        "UPDATE task_assignments SET ended_at = now() WHERE task_id = $1 AND role = 'owner' AND ended_at IS NULL",
        [taskId],
      );
    }
    await endAssignments(client, taskId, targetUserId, userId, targetUser.name);

    await client.query(
      `INSERT INTO task_assignments (task_id, user_id, role, source, assigned_by)
       VALUES ($1, $2, 'owner', 'assigned', $3)`,
      [taskId, targetUserId, userId],
    );
    await recordHistory(client, taskId, userId, "owner", oldOwnerName, targetUser.name);
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
            t.team_only, t.needs_assignee
       FROM tasks t
      WHERE t.id = $1 AND t.deleted_at IS NULL AND ${visibleToUserSql("$2")}
      FOR UPDATE OF t`,
    [taskId, userId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new HttpError(404, "Görev bulunamadı.");
  }
  return row;
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

async function getActiveOwnerId(client: pg.PoolClient, taskId: string): Promise<string | null> {
  const result = await client.query<{ user_id: string }>(
    "SELECT user_id FROM task_assignments WHERE task_id = $1 AND role = 'owner' AND ended_at IS NULL",
    [taskId],
  );
  return result.rows[0]?.user_id ?? null;
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
