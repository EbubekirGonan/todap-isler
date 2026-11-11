import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { sendResendMail } from "../auth/mailer.js";
import { requireAuth } from "../auth/session.js";
import { config } from "../config.js";
import { asObject, parseRequiredText } from "../validation.js";

export const feedbackRouter = Router();

const feedbackLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  keyGenerator: (req) => `user:${req.user!.id}`,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Çok fazla mesaj gönderdiniz. Lütfen biraz sonra tekrar deneyin." },
});

feedbackRouter.use(requireAuth);
feedbackRouter.post("/", (req, res, next) => {
  parseRequiredText(asObject(req.body).message, "Mesaj", 4000);
  if (!config.feedbackEmail || !config.resendApiKey || !config.emailFrom) {
    res.status(503).json({ error: "Geri bildirim gönderimi henüz yapılandırılmadı." });
    return;
  }
  next();
}, feedbackLimiter, async (req, res) => {
  const message = parseRequiredText(asObject(req.body).message, "Mesaj", 4000);
  const user = req.user!;
  try {
    await sendResendMail({
      to: config.feedbackEmail!,
      replyTo: user.email,
      subject: "Todap geri bildirim",
      text: `Gönderen: ${user.name}\nE-posta: ${user.email}\n\n${message}`,
    });
  } catch (error) {
    console.error("Geri bildirim e-postası gönderilemedi:", error);
    res.status(502).json({ error: "Mesaj gönderilemedi. Lütfen tekrar deneyin." });
    return;
  }
  res.status(202).json({ message: "Mesajınız gönderim için kabul edildi." });
});
