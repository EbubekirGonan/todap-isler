import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl || !new URL(databaseUrl).pathname.replace(/^\//, "").endsWith("test")) {
  throw new Error('TEST_DATABASE_URL adı "test" ile biten bir test veritabanı göstermelidir.');
}
process.env.DATABASE_URL = databaseUrl;
process.env.NODE_ENV = "production";
process.env.PORT = "3999";
process.env.SESSION_SECRET = "test-session-secret";
process.env.APP_BASE_URL = "https://app.example.com";
process.env.RESEND_API_KEY = "test-api-key";
process.env.EMAIL_FROM = "giris@example.com";
process.env.FEEDBACK_EMAIL = "feedback@example.com";

const { createApp } = await import("../src/app.js");
const { pool, query } = await import("../src/db.js");
const { createSession } = await import("../src/auth/session.js");
const { config } = await import("../src/config.js");
const realFetch = globalThis.fetch;
const sent: Array<Record<string, unknown>> = [];
let mailStatus = 200;
let server: Server;
let baseUrl: string;
let cookie: string;
let limitedCookie: string;
let otherCookie: string;
const senderEmail = `sender-${randomUUID()}@example.com`;

async function newCookie(email: string): Promise<string> {
  const result = await query<{ id: string }>(
    "INSERT INTO users (name, email) VALUES ($1, $2) RETURNING id",
    ["Test kullanıcı", email],
  );
  return `todap_session=${await createSession(result.rows[0].id)}`;
}

async function post(message: unknown, session?: string): Promise<Response> {
  return realFetch(`${baseUrl}/api/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(session ? { Cookie: session } : {}) },
    body: JSON.stringify({ message }),
  });
}

before(async () => {
  execFileSync("npx", ["node-pg-migrate", "up", "-m", "migrations", "--database-url-var", "DATABASE_URL"], {
    cwd: fileURLToPath(new URL("..", import.meta.url)), env: process.env, stdio: "inherit",
  });
  cookie = await newCookie(senderEmail);
  limitedCookie = await newCookie(`limited-${randomUUID()}@example.com`);
  otherCookie = await newCookie(`other-${randomUUID()}@example.com`);
  globalThis.fetch = async (input, init) => {
    assert.equal(input, "https://api.resend.com/emails");
    assert.equal(typeof init?.body, "string");
    sent.push(JSON.parse(init.body as string) as Record<string, unknown>);
    return new Response("gizli içerik", { status: mailStatus });
  };
  server = await new Promise<Server>((resolve) => {
    const listener = createApp().listen(0, () => resolve(listener));
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test sunucusu adresi alınamadı.");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  globalThis.fetch = realFetch;
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  await pool.end();
});

test("oturum ve mesaj doğrulanır", async () => {
  assert.equal((await post("Merhaba")).status, 401);
  for (const value of ["", "   ", "a".repeat(4001), 42]) {
    assert.equal((await post(value, cookie)).status, 400);
  }
  assert.equal(sent.length, 0);
});

test("mesaj oturum sahibinin bilgileriyle Resend'e iletilir", async () => {
  const response = await realFetch(`${baseUrl}/api/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ message: "  Deneme mesajı  ", email: "sahte@example.com", to: "sahte@example.com" }),
  });
  assert.equal(response.status, 202);
  assert.deepEqual(await response.json(), { message: "Mesajınız gönderim için kabul edildi." });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].from, "giris@example.com");
  assert.deepEqual(sent[0].to, ["feedback@example.com"]);
  assert.equal(sent[0].reply_to, senderEmail);
  assert.equal(sent[0].text, `Gönderen: Test kullanıcı\nE-posta: ${senderEmail}\n\nDeneme mesajı`);
});

test("4000 karakterlik mesaj kabul edilir", async () => {
  const message = "a".repeat(4000);
  assert.equal((await post(message, otherCookie)).status, 202);
  assert.ok(String(sent.at(-1)?.text).endsWith(message));
});

test("gönderim hataları ve eksik yapılandırma başarı gibi gösterilmez", async () => {
  mailStatus = 503;
  const response = await post("Hatalı gönderim", cookie);
  assert.equal(response.status, 502);
  assert.ok(!(await response.text()).includes("gizli içerik"));
  mailStatus = 200;
  const recipient = config.feedbackEmail;
  config.feedbackEmail = null;
  try {
    assert.equal((await post("Eksik ayar", cookie)).status, 503);
  } finally {
    config.feedbackEmail = recipient;
  }
});

test("sınır kullanıcı başına beş mesajdır; diğer kullanıcı etkilenmez", async () => {
  for (let i = 0; i < 5; i++) assert.equal((await post("Deneme", limitedCookie)).status, 202);
  assert.equal((await post("Altıncı", limitedCookie)).status, 429);
  assert.equal((await post("Diğer kullanıcı", otherCookie)).status, 202);
});

test("geçersiz alıcı yapılandırması reddedilir", () => {
  const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", "await import('./src/config.ts')"], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    env: { ...process.env, FEEDBACK_EMAIL: "geçersiz" },
    encoding: "utf8",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /FEEDBACK_EMAIL/);
});
