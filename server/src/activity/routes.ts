import { Router } from "express";
import { requireAuth } from "../auth/session.js";
import { HttpError } from "../http-error.js";
import { listFeed } from "./service.js";

export const feedRouter = Router();

feedRouter.use(requireAuth);

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

// Sayfa sınırındaki zaman damgası aynı kayıtlar bir sonraki sayfada da gelebilir; istemci bunları tekrar etmez.
feedRouter.get("/", async (req, res) => {
  const rawLimit = req.query.limit === undefined ? DEFAULT_LIMIT : Number(req.query.limit);
  if (!Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > MAX_LIMIT) {
    throw new HttpError(400, `Kayıt sayısı 1 ile ${MAX_LIMIT} arasında olmalıdır.`);
  }

  let before: string | null = null;
  if (typeof req.query.before === "string" && req.query.before !== "") {
    if (Number.isNaN(Date.parse(req.query.before))) {
      throw new HttpError(400, "Geçersiz zaman bilgisi.");
    }
    before = new Date(req.query.before).toISOString();
  }

  const entries = await listFeed(req.user!.id, rawLimit, before);
  res.json({ entries });
});
