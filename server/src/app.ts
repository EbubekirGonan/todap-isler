import express from "express";
import { authRouter } from "./auth/routes.js";
import { query } from "./db.js";

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

  return app;
}
