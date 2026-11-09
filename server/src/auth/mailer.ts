import { config } from "../config.js";

export type LoginMail = {
  to: string;
  link: string;
  code: string;
};

// Geliştirmede e-posta yerine konsola yazar. Canlı sağlayıcı Faz 8'de seçilecek.
export async function sendLoginMail(mail: LoginMail): Promise<void> {
  if (config.isProduction) {
    throw new Error("Canlı e-posta sağlayıcısı henüz yapılandırılmadı.");
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
