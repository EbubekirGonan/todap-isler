import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { config } from "../config.js";

// Token ve kodlar veritabanında düz metin tutulmaz; SESSION_SECRET ile HMAC'i saklanır.
export function hashSecret(value: string): string {
  return createHmac("sha256", config.sessionSecret).update(value).digest("hex");
}

// Bağlantıdaki tek kullanımlık token (URL-safe, 256 bit).
export function createLinkToken(): string {
  return randomBytes(32).toString("base64url");
}

// iOS'ta kopyalanabilecek 6 haneli kod; baştaki sıfırlar korunur.
export function createLoginCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function createSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

// Sabit zamanlı karşılaştırma; hash uzunlukları eşit olduğu için güvenli.
export function safeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}
