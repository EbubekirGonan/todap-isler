import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import type { Server } from "node:http";
import { after, before, describe, test } from "node:test";
import { fileURLToPath } from "node:url";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error("TEST_DATABASE_URL tanımlı değil; testler çalıştırılamaz.");
}
const dbName = new URL(testDatabaseUrl).pathname.replace(/^\//, "");
if (!dbName.endsWith("test")) {
  throw new Error(`Test veritabanı adı "test" ile bitmeli, alınan: "${dbName}".`);
}

process.env.DATABASE_URL = testDatabaseUrl;
process.env.PORT = "3997";
process.env.SESSION_SECRET = "test-session-secret";
process.env.APP_BASE_URL = "http://localhost:5173";

const serverDir = fileURLToPath(new URL("..", import.meta.url));
const { createApp } = await import("../src/app.js");
const { pool, query } = await import("../src/db.js");
const { createSession } = await import("../src/auth/session.js");

let server: Server;
let baseUrl: string;
let adminId: string;
let memberId: string;

before(async () => {
  execFileSync("npx", ["node-pg-migrate", "up", "-m", "migrations", "--database-url-var", "DATABASE_URL"], {
    cwd: serverDir,
    env: process.env,
    stdio: "inherit",
  });
  await query("TRUNCATE users RESTART IDENTITY CASCADE");
  const users = await query<{ id: string }>(
    "INSERT INTO users (name, email, is_admin) VALUES ($1, $2, true), ($3, $4, false) RETURNING id",
    ["Yönetici", "admin-test@example.com", "Üye", "member-test@example.com"],
  );
  [adminId, memberId] = users.rows.map((row) => row.id);
  server = await new Promise<Server>((resolve) => {
    const listener = createApp().listen(0, () => resolve(listener));
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test sunucusu adresi alınamadı.");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  await pool.end();
});

async function postUser(userId: string | null, body: unknown): Promise<Response> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (userId) headers.Cookie = `todap_session=${await createSession(userId)}`;
  return fetch(`${baseUrl}/api/users`, { method: "POST", headers, body: JSON.stringify(body) });
}

describe("yönetici kişi ekleme", () => {
  test("oturumsuz ve yönetici olmayan kullanıcılar kişi ekleyemez", async () => {
    const input = { name: "Kişi", email: "blocked@example.com", isAdmin: true };
    assert.equal((await postUser(null, input)).status, 401);
    assert.equal((await postUser(memberId, input)).status, 403);
    const result = await query("SELECT 1 FROM users WHERE email = $1", [input.email]);
    assert.equal(result.rowCount, 0);
  });

  test("yönetici normal kullanıcı veya başka bir yönetici ekleyebilir", async () => {
    const normal = await postUser(adminId, { name: "  Yeni Kişi  ", email: "  NEW@example.com  ", phone: "  +90 123  " });
    assert.equal(normal.status, 201);
    const { id } = (await normal.json()) as { id: string };
    const result = await query("SELECT name, email, phone, active, is_admin FROM users WHERE id = $1", [id]);
    assert.deepEqual(result.rows[0], {
      name: "Yeni Kişi", email: "new@example.com", phone: "+90 123", active: true, is_admin: false,
    });

    const admin = await postUser(adminId, { name: "Yeni yönetici", email: "new-admin@example.com", phone: "", isAdmin: true });
    assert.equal(admin.status, 201);
    const adminRecord = await query("SELECT phone, is_admin FROM users WHERE email = $1", ["new-admin@example.com"]);
    assert.deepEqual(adminRecord.rows[0], { phone: null, is_admin: true });

    const headers = { Cookie: `todap_session=${await createSession(memberId)}` };
    const listing = await fetch(`${baseUrl}/api/users`, { headers });
    assert.equal(listing.status, 200);
    const body = (await listing.json()) as { users: Array<Record<string, unknown>> };
    const added = body.users.find((user) => user.id === id);
    assert.deepEqual(added, { id, name: "Yeni Kişi" });
  });

  test("geçersiz alanlar reddedilir", async () => {
    const cases = [
      { name: "  ", email: "valid@example.com" },
      { name: "a".repeat(101), email: "valid@example.com" },
      { name: "Kişi", email: "invalid" },
      { name: "Kişi", email: "a".repeat(250) + "@example.com" },
      { name: "Kişi", email: "valid@example.com", phone: "a".repeat(51) },
      { name: "Kişi", email: "valid@example.com", isAdmin: "true" },
    ];
    for (const input of cases) assert.equal((await postUser(adminId, input)).status, 400);
  });

  test("aynı e-posta büyük/küçük harften ve kayıt durumundan bağımsız olarak reddedilir", async () => {
    await query("UPDATE users SET active = false WHERE email = $1", ["new@example.com"]);
    const response = await postUser(adminId, { name: "Başka kişi", email: " NEW@EXAMPLE.COM ", isAdmin: true });
    assert.equal(response.status, 409);
    const result = await query("SELECT name, active, is_admin FROM users WHERE email = $1", ["new@example.com"]);
    assert.deepEqual(result.rows[0], { name: "Yeni Kişi", active: false, is_admin: false });
  });

  test("eşzamanlı aynı e-posta isteklerinden yalnızca biri başarılı olur", async () => {
    const input = { name: "Eşzamanlı", email: "race@example.com" };
    const responses = await Promise.all([postUser(adminId, input), postUser(adminId, input)]);
    assert.deepEqual(responses.map((response) => response.status).sort(), [201, 409]);
  });
});
