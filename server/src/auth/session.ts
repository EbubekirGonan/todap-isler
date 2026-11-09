import type { NextFunction, Request, Response } from "express";
import { query } from "../db.js";
import { createSessionToken, hashSecret } from "./tokens.js";

export const SESSION_COOKIE = "todap_session";
// Hareketsiz kalma süresi; her etkinlikte kayar. Çerez de aynı süreyle yenilenir.
export const SESSION_IDLE_DAYS = 30;
const LAST_SEEN_UPDATE_INTERVAL_HOURS = 24;

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

type SessionRow = {
  session_id: string;
  id: string;
  name: string;
  email: string;
  is_admin: boolean;
};

export async function createSession(userId: string): Promise<string> {
  const token = createSessionToken();
  await query("INSERT INTO sessions (user_id, token_hash) VALUES ($1, $2)", [
    userId,
    hashSecret(token),
  ]);
  return token;
}

// Oturum geçerliyse kullanıcıyı döndürür. Pasif kullanıcının ve süresi dolmuş oturumun geçersizliği burada kontrol edilir.
export async function resolveSession(token: string): Promise<AuthUser | null> {
  const result = await query<SessionRow>(
    `SELECT s.id AS session_id, u.id, u.name, u.email, u.is_admin
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1
        AND s.revoked_at IS NULL
        AND s.last_seen_at > now() - ($2::int * interval '1 day')
        AND u.active`,
    [hashSecret(token), SESSION_IDLE_DAYS],
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  await query(
    `UPDATE sessions
        SET last_seen_at = now()
      WHERE id = $1
        AND last_seen_at < now() - ($2::int * interval '1 hour')`,
    [row.session_id, LAST_SEEN_UPDATE_INTERVAL_HOURS],
  );

  return { id: row.id, name: row.name, email: row.email, isAdmin: row.is_admin };
}

export async function revokeSession(token: string): Promise<void> {
  await query("UPDATE sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL", [
    hashSecret(token),
  ]);
}

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE, token, sessionCookieOptions());
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, sessionCookieOptions());
}

function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_IDLE_DAYS * 24 * 60 * 60 * 1000,
    secure: process.env.NODE_ENV === "production",
  };
}

export function readSessionCookie(req: Request): string | undefined {
  const header = req.headers.cookie;
  if (!header) {
    return undefined;
  }

  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SESSION_COOKIE) {
      return decodeURIComponent(rest.join("="));
    }
  }
  return undefined;
}

// Oturum çerezini okuyup req.user'ı doldurur; geçerli değilse 401 döner.
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = readSessionCookie(req);
  if (!token) {
    res.status(401).json({ error: "Giriş yapmanız gerekiyor." });
    return;
  }

  const user = await resolveSession(token);
  if (!user) {
    clearSessionCookie(res);
    res.status(401).json({ error: "Oturumunuzun süresi doldu. Lütfen yeniden giriş yapın." });
    return;
  }

  req.user = user;
  setSessionCookie(res, token);
  next();
}
