import { HttpError } from "./http-error.js";

const ID_PATTERN = /^[1-9]\d*$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function asObject(body: unknown): Record<string, unknown> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new HttpError(400, "Geçersiz istek gövdesi.");
  }
  return body as Record<string, unknown>;
}

export function parseId(value: unknown, message = "Geçersiz kimlik."): string {
  const text = typeof value === "number" ? String(value) : value;
  if (typeof text !== "string" || !ID_PATTERN.test(text)) {
    throw new HttpError(400, message);
  }
  return text;
}

export function parseOptionalId(value: unknown, message: string): string | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  return parseId(value, message);
}

export function parseRequiredText(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new HttpError(400, `${field} zorunludur.`);
  }
  const text = value.trim();
  if (text.length > maxLength) {
    throw new HttpError(400, `${field} en fazla ${maxLength} karakter olabilir.`);
  }
  return text;
}

export function parseOptionalText(value: unknown, field: string, maxLength: number): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "string") {
    throw new HttpError(400, `${field} metin olmalıdır.`);
  }
  const text = value.trim();
  if (text === "") {
    return null;
  }
  if (text.length > maxLength) {
    throw new HttpError(400, `${field} en fazla ${maxLength} karakter olabilir.`);
  }
  return text;
}

// Gün bilgisi YYYY-AA-GG biçiminde ve takvimde geçerli bir tarih olmalıdır.
export function parseOptionalDate(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) {
    throw new HttpError(400, `${field} YYYY-AA-GG biçiminde olmalıdır.`);
  }
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new HttpError(400, `${field} geçerli bir tarih olmalıdır.`);
  }
  return value;
}

export function parseBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new HttpError(400, `${field} true ya da false olmalıdır.`);
  }
  return value;
}

export function parseNonNegativeInteger(value: unknown, field: string, max: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > max) {
    throw new HttpError(400, `${field} 0 ile ${max} arasında bir tam sayı olmalıdır.`);
  }
  return value;
}
