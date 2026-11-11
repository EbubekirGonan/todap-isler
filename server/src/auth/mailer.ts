import { config } from "../config.js";

export type LoginMail = {
  to: string;
  link: string;
  code: string;
};

type Mail = { to: string; subject: string; text: string; replyTo?: string };

export async function sendResendMail(mail: Mail): Promise<void> {
  if (!config.resendApiKey || !config.emailFrom) {
    throw new Error("Resend yapılandırması eksik.");
  }
  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: config.emailFrom,
        to: [mail.to],
        subject: mail.subject,
        text: mail.text,
        ...(mail.replyTo ? { reply_to: mail.replyTo } : {}),
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new Error("Resend'e bağlanılamadı.");
  }
  if (!response.ok) {
    throw new Error(`Resend e-posta isteğini reddetti (HTTP ${response.status}).`);
  }
}

export async function sendLoginMail(mail: LoginMail): Promise<void> {
  if (config.isProduction) {
    await sendResendMail({
      to: mail.to,
      subject: "Todap giriş bağlantısı",
      text: `Todap'a giriş yapmak için bağlantıyı açın:\n\n${mail.link}\n\n` +
        `Veya şu 6 haneli kodu kullanın: ${mail.code}\n\n` +
        "Bağlantı ve kod 15 dakika geçerlidir. Giriş isteğini siz yapmadıysanız bu e-postayı dikkate almayın.",
    });
    return;
  }

  console.log(
    [
      "",
      "----- GİRİŞ E-POSTASI (geliştirme) -----",
      `Alıcı: ${mail.to}`,
      `Bağlantı: ${mail.link}`,
      `6 haneli kod: ${mail.code}`,
      "----------------------------------------",
      "",
    ].join("\n"),
  );
}
