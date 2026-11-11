import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type { Server } from "node:http";
import { after, before, test } from "node:test";
import { dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl || !new URL(testDatabaseUrl).pathname.replace(/^\//, "").endsWith("test")) {
  throw new Error('TEST_DATABASE_URL adı "test" ile biten bir test veritabanı göstermelidir.');
}

process.env.DATABASE_URL = testDatabaseUrl;
process.env.NODE_ENV = "production";
process.env.PORT = "3999";
process.env.SESSION_SECRET = "test-session-secret";
process.env.APP_BASE_URL = "https://app.example.com";
process.env.RESEND_API_KEY = "test-api-key";
process.env.EMAIL_FROM = "giris@example.com";

const serverDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let webDir: string;
const { createApp } = await import("../src/app.js");
const { pool, query } = await import("../src/db.js");
const { createLinkToken, hashSecret } = await import("../src/auth/tokens.js");
let server: Server;
let baseUrl: string;

before(async () => {
  webDir = mkdtempSync(resolve(tmpdir(), "todap-web-test-"));
  writeFileSync(resolve(webDir, "index.html"), '<html><body><div id="root"></div></body></html>');
  writeFileSync(resolve(webDir, "manifest.webmanifest"), "{}");
  writeFileSync(resolve(webDir, "sw.js"), "self.skipWaiting();");
  writeFileSync(resolve(webDir, "registerSW.js"), "navigator.serviceWorker.register('/sw.js');");
  execFileSync("npx", ["node-pg-migrate", "up", "-m", "migrations", "--database-url-var", "DATABASE_URL"], {
    cwd: serverDir, env: process.env, stdio: "inherit",
  });
  server = await new Promise<Server>((resolveServer) => {
    const listener = createApp({ webDir }).listen(0, () => resolveServer(listener));
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test sunucusu adresi alınamadı.");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  if (server) await new Promise<void>((resolveServer) => server.close(() => resolveServer()));
  await pool.end();
  if (webDir) rmSync(webDir, { recursive: true, force: true });
});

test("derleme eksikse sunucu açık hata verir", () => {
  assert.throws(() => createApp({ webDir: resolve(webDir, "olmayan-klasor") }), /Arayüz derlemesi bulunamadı/);
});

test("ana sayfa, giriş yolu ve PWA dosyaları sunulur", async () => {
  for (const path of ["/", "/giris"]) {
    const res = await fetch(`${baseUrl}${path}`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", /text\/html/);
    assert.match(res.headers.get("cache-control") ?? "", /no-cache/);
    assert.match(await res.text(), /<div id="root"><\/div>/);
  }
  for (const path of ["/manifest.webmanifest", "/sw.js", "/registerSW.js"]) {
    assert.equal((await fetch(`${baseUrl}${path}`)).status, 200);
  }
  const worker = await fetch(`${baseUrl}/sw.js`);
  assert.match(worker.headers.get("cache-control") ?? "", /no-cache/);
  assert.equal(await worker.text(), "self.skipWaiting();");
});

test("API ve bulunmayan dosya yolları arayüze dönüşmez", async () => {
  for (const path of ["/api", "/api/olmayan", "/assets/olmayan.js", "/olmayan"]) {
    const response = await fetch(`${baseUrl}${path}`);
    assert.equal(response.status, 404);
    if (path.startsWith("/api")) assert.match(response.headers.get("content-type") ?? "", /application\/json/);
  }
});

test("API ve giriş oturumu arayüzle aynı adreste çalışır", async () => {
  const health = await fetch(`${baseUrl}/api/health`);
  assert.deepEqual(await health.json(), { status: "ok", db: "ok" });
  const created = await query<{ id: string }>(
    "INSERT INTO users (name, email) VALUES ($1, $2) RETURNING id",
    ["Yayın testi", `production-web-${Date.now()}@example.com`],
  );
  const token = createLinkToken();
  await query(
    "INSERT INTO login_tokens (user_id, token_hash, code_hash, expires_at) VALUES ($1, $2, $3, now() + interval '15 minutes')",
    [created.rows[0].id, hashSecret(token), hashSecret("123456")],
  );
  const response = await fetch(`${baseUrl}/api/auth/verify-link`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  assert.equal(response.status, 204);
  const cookie = response.headers.getSetCookie().find((value) => value.startsWith("todap_session="));
  assert.ok(cookie);
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /Secure/i);
  const me = await fetch(`${baseUrl}/api/auth/me`, { headers: { Cookie: cookie.split(";")[0] } });
  assert.equal(me.status, 200);
  assert.equal(((await me.json()) as { user: { id: string } }).user.id, created.rows[0].id);
});
