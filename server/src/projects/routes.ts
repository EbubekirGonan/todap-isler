import { Router } from "express";
import { requireAuth } from "../auth/session.js";
import { query } from "../db.js";
import { HttpError } from "../http-error.js";
import { listTasks } from "../tasks/service.js";
import { asObject, parseId, parseOptionalDate, parseOptionalId, parseOptionalText, parseRequiredText } from "../validation.js";

export const projectsRouter = Router();

projectsRouter.use(requireAuth);

// İlerleme sayıları gizli ekibe özel görevleri de içerir (kullanıcı kararı); bu yüzden görünürlük filtresi uygulanmaz.
const PROJECT_SELECT = `
  SELECT p.id, p.name, p.description, p.status, p.start_date, p.due_date, p.team_id, tm.name AS team_name,
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
    LEFT JOIN teams tm ON tm.id = p.team_id
    LEFT JOIN tasks t ON t.project_id = p.id AND t.deleted_at IS NULL`;

const PROJECT_GROUP = "GROUP BY p.id, tm.name";

type ProjectRow = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  start_date: string | null;
  due_date: string | null;
  team_id: string | null;
  team_name: string | null;
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
    teamId: row.team_id,
    teamName: row.team_name,
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

projectsRouter.post("/", async (req, res) => {
  const body = asObject(req.body);
  const teamId = parseOptionalId(body.teamId, "Geçersiz ekip.");
  if (teamId) {
    const team = await query("SELECT 1 FROM teams WHERE id = $1", [teamId]);
    if (!team.rowCount) {
      throw new HttpError(400, "Ekip bulunamadı.");
    }
  }

  const result = await query<{ id: string }>(
    `INSERT INTO projects (name, description, start_date, due_date, team_id, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [
      parseRequiredText(body.name, "Proje adı", 200),
      parseOptionalText(body.description, "Açıklama", 5000),
      parseOptionalDate(body.startDate, "Başlangıç tarihi"),
      parseOptionalDate(body.dueDate, "Bitiş tarihi"),
      teamId,
      req.user!.id,
    ],
  );
  res.status(201).json({ id: result.rows[0].id });
});
