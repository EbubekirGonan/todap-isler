import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { consumeLinkToken, consumeLoginCode, requestLogin } from "./login.js";
import { normalizeEmail } from "../validation.js";
import {
  clearSessionCookie,
  createSession,
  readSessionCookie,
  requireAuth,
  revokeSession,
  setSessionCookie,
} from "./session.js";

const CODE_PATTERN = /^\d{6}$/;
const MAX_TOKEN_LENGTH = 200;

// IP başına sınırlar; tek bir kişinin ya da betiğin istek seline karşı.
const requestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Çok fazla istek gönderildi. Lütfen biraz sonra tekrar deneyin." },
});

const verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 50,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Çok fazla deneme yapıldı. Lütfen biraz sonra tekrar deneyin." },
});

export const authRouter = Router();

// E-posta kayıtlı olsun ya da olmasın aynı yanıt döner (hesap keşfini engeller).
authRouter.post("/request", requestLimiter, async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  if (!email) {
    res.status(400).json({ error: "Geçerli bir e-posta adresi girin." });
    return;
  }

  await requestLogin(email);
  res.status(202).json({
    message: "E-posta adresiniz kayıtlıysa giriş bağlantısı ve 6 haneli kod gönderildi.",
  });
});

authRouter.post("/verify-link", verifyLimiter, async (req, res) => {
  const token = req.body?.token;
  if (typeof token !== "string" || token.length === 0 || token.length > MAX_TOKEN_LENGTH) {
    res.status(400).json({ error: "Geçersiz giriş bağlantısı." });
    return;
  }

  const userId = await consumeLinkToken(token);
  if (!userId) {
    res.status(401).json({ error: "Bağlantının süresi dolmuş ya da daha önce kullanılmış." });
    return;
  }

  setSessionCookie(res, await createSession(userId));
  res.status(204).end();
});

authRouter.post("/verify-code", verifyLimiter, async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";
  if (!email || !CODE_PATTERN.test(code)) {
    res.status(400).json({ error: "E-posta ve 6 haneli kod gerekli." });
    return;
  }

  const userId = await consumeLoginCode(email, code);
  if (!userId) {
    res.status(401).json({ error: "Kod geçersiz ya da süresi dolmuş." });
    return;
  }

  setSessionCookie(res, await createSession(userId));
  res.status(204).end();
});

authRouter.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

authRouter.post("/logout", async (req, res) => {
  const token = readSessionCookie(req);
  if (token) {
    await revokeSession(token);
  }
  clearSessionCookie(res);
  res.status(204).end();
});
