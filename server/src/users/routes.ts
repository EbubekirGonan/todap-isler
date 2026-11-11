import { Router } from "express";
import { requireAuth } from "../auth/session.js";
import { query } from "../db.js";
import { HttpError } from "../http-error.js";
import { requireAdmin } from "../policy/visibility.js";
import { asObject, normalizeEmail, parseBoolean, parseOptionalText, parseRequiredText } from "../validation.js";

export const usersRouter = Router();

usersRouter.use(requireAuth);

// Atama seçicisi için yalnızca aktif kullanıcılar listelenir.
usersRouter.get("/", async (_req, res) => {
  const result = await query("SELECT id, name FROM users WHERE active ORDER BY name, id");
  res.json({ users: result.rows });
});

usersRouter.post("/", requireAdmin, async (req, res) => {
  const body = asObject(req.body);
  const name = parseRequiredText(body.name, "Ad", 100);
  const email = normalizeEmail(body.email);
  if (!email) {
    throw new HttpError(400, "Geçerli bir e-posta adresi girin.");
  }
  const phone = parseOptionalText(body.phone, "Telefon", 50);
  const isAdmin = body.isAdmin === undefined ? false : parseBoolean(body.isAdmin, "Yönetici yetkisi");
  const result = await query<{ id: string }>(
    `INSERT INTO users (name, email, phone, is_admin)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (lower(email)) DO NOTHING
     RETURNING id`,
    [name, email, phone, isAdmin],
  );
  if (result.rowCount === 0) {
    throw new HttpError(409, "Bu e-posta adresiyle kayıtlı bir kullanıcı zaten var.");
  }
  res.status(201).json({ id: result.rows[0].id });
});
