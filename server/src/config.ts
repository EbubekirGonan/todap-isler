import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

// Bu dosya server/src altında (dev) ya da server/dist altında (build) olduğu için
// repo kökündeki .env iki üst klasörde bulunur.
const here = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(here, "..", "..", ".env");

if (existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const requiredKeys = ["DATABASE_URL", "PORT", "SESSION_SECRET", "APP_BASE_URL"] as const;

const missing = requiredKeys.filter((key) => !process.env[key]?.trim());

if (missing.length > 0) {
  console.error(
    `Eksik ortam değişkenleri: ${missing.join(", ")}.\n` +
      `Lütfen repo kökündeki .env dosyasını doldurun (örnek: .env.example).`,
  );
  process.exit(1);
}

const port = Number(process.env.PORT);

if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  console.error(`PORT geçerli bir port numarası olmalı, alınan değer: "${process.env.PORT}".`);
  process.exit(1);
}

export const config = {
  databaseUrl: process.env.DATABASE_URL as string,
  port,
  sessionSecret: process.env.SESSION_SECRET as string,
  appBaseUrl: process.env.APP_BASE_URL as string,
};
