import express, { type ErrorRequestHandler } from "express";
import { feedRouter } from "./activity/routes.js";
import { authRouter } from "./auth/routes.js";
import { query } from "./db.js";
import { HttpError } from "./http-error.js";
import { projectsRouter } from "./projects/routes.js";
import { tasksRouter } from "./tasks/routes.js";
import { teamsRouter } from "./teams/routes.js";
import { usersRouter } from "./users/routes.js";

// Beklenen hatalar (HttpError ve bozuk JSON gibi istemci hataları) kendi durum koduyla döner; diğerleri 500 olur.
const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  const status = (err as { status?: unknown }).status;
  if (typeof status === "number" && status >= 400 && status < 500) {
    res.status(status).json({ error: "Geçersiz istek." });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "Beklenmeyen bir hata oluştu." });
};

export function createApp() {
  const app = express();

  app.use(express.json());

  app.get("/api/health", async (_req, res) => {
    try {
      await query("SELECT 1");
      res.json({ status: "ok", db: "ok" });
    } catch {
      res.status(503).json({ status: "error", db: "unreachable" });
    }
  });

  app.use("/api/auth", authRouter);
  app.use("/api/tasks", tasksRouter);
  app.use("/api/projects", projectsRouter);
  app.use("/api/teams", teamsRouter);
  app.use("/api/users", usersRouter);
  app.use("/api/feed", feedRouter);

  app.use(errorHandler);

  return app;
}
