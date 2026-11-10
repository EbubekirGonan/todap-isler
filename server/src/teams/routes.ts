import { Router } from "express";
import { requireAuth } from "../auth/session.js";
import { query } from "../db.js";
import { HttpError } from "../http-error.js";
import { isTeamMember, requireAdmin } from "../policy/visibility.js";
import { listTasks } from "../tasks/service.js";
import {
  asObject,
  parseId,
  parseNonNegativeInteger,
  parseOptionalDate,
  parseOptionalText,
  parseRequiredText,
} from "../validation.js";
import {
  createTeam,
  getTeamDetail,
  joinTeam,
  leaveTeam,
  listTeams,
  removeTeamMember,
  updateTeam,
  type NewTeam,
  type TeamEdit,
} from "./service.js";

export const teamsRouter = Router();

teamsRouter.use(requireAuth);

const TEAM_COLUMNS = "t.id, t.name, t.description, t.type, t.term_start, t.term_end";
const MAX_REQUIRED_PEOPLE = 1000;

// Gerekli kişi sayısı boş bırakılırsa 0 kabul edilir.
function parseRequiredPeople(value: unknown): number {
  if (value === undefined || value === null || value === "") {
    return 0;
  }
  return parseNonNegativeInteger(value, "Gerekli kişi sayısı", MAX_REQUIRED_PEOPLE);
}

// Ekip herkes tarafından kurulabilir. Dönemli ekipte başlangıç ve bitiş zorunludur; süresiz ekipte bitiş olamaz.
function parseNewTeam(body: Record<string, unknown>): NewTeam {
  const name = parseRequiredText(body.name, "Ekip adı", 100);
  const description = parseOptionalText(body.description, "Açıklama", 2000);
  const type = body.type;
  if (type !== "term" && type !== "ongoing") {
    throw new HttpError(400, "Ekip türü dönemli ya da süresiz olmalıdır.");
  }
  const termStart = parseOptionalDate(body.termStart, "Dönem başlangıcı");
  const termEnd = parseOptionalDate(body.termEnd, "Dönem bitişi");
  if (type === "term") {
    if (!termStart || !termEnd) {
      throw new HttpError(400, "Dönemli ekipte başlangıç ve bitiş tarihi zorunludur.");
    }
    if (termEnd < termStart) {
      throw new HttpError(400, "Dönem bitişi başlangıçtan önce olamaz.");
    }
  } else if (termEnd) {
    throw new HttpError(400, "Süresiz ekiplerde dönem bitişi olamaz.");
  }
  return {
    name,
    description,
    type,
    termStart,
    termEnd,
    requiredPeople: parseRequiredPeople(body.requiredPeople),
  };
}

teamsRouter.post("/", async (req, res) => {
  const id = await createTeam(parseNewTeam(asObject(req.body)));
  res.status(201).json({ id });
});

teamsRouter.get("/", async (req, res) => {
  res.json({ teams: await listTeams(req.user!.id) });
});

// Kullanıcının aktif üyesi olduğu ekipler; ekip sekmeleri bu listeden oluşur.
teamsRouter.get("/mine", async (req, res) => {
  const result = await query(
    `SELECT ${TEAM_COLUMNS}, m.role_title
       FROM teams t
       JOIN team_members m ON m.team_id = t.id
      WHERE m.user_id = $1 AND m.ended_at IS NULL
      ORDER BY t.name, t.id`,
    [req.user!.id],
  );
  res.json({ teams: result.rows });
});

teamsRouter.get("/:id", async (req, res) => {
  const id = parseId(req.params.id, "Geçersiz ekip kimliği.");
  res.json({ team: await getTeamDetail(req.user!.id, id) });
});

// Ekip görevleri yalnızca o ekibin aktif üyelerine açıktır.
teamsRouter.get("/:id/tasks", async (req, res) => {
  const id = parseId(req.params.id, "Geçersiz ekip kimliği.");
  if (!(await isTeamMember(req.user!.id, id))) {
    throw new HttpError(403, "Bu ekibin görevlerini yalnızca üyeleri görebilir.");
  }
  const tasks = await listTasks(req.user!.id, {
    view: "all",
    scope: "all",
    teamId: id,
    includeDone: req.query.includeDone === "true",
  });
  res.json({ tasks });
});

teamsRouter.post("/:id/join", async (req, res) => {
  const id = parseId(req.params.id, "Geçersiz ekip kimliği.");
  await joinTeam(req.user!.id, id);
  res.status(204).end();
});

teamsRouter.post("/:id/leave", async (req, res) => {
  const id = parseId(req.params.id, "Geçersiz ekip kimliği.");
  await leaveTeam(req.user!.id, id);
  res.status(204).end();
});

// Ad, açıklama ve gerekli kişi sayısı herkes tarafından düzenlenebilir; gönderilmeyen alan değişmez.
teamsRouter.patch("/:id", async (req, res) => {
  const id = parseId(req.params.id, "Geçersiz ekip kimliği.");
  const body = asObject(req.body);
  const edit: TeamEdit = {};
  if (body.name !== undefined) {
    edit.name = parseRequiredText(body.name, "Ekip adı", 100);
  }
  if (body.description !== undefined) {
    edit.description = parseOptionalText(body.description, "Açıklama", 2000);
  }
  if (body.requiredPeople !== undefined) {
    edit.requiredPeople = parseNonNegativeInteger(body.requiredPeople, "Gerekli kişi sayısı", MAX_REQUIRED_PEOPLE);
  }
  await updateTeam(req.user!.id, id, edit);
  res.json({ team: await getTeamDetail(req.user!.id, id) });
});

// Yalnızca yönetici: ekipteki bir kişinin üyeliğini sonlandırır.
teamsRouter.delete("/:id/members/:userId", requireAdmin, async (req, res) => {
  await removeTeamMember(
    parseId(req.params.id, "Geçersiz ekip kimliği."),
    parseId(req.params.userId, "Geçersiz kullanıcı."),
  );
  res.status(204).end();
});
