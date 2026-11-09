import { Router, type Request } from "express";
import { requireAuth } from "../auth/session.js";
import { HttpError } from "../http-error.js";
import {
  asObject,
  parseBoolean,
  parseId,
  parseOptionalDate,
  parseOptionalId,
  parseOptionalText,
  parseRequiredText,
} from "../validation.js";
import type { TaskScope } from "../policy/visibility.js";
import {
  addComment,
  assignTask,
  claimTask,
  createTask,
  deleteTask,
  getTask,
  listTasks,
  releaseTask,
  supportTask,
  updateTask,
  type TaskFilters,
  type TaskPatch,
  type TaskStatus,
} from "./service.js";

export const tasksRouter = Router();

tasksRouter.use(requireAuth);

const TASK_STATUSES: TaskStatus[] = ["todo", "doing", "done"];
const SCOPES: TaskScope[] = ["all", "public", "mine-team"];

function currentUserId(req: Request): string {
  if (!req.user) {
    throw new HttpError(401, "Giriş yapmanız gerekiyor.");
  }
  return req.user.id;
}

function parseStatus(value: unknown): TaskStatus {
  if (typeof value !== "string" || !TASK_STATUSES.includes(value as TaskStatus)) {
    throw new HttpError(400, "Geçersiz durum.");
  }
  return value as TaskStatus;
}

function parseOptionalFlag(value: unknown, field: string): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  throw new HttpError(400, `${field} true ya da false olmalıdır.`);
}

function parseFilters(view: TaskFilters["view"], query: Request["query"]): TaskFilters {
  const scope = query.scope ?? "all";
  if (typeof scope !== "string" || !SCOPES.includes(scope as TaskScope)) {
    throw new HttpError(400, "Geçersiz kapsam.");
  }

  const filters: TaskFilters = { view, scope: scope as TaskScope };
  if (query.status !== undefined) {
    filters.status = parseStatus(query.status);
  }
  if (query.projectId !== undefined) {
    filters.projectId = parseId(query.projectId, "Geçersiz proje.");
  }
  const needsAssignee = parseOptionalFlag(query.needsAssignee, "Kişi lazım filtresi");
  if (needsAssignee !== undefined) {
    filters.needsAssignee = needsAssignee;
  }
  return filters;
}

// Sabit yollar (mine, pool) :id yolundan önce tanımlanmalıdır.
tasksRouter.get("/mine", async (req, res) => {
  const tasks = await listTasks(currentUserId(req), parseFilters("mine", req.query));
  res.json({ tasks });
});

tasksRouter.get("/pool", async (req, res) => {
  const tasks = await listTasks(currentUserId(req), parseFilters("pool", req.query));
  res.json({ tasks });
});

tasksRouter.get("/", async (req, res) => {
  const tasks = await listTasks(currentUserId(req), parseFilters("all", req.query));
  res.json({ tasks });
});

tasksRouter.post("/", async (req, res) => {
  const body = asObject(req.body);
  const id = await createTask(currentUserId(req), {
    title: parseRequiredText(body.title, "Başlık", 200),
    description: parseOptionalText(body.description, "Açıklama", 5000),
    projectId: parseOptionalId(body.projectId, "Geçersiz proje."),
    teamId: parseOptionalId(body.teamId, "Geçersiz ekip."),
    dueDate: parseOptionalDate(body.dueDate, "Son tarih"),
    needsAssignee: body.needsAssignee === undefined ? false : parseBoolean(body.needsAssignee, "Kişi lazım"),
    teamOnly: body.teamOnly === undefined ? false : parseBoolean(body.teamOnly, "Ekibe özel"),
  });
  res.status(201).json({ id });
});

tasksRouter.get("/:id", async (req, res) => {
  const task = await getTask(currentUserId(req), parseId(req.params.id, "Geçersiz görev kimliği."));
  if (!task) {
    throw new HttpError(404, "Görev bulunamadı.");
  }
  res.json({ task });
});

// Yalnızca gövdede gelen alanlar güncellenir.
function parsePatch(body: Record<string, unknown>): TaskPatch {
  const patch: TaskPatch = {};
  if ("title" in body) {
    patch.title = parseRequiredText(body.title, "Başlık", 200);
  }
  if ("description" in body) {
    patch.description = parseOptionalText(body.description, "Açıklama", 5000);
  }
  if ("status" in body) {
    patch.status = parseStatus(body.status);
  }
  if ("dueDate" in body) {
    patch.dueDate = parseOptionalDate(body.dueDate, "Son tarih");
  }
  if ("needsAssignee" in body) {
    patch.needsAssignee = parseBoolean(body.needsAssignee, "Kişi lazım");
  }
  if ("teamOnly" in body) {
    patch.teamOnly = parseBoolean(body.teamOnly, "Ekibe özel");
  }
  if ("teamId" in body) {
    patch.teamId = parseOptionalId(body.teamId, "Geçersiz ekip.");
  }
  if ("projectId" in body) {
    patch.projectId = parseOptionalId(body.projectId, "Geçersiz proje.");
  }
  return patch;
}

tasksRouter.patch("/:id", async (req, res) => {
  const body = asObject(req.body);
  await updateTask(currentUserId(req), parseId(req.params.id, "Geçersiz görev kimliği."), parsePatch(body));
  res.json({ ok: true });
});

tasksRouter.delete("/:id", async (req, res) => {
  await deleteTask(currentUserId(req), parseId(req.params.id, "Geçersiz görev kimliği."));
  res.status(204).end();
});

tasksRouter.post("/:id/claim", async (req, res) => {
  await claimTask(currentUserId(req), parseId(req.params.id, "Geçersiz görev kimliği."));
  res.json({ ok: true });
});

tasksRouter.post("/:id/release", async (req, res) => {
  await releaseTask(currentUserId(req), parseId(req.params.id, "Geçersiz görev kimliği."));
  res.json({ ok: true });
});

tasksRouter.post("/:id/support", async (req, res) => {
  await supportTask(currentUserId(req), parseId(req.params.id, "Geçersiz görev kimliği."));
  res.json({ ok: true });
});

tasksRouter.post("/:id/assign", async (req, res) => {
  const body = asObject(req.body);
  const targetUserId = parseId(body.userId, "Geçersiz kişi.");
  await assignTask(currentUserId(req), parseId(req.params.id, "Geçersiz görev kimliği."), targetUserId);
  res.json({ ok: true });
});

tasksRouter.post("/:id/comments", async (req, res) => {
  const body = asObject(req.body);
  const text = parseRequiredText(body.body, "Yorum", 2000);
  await addComment(currentUserId(req), parseId(req.params.id, "Geçersiz görev kimliği."), text);
  res.status(201).json({ ok: true });
});
