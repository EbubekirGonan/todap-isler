import { Router } from "express";
import { requireAuth } from "../auth/session.js";
import { query } from "../db.js";
import { HttpError } from "../http-error.js";
import { requireAdmin } from "../policy/visibility.js";
import { asObject, parseId, parseOptionalText, parseRequiredText } from "../validation.js";

export const associationRouter = Router();

associationRouter.use(requireAuth);

// Dernek kutucukları herkese açıktır. Ekip listesi Ekipler sekmesinde gösterilir.
// Kutucuklar eklenme sırasına göre listelenir.
associationRouter.get("/tiles", async (_req, res) => {
  const tiles = await query<{ id: string; title: string; description: string | null }>(
    "SELECT id, title, description FROM association_tiles WHERE deleted_at IS NULL ORDER BY id",
  );
  res.json({ tiles: tiles.rows });
});

// Yalnızca yönetici: yeni kutucuk ekler.
associationRouter.post("/tiles", requireAdmin, async (req, res) => {
  const body = asObject(req.body);
  const title = parseRequiredText(body.title, "Kutucuk başlığı", 100);
  const description = parseOptionalText(body.description, "Açıklama", 2000);
  const result = await query<{ id: string }>(
    "INSERT INTO association_tiles (title, description, created_by) VALUES ($1, $2, $3) RETURNING id",
    [title, description, req.user!.id],
  );
  res.status(201).json({ id: result.rows[0].id });
});

// Yalnızca yönetici: kutucuğun başlığını ve açıklamasını günceller.
associationRouter.patch("/tiles/:id", requireAdmin, async (req, res) => {
  const id = parseId(req.params.id, "Geçersiz kutucuk kimliği.");
  const body = asObject(req.body);
  const title = parseRequiredText(body.title, "Kutucuk başlığı", 100);
  const description = parseOptionalText(body.description, "Açıklama", 2000);
  const result = await query(
    `UPDATE association_tiles
        SET title = $2, description = $3, updated_at = now()
      WHERE id = $1 AND deleted_at IS NULL`,
    [id, title, description],
  );
  if (result.rowCount !== 1) {
    throw new HttpError(404, "Kutucuk bulunamadı.");
  }
  res.status(204).end();
});

