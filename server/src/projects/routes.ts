import type pg from "pg";
import { Router } from "express";
import { requireAuth } from "../auth/session.js";
import { query, withTransaction } from "../db.js";
import { HttpError } from "../http-error.js";
import { recordActivity } from "../activity/service.js";
import { listTasks } from "../tasks/service.js";
import {
  asObject,
  parseId,
  parseOptionalDate,
  parseOptionalText,
  parseRequiredText,
} from "../validation.js";

export const projectsRouter = Router();

projectsRouter.use(requireAuth);

// İlerleme sayıları gizli ekibe özel görevleri de içerir (kullanıcı kararı); bu yüzden görünürlük filtresi uygulanmaz.
const PROJECT_SELECT = `
  SELECT p.id, p.name, p.description, p.status, p.start_date, p.due_date,
         COALESCE((
           SELECT json_agg(json_build_object('id', tm.id::text, 'name', tm.name) ORDER BY tm.name)
             FROM project_teams pt
             JOIN teams tm ON tm.id = pt.team_id
            WHERE pt.project_id = p.id AND pt.ended_at IS NULL
         ), '[]'::json) AS teams,
         COUNT(t.id) FILTER (WHERE t.id IS NOT NULL) AS total_count,
         COUNT(t.id) FILTER (WHERE t.status = 'done') AS done_count,
         COUNT(t.id) FILTER (
           WHERE t.status <> 'done'
             AND t.estimated_people > (
               SELECT COUNT(*) FROM task_assignments a
                WHERE a.task_id = t.id AND a.role = 'owner' AND a.ended_at IS NULL
             )
         ) AS open_count
    FROM projects p
    LEFT JOIN tasks t ON t.project_id = p.id AND t.deleted_at IS NULL`;

const PROJECT_GROUP = "GROUP BY p.id";

type ProjectRow = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  start_date: string | null;
  due_date: string | null;
  teams: { id: string; name: string }[];
  total_count: string;
  done_count: string;
  open_count: string;
};

function toProjectDto(row: ProjectRow) {
  const total = Number(row.total_count);
  const done = Number(row.done_count);
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status,
    startDate: row.start_date,
    dueDate: row.due_date,
    teams: row.teams,
    progress: {
      total,
      done,
      percent: total === 0 ? 0 : Math.round((done / total) * 100),
      openCount: Number(row.open_count),
    },
  };
}

projectsRouter.get("/", async (_req, res) => {
  const result = await query<ProjectRow>(
    `${PROJECT_SELECT} ${PROJECT_GROUP} ORDER BY p.due_date ASC NULLS LAST, p.id ASC`,
  );
  res.json({ projects: result.rows.map(toProjectDto) });
});

projectsRouter.get("/:id", async (req, res) => {
  const id = parseId(req.params.id, "Geçersiz proje kimliği.");
  const result = await query<ProjectRow>(`${PROJECT_SELECT} WHERE p.id = $1 ${PROJECT_GROUP}`, [id]);
  const row = result.rows[0];
  if (!row) {
    throw new HttpError(404, "Proje bulunamadı.");
  }
  res.json({ project: toProjectDto(row) });
});

// Faaliyetin görevleri (tamamlananlar dahil), en gecikmişten başlayarak.
projectsRouter.get("/:id/tasks", async (req, res) => {
  const id = parseId(req.params.id, "Geçersiz proje kimliği.");
  const exists = await query("SELECT 1 FROM projects WHERE id = $1", [id]);
  if (!exists.rowCount) {
    throw new HttpError(404, "Proje bulunamadı.");
  }
  const tasks = await listTasks(req.user!.id, { view: "all", scope: "all", projectId: id, includeDone: true });
  res.json({ tasks });
});

function parseTeamIds(value: unknown): string[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new HttpError(400, "Ekipler liste olmalıdır.");
  }
  return [...new Set(value.map((item) => parseId(item, "Geçersiz ekip.")))];
}

async function assertTeamsExist(client: pg.PoolClient, teamIds: string[]): Promise<void> {
  if (teamIds.length === 0) {
    return;
  }
  const result = await client.query("SELECT id FROM teams WHERE id = ANY($1::bigint[])", [teamIds]);
  if (result.rowCount !== teamIds.length) {
    throw new HttpError(400, "Ekip bulunamadı.");
  }
}

projectsRouter.post("/", async (req, res) => {
  const body = asObject(req.body);
  const name = parseRequiredText(body.name, "Proje adı", 200);
  const description = parseOptionalText(body.description, "Açıklama", 5000);
  const startDate = parseOptionalDate(body.startDate, "Başlangıç tarihi");
  const dueDate = parseOptionalDate(body.dueDate, "Bitiş tarihi");
  const teamIds = parseTeamIds(body.teamIds);

  const id = await withTransaction(async (client) => {
    await assertTeamsExist(client, teamIds);
    const result = await client.query<{ id: string }>(
      `INSERT INTO projects (name, description, start_date, due_date, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [name, description, startDate, dueDate, req.user!.id],
    );
    const projectId = result.rows[0].id;
    for (const teamId of teamIds) {
      await client.query("INSERT INTO project_teams (project_id, team_id) VALUES ($1, $2)", [projectId, teamId]);
    }
    await recordActivity(client, {
      userId: req.user!.id,
      action: "created",
      entityType: "project",
      entityId: projectId,
      entityName: name,
    });
    return projectId;
  });
  res.status(201).json({ id });
});

// Yalnızca gerçekten değişen alanlar akışa yazılır.
projectsRouter.patch("/:id", async (req, res) => {
  const id = parseId(req.params.id, "Geçersiz proje kimliği.");
  const body = asObject(req.body);
  const name = parseRequiredText(body.name, "Proje adı", 200);
  const description = parseOptionalText(body.description, "Açıklama", 5000);

  await withTransaction(async (client) => {
    const current = await client.query<{ name: string; description: string | null }>(
      "SELECT name, description FROM projects WHERE id = $1 FOR UPDATE",
      [id],
    );
    if (!current.rowCount) {
      throw new HttpError(404, "Proje bulunamadı.");
    }
    const before = current.rows[0];
    await client.query("UPDATE projects SET name = $2, description = $3 WHERE id = $1", [id, name, description]);

    if (before.name !== name) {
      await recordActivity(client, {
        userId: req.user!.id,
        action: "renamed",
        entityType: "project",
        entityId: id,
        entityName: name,
        oldValue: before.name,
        newValue: name,
      });
    }
    if ((before.description ?? null) !== description) {
      await recordActivity(client, {
        userId: req.user!.id,
        action: "described",
        entityType: "project",
        entityId: id,
        entityName: name,
      });
    }
  });
  res.status(204).end();
});

// Faaliyeti ekibe bağlar. Aynı ekip aynı anda bir kez bağlı olabilir; bağlantı kaldırıldıktan sonra yeniden kurulabilir.
projectsRouter.post("/:id/teams", async (req, res) => {
  const id = parseId(req.params.id, "Geçersiz proje kimliği.");
  const teamId = parseId(asObject(req.body).teamId, "Geçersiz ekip.");

  await withTransaction(async (client) => {
    const project = await client.query<{ name: string }>("SELECT name FROM projects WHERE id = $1", [id]);
    if (!project.rowCount) {
      throw new HttpError(404, "Proje bulunamadı.");
    }
    const team = await client.query<{ name: string }>("SELECT name FROM teams WHERE id = $1", [teamId]);
    if (!team.rowCount) {
      throw new HttpError(400, "Ekip bulunamadı.");
    }

    const existing = await client.query(
      "SELECT 1 FROM project_teams WHERE project_id = $1 AND team_id = $2 AND ended_at IS NULL",
      [id, teamId],
    );
    if (existing.rowCount) {
      throw new HttpError(409, "Bu faaliyet bu ekibe zaten bağlı.");
    }

    await client.query("INSERT INTO project_teams (project_id, team_id) VALUES ($1, $2)", [id, teamId]);
    await recordActivity(client, {
      userId: req.user!.id,
      action: "linked_team",
      entityType: "project",
      entityId: id,
      entityName: project.rows[0].name,
      newValue: team.rows[0].name,
    });
  });
  res.status(204).end();
});

projectsRouter.delete("/:id/teams/:teamId", async (req, res) => {
  const id = parseId(req.params.id, "Geçersiz proje kimliği.");
  const teamId = parseId(req.params.teamId, "Geçersiz ekip.");

  await withTransaction(async (client) => {
    const project = await client.query<{ name: string }>("SELECT name FROM projects WHERE id = $1", [id]);
    if (!project.rowCount) {
      throw new HttpError(404, "Proje bulunamadı.");
    }
    const team = await client.query<{ name: string }>("SELECT name FROM teams WHERE id = $1", [teamId]);
    const closed = await client.query(
      "UPDATE project_teams SET ended_at = now() WHERE project_id = $1 AND team_id = $2 AND ended_at IS NULL",
      [id, teamId],
    );
    if (!closed.rowCount) {
      throw new HttpError(404, "Bu faaliyet bu ekibe bağlı değil.");
    }
    await recordActivity(client, {
      userId: req.user!.id,
      action: "unlinked_team",
      entityType: "project",
      entityId: id,
      entityName: project.rows[0].name,
      oldValue: team.rows[0]?.name ?? null,
    });
  });
  res.status(204).end();
});

