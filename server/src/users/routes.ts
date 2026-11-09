import { Router } from "express";
import { requireAuth } from "../auth/session.js";
import { query } from "../db.js";

export const usersRouter = Router();

usersRouter.use(requireAuth);

// Atama seçicisi için yalnızca aktif kullanıcılar listelenir.
usersRouter.get("/", async (_req, res) => {
  const result = await query("SELECT id, name FROM users WHERE active ORDER BY name, id");
  res.json({ users: result.rows });
});
