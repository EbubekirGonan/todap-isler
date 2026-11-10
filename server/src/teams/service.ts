import type pg from "pg";
import { query, withTransaction } from "../db.js";
import { HttpError } from "../http-error.js";
import { recordActivity } from "../activity/service.js";

const TEAM_COLUMNS = `
  t.id, t.name, t.description, t.type, t.term_start, t.term_end, t.required_people,
  (SELECT COUNT(*)::int FROM team_members m WHERE m.team_id = t.id AND m.ended_at IS NULL) AS active_count,
  EXISTS (
    SELECT 1 FROM team_members m WHERE m.team_id = t.id AND m.user_id = $1 AND m.ended_at IS NULL
  ) AS is_member`;

export type TeamRow = {
  id: string;
  name: string;
  description: string | null;
  type: string;
  term_start: string | null;
  term_end: string | null;
  required_people: number;
  active_count: number;
  is_member: boolean;
};

// Açık kontenjan: gerekli kişi sayısı - aktif üye sayısı. Pozitifse ekip katılıma açıktır.
export function teamDto(row: TeamRow) {
  const openSlots = Math.max(row.required_people - row.active_count, 0);
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type,
    termStart: row.term_start,
    termEnd: row.term_end,
    requiredPeople: row.required_people,
    activeCount: row.active_count,
    openSlots,
    isMember: row.is_member,
    canJoin: openSlots > 0 && !row.is_member,
  };
}

export async function listTeams(userId: string) {
  const result = await query<TeamRow>(
    `SELECT ${TEAM_COLUMNS} FROM teams t ORDER BY t.name, t.id`,
    [userId],
  );
  return result.rows.map(teamDto);
}

export async function getTeamDetail(userId: string, teamId: string) {
  const result = await query<TeamRow>(`SELECT ${TEAM_COLUMNS} FROM teams t WHERE t.id = $2`, [userId, teamId]);
  const row = result.rows[0];
  if (!row) {
    throw new HttpError(404, "Ekip bulunamadı.");
  }

  const members = await query<{ user_id: string; name: string; role_title: string | null; started_at: Date }>(
    `SELECT m.user_id, u.name, m.role_title, m.started_at
       FROM team_members m
       JOIN users u ON u.id = m.user_id
      WHERE m.team_id = $1 AND m.ended_at IS NULL
      ORDER BY u.name, m.user_id`,
    [teamId],
  );

  const projects = await query<{ id: string; name: string; status: string; due_date: string | null }>(
    `SELECT p.id, p.name, p.status, p.due_date
       FROM project_teams pt
       JOIN projects p ON p.id = pt.project_id
      WHERE pt.team_id = $1 AND pt.ended_at IS NULL
      ORDER BY p.due_date ASC NULLS LAST, p.id ASC`,
    [teamId],
  );

  return {
    ...teamDto(row),
    members: members.rows.map((m) => ({
      userId: m.user_id,
      name: m.name,
      roleTitle: m.role_title,
      startedAt: m.started_at.toISOString(),
    })),
    projects: projects.rows.map((p) => ({ id: p.id, name: p.name, status: p.status, dueDate: p.due_date })),
  };
}

// Ekip satırını kilitler; katılım ve kontenjan kontrolleri aynı anda çalışan isteklerde yarışmasın diye.
async function lockTeam(
  client: pg.PoolClient,
  teamId: string,
): Promise<{ id: string; name: string; description: string | null; required_people: number }> {
  const result = await client.query<{ id: string; name: string; description: string | null; required_people: number }>(
    "SELECT id, name, description, required_people FROM teams WHERE id = $1 FOR UPDATE",
    [teamId],
  );
  const team = result.rows[0];
  if (!team) {
    throw new HttpError(404, "Ekip bulunamadı.");
  }
  return team;
}

async function countActiveMembers(client: pg.PoolClient, teamId: string): Promise<number> {
  const result = await client.query<{ count: number }>(
    "SELECT COUNT(*)::int AS count FROM team_members WHERE team_id = $1 AND ended_at IS NULL",
    [teamId],
  );
  return result.rows[0].count;
}

// Bir kişi aynı ekipte aynı anda tek kez yer alabilir. Ayrılan kişi, kontenjan açıksa yeniden katılabilir.
export async function joinTeam(userId: string, teamId: string): Promise<void> {
  await withTransaction(async (client) => {
    const team = await lockTeam(client, teamId);

    const existing = await client.query(
      "SELECT 1 FROM team_members WHERE team_id = $1 AND user_id = $2 AND ended_at IS NULL",
      [teamId, userId],
    );
    if (existing.rowCount) {
      throw new HttpError(409, "Bu ekipte zaten yer alıyorsunuz.");
    }

    const active = await countActiveMembers(client, teamId);
    if (team.required_people - active <= 0) {
      throw new HttpError(409, "Bu ekip şu an katılıma açık değil.");
    }

    await client.query("INSERT INTO team_members (team_id, user_id) VALUES ($1, $2)", [teamId, userId]);
    await recordActivity(client, {
      userId,
      action: "joined",
      entityType: "team",
      entityId: teamId,
      entityName: team.name,
    });
  });
}

// Ayrılma: üyelik kapanır (ended_at). Ekibe özel açık bir görevde atanmışsa önce o atama bırakılmalıdır.
export async function leaveTeam(userId: string, teamId: string): Promise<void> {
  await withTransaction((client) => endMembership(client, teamId, userId, "left"));
}

// Yönetici çıkarması da aynı kuralları uygular; yalnızca akışta "çıkarıldı" olarak kaydedilir.
export async function removeTeamMember(teamId: string, userId: string): Promise<void> {
  await withTransaction((client) => endMembership(client, teamId, userId, "removed"));
}

async function endMembership(
  client: pg.PoolClient,
  teamId: string,
  userId: string,
  action: "left" | "removed",
): Promise<void> {
  const team = await lockTeam(client, teamId);

  const membership = await client.query(
    "SELECT id FROM team_members WHERE team_id = $1 AND user_id = $2 AND ended_at IS NULL FOR UPDATE",
    [teamId, userId],
  );
  if (!membership.rowCount) {
    throw new HttpError(409, "Bu ekipte aktif üyelik yok.");
  }

  const assigned = await client.query(
    `SELECT 1
       FROM task_assignments a
       JOIN tasks t ON t.id = a.task_id
      WHERE a.user_id = $1 AND a.ended_at IS NULL
        AND t.team_only = true AND t.team_id = $2
        AND t.deleted_at IS NULL AND t.status <> 'done'
      LIMIT 1`,
    [userId, teamId],
  );
  if (assigned.rowCount) {
    throw new HttpError(409, "Ekibe özel açık bir görevde katkı var. Önce o görevden ayrılmalıdır.");
  }

  await client.query("UPDATE team_members SET ended_at = now() WHERE id = $1", [membership.rows[0].id]);
  await recordActivity(client, {
    userId,
    action,
    entityType: "team",
    entityId: teamId,
    entityName: team.name,
  });
}

export type NewTeam = {
  name: string;
  description: string | null;
  type: "term" | "ongoing";
  termStart: string | null;
  termEnd: string | null;
  requiredPeople: number;
};

// Ekip herkes tarafından kurulabilir. Kuruluşta üyelik açılmaz; kişiler katılım uçlarıyla eklenir.
export async function createTeam(input: NewTeam): Promise<string> {
  const result = await query<{ id: string }>(
    `INSERT INTO teams (name, description, type, term_start, term_end, required_people)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [input.name, input.description, input.type, input.termStart, input.termEnd, input.requiredPeople],
  );
  return result.rows[0].id;
}

// Gönderilmeyen alanlar mevcut değerini korur. Her değişen alan için ayrı kayıt yazılır.
export type TeamEdit = {
  name?: string;
  description?: string | null;
  requiredPeople?: number;
};

export async function updateTeam(userId: string, teamId: string, edit: TeamEdit): Promise<void> {
  await withTransaction(async (client) => {
    const team = await lockTeam(client, teamId);
    const next = {
      name: edit.name ?? team.name,
      description: edit.description !== undefined ? edit.description : team.description,
      requiredPeople: edit.requiredPeople ?? team.required_people,
    };

    const changes: { field: string; oldValue: string | null; newValue: string | null }[] = [];
    if (team.name !== next.name) {
      changes.push({ field: "name", oldValue: team.name, newValue: next.name });
    }
    if ((team.description ?? null) !== next.description) {
      changes.push({ field: "description", oldValue: team.description, newValue: next.description });
    }
    if (team.required_people !== next.requiredPeople) {
      changes.push({
        field: "required_people",
        oldValue: String(team.required_people),
        newValue: String(next.requiredPeople),
      });
    }
    if (changes.length === 0) {
      return;
    }

    await client.query("UPDATE teams SET name = $2, description = $3, required_people = $4 WHERE id = $1", [
      teamId,
      next.name,
      next.description,
      next.requiredPeople,
    ]);
    for (const change of changes) {
      await recordActivity(client, {
        userId,
        action: "updated",
        entityType: "team",
        entityId: teamId,
        entityName: next.name,
        field: change.field,
        oldValue: change.oldValue,
        newValue: change.newValue,
      });
    }
  });
}
