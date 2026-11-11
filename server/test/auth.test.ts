import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import type { Server } from "node:http";
import { after, before, describe, mock, test } from "node:test";
import { fileURLToPath } from "node:url";

// Testler yalnızca test veritabanına bağlanır; geliştirme veritabanı (.env) asla kullanılmaz.
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error("TEST_DATABASE_URL tanımlı değil; testler çalıştırılamaz.");
}
const dbName = new URL(testDatabaseUrl).pathname.replace(/^\//, "");
if (!dbName.endsWith("test")) {
  throw new Error(`Test veritabanı adı "test" ile bitmeli, alınan: "${dbName}".`);
}

process.env.DATABASE_URL = testDatabaseUrl;
process.env.PORT = "3999";
process.env.SESSION_SECRET = "test-session-secret";
process.env.APP_BASE_URL = "http://localhost:5173";

const serverDir = fileURLToPath(new URL("..", import.meta.url));

// Config ve veritabanı modülleri ortam değişkenleri ayarlandıktan sonra yüklenmeli.
const { createApp } = await import("../src/app.js");
const { pool, query } = await import("../src/db.js");
const { createSession } = await import("../src/auth/session.js");
const { createLinkToken, hashSecret } = await import("../src/auth/tokens.js");
const { config } = await import("../src/config.js");

let server: Server;
let baseUrl: string;

before(async () => {
  execFileSync("npx", ["node-pg-migrate", "up", "-m", "migrations", "--database-url-var", "DATABASE_URL"], {
    cwd: serverDir,
    env: process.env,
    stdio: "inherit",
  });
  await query("TRUNCATE sessions, login_tokens, users RESTART IDENTITY CASCADE");

  server = await new Promise<Server>((resolve) => {
    const s = createApp().listen(0, () => resolve(s));
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Test sunucusu adresi alınamadı.");
  }
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await pool.end();
});

async function createUser(email: string, active = true): Promise<string> {
  const result = await query<{ id: string }>(
    "INSERT INTO users (name, email, active) VALUES ($1, $2, $3) RETURNING id",
    ["Test Kullanıcı", email, active],
  );
  return result.rows[0].id;
}

async function post(path: string, body: unknown) {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function sessionCookieFrom(res: Response): string {
  const cookie = res.headers.getSetCookie().find((c) => c.startsWith("todap_session="));
  assert.ok(cookie, "todap_session çerezi bekleniyordu");
  return cookie.split(";")[0];
}

// Giriş e-postasını konsol çıktısından yakalar; e-posta gitmediyse null döner.
async function requestAndCaptureMail(email: string) {
  const lines: string[] = [];
  const log = mock.method(console, "log", (...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  });
  try {
    const res = await post("/api/auth/request", { email });
    assert.equal(res.status, 202);
  } finally {
    log.mock.restore();
  }

  const link = lines.map((l) => l.match(/Bağlantı: (\S+)/)?.[1]).find(Boolean);
  const code = lines.map((l) => l.match(/6 haneli kod: (\d{6})/)?.[1]).find(Boolean);
  if (!link || !code) {
    return null;
  }
  return { link, code, token: new URL(link).hash.replace("#token=", "") };
}

describe("giriş isteği", () => {
  test("canlı e-posta hatası kayıtsız adresle aynı yanıtı verir ve hata günlüğüne yazılır", async () => {
    await createUser("resend-error@example.com");
    const original = { isProduction: config.isProduction, resendApiKey: config.resendApiKey, emailFrom: config.emailFrom };
    const realFetch = globalThis.fetch;
    const fetchMock = mock.method(globalThis, "fetch", async (...args: Parameters<typeof fetch>) => {
      if (args[0] === "https://api.resend.com/emails") return new Response("gizli içerik", { status: 503 });
      return realFetch(...args);
    });
    const errorLog = mock.method(console, "error", () => {});
    try {
      config.isProduction = true;
      config.resendApiKey = "test-api-key";
      config.emailFrom = "giris@auth.example.com";
      const known = await post("/api/auth/request", { email: "resend-error@example.com" });
      const unknown = await post("/api/auth/request", { email: "unknown-resend@example.com" });
      assert.equal(known.status, 202);
      assert.equal(unknown.status, 202);
      assert.deepEqual(await known.json(), await unknown.json());
      assert.equal(errorLog.mock.callCount(), 1);
      assert.match(String(errorLog.mock.calls[0].arguments[1]), /503/);
      assert.ok(!String(errorLog.mock.calls[0].arguments[1]).includes("gizli içerik"));
    } finally {
      Object.assign(config, original);
      fetchMock.mock.restore();
      errorLog.mock.restore();
    }
  });

  test("geçersiz e-posta 400 döner", async () => {
    const res = await post("/api/auth/request", { email: "bozuk-eposta" });
    assert.equal(res.status, 400);
  });

  test("kayıtlı olmayan ve pasif e-postalara aynı yanıt döner ama mail gitmez", async () => {
    await createUser("pasif@example.com", false);

    const unknown = await post("/api/auth/request", { email: "yok@example.com" });
    const inactive = await post("/api/auth/request", { email: "pasif@example.com" });

    assert.equal(unknown.status, 202);
    assert.equal(inactive.status, 202);
    assert.deepEqual(await unknown.json(), await inactive.json());
    assert.equal(await requestAndCaptureMail("yok@example.com"), null);
    assert.equal(await requestAndCaptureMail("pasif@example.com"), null);
  });

  test("e-posta büyük/küçük harf duyarsız eşleşir", async () => {
    await createUser("buyuk@example.com");
    const mail = await requestAndCaptureMail("  BUYUK@Example.COM ");
    assert.ok(mail, "e-posta gönderilmeliydi");
  });

  test("token veritabanında yalnızca hash olarak tutulur", async () => {
    await createUser("hash@example.com");
    const mail = await requestAndCaptureMail("hash@example.com");
    assert.ok(mail);

    const rows = await query<{ token_hash: string; code_hash: string }>(
      "SELECT lt.token_hash, lt.code_hash FROM login_tokens lt JOIN users u ON u.id = lt.user_id WHERE u.email = $1",
      ["hash@example.com"],
    );
    assert.equal(rows.rows.length, 1);
    assert.equal(rows.rows[0].token_hash, hashSecret(mail.token));
    assert.equal(rows.rows[0].code_hash, hashSecret(mail.code));
    assert.notEqual(rows.rows[0].token_hash, mail.token);
    assert.notEqual(rows.rows[0].code_hash, mail.code);
  });

  test("kullanıcı başına 15 dakikada en fazla 3 e-posta gider", async () => {
    await createUser("sinir@example.com");
    for (let i = 0; i < 3; i++) {
      assert.ok(await requestAndCaptureMail("sinir@example.com"), `${i + 1}. e-posta gitmeliydi`);
    }
    assert.equal(await requestAndCaptureMail("sinir@example.com"), null);
  });
});

describe("bağlantı ile giriş", () => {
  test("geçerli bağlantı oturum açar, çerez güvenlik bayraklarını taşır ve tek kullanımlıktır", async () => {
    await createUser("link@example.com");
    const mail = await requestAndCaptureMail("link@example.com");
    assert.ok(mail);

    const res = await post("/api/auth/verify-link", { token: mail.token });
    assert.equal(res.status, 204);

    const setCookie = res.headers.get("set-cookie") ?? "";
    assert.match(setCookie, /HttpOnly/);
    assert.match(setCookie, /SameSite=Lax/);
    assert.match(setCookie, /Path=\//);
    assert.match(setCookie, /Max-Age=2592000/);

    const me = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Cookie: sessionCookieFrom(res) },
    });
    assert.equal(me.status, 200);
    assert.equal((await me.json()).user.email, "link@example.com");

    const reuse = await post("/api/auth/verify-link", { token: mail.token });
    assert.equal(reuse.status, 401);
  });

  test("süresi dolmuş bağlantı reddedilir", async () => {
    const userId = await createUser("expired-link@example.com");
    const token = createLinkToken();
    await query(
      `INSERT INTO login_tokens (user_id, token_hash, code_hash, expires_at)
       VALUES ($1, $2, $3, now() - interval '1 minute')`,
      [userId, hashSecret(token), hashSecret("123456")],
    );

    const res = await post("/api/auth/verify-link", { token });
    assert.equal(res.status, 401);
  });

  test("geçersiz token gövdesi 400 döner", async () => {
    const res = await post("/api/auth/verify-link", {});
    assert.equal(res.status, 400);
  });
});

describe("kod ile giriş", () => {
  test("doğru kod oturum açar", async () => {
    await createUser("kod@example.com");
    const mail = await requestAndCaptureMail("kod@example.com");
    assert.ok(mail);

    const res = await post("/api/auth/verify-code", { email: "kod@example.com", code: mail.code });
    assert.equal(res.status, 204);
    assert.ok(res.headers.get("set-cookie")?.startsWith("todap_session="));
  });

  test("5 yanlış denemeden sonra doğru kod da reddedilir", async () => {
    await createUser("deneme@example.com");
    const mail = await requestAndCaptureMail("deneme@example.com");
    assert.ok(mail);

    const wrong = mail.code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) {
      const res = await post("/api/auth/verify-code", { email: "deneme@example.com", code: wrong });
      assert.equal(res.status, 401);
    }

    const res = await post("/api/auth/verify-code", { email: "deneme@example.com", code: mail.code });
    assert.equal(res.status, 401);
  });

  test("yeni istek gönderilince eski kod geçersiz olur", async () => {
    await createUser("eski-kod@example.com");
    const first = await requestAndCaptureMail("eski-kod@example.com");
    const second = await requestAndCaptureMail("eski-kod@example.com");
    assert.ok(first && second);

    if (first.code !== second.code) {
      const res = await post("/api/auth/verify-code", { email: "eski-kod@example.com", code: first.code });
      assert.equal(res.status, 401);
    }
    const ok = await post("/api/auth/verify-code", { email: "eski-kod@example.com", code: second.code });
    assert.equal(ok.status, 204);
  });

  test("biçimi bozuk kod 400 döner", async () => {
    const res = await post("/api/auth/verify-code", { email: "kod@example.com", code: "12345" });
    assert.equal(res.status, 400);
  });
});

describe("oturum", () => {
  test("çerez olmadan /me 401 döner", async () => {
    const res = await fetch(`${baseUrl}/api/auth/me`);
    assert.equal(res.status, 401);
  });

  test("çıkış oturumu iptal eder", async () => {
    const userId = await createUser("cikis@example.com");
    const token = await createSession(userId);
    const cookie = `todap_session=${token}`;

    const before = await fetch(`${baseUrl}/api/auth/me`, { headers: { Cookie: cookie } });
    assert.equal(before.status, 200);

    const out = await fetch(`${baseUrl}/api/auth/logout`, { method: "POST", headers: { Cookie: cookie } });
    assert.equal(out.status, 204);

    const after = await fetch(`${baseUrl}/api/auth/me`, { headers: { Cookie: cookie } });
    assert.equal(after.status, 401);
  });

  test("pasif edilen kullanıcının mevcut oturumu hemen geçersiz olur", async () => {
    const userId = await createUser("pasiflesen@example.com");
    const cookie = `todap_session=${await createSession(userId)}`;

    await query("UPDATE users SET active = false WHERE id = $1", [userId]);
    const res = await fetch(`${baseUrl}/api/auth/me`, { headers: { Cookie: cookie } });
    assert.equal(res.status, 401);
  });

  describe("hareketsizlik süresi (30 gün)", () => {
    test("31 gün hareketsiz oturum reddedilir", async () => {
      const userId = await createUser("eski-oturum@example.com");
      const token = await createSession(userId);
      await query(
        "UPDATE sessions SET last_seen_at = now() - interval '31 days' WHERE token_hash = $1",
        [hashSecret(token)],
      );

      const res = await fetch(`${baseUrl}/api/auth/me`, { headers: { Cookie: `todap_session=${token}` } });
      assert.equal(res.status, 401);
    });

    test("20 gün hareketsiz oturum kabul edilir", async () => {
      const userId = await createUser("yeni-oturum@example.com");
      const token = await createSession(userId);
      await query(
        "UPDATE sessions SET last_seen_at = now() - interval '20 days' WHERE token_hash = $1",
        [hashSecret(token)],
      );

      const res = await fetch(`${baseUrl}/api/auth/me`, { headers: { Cookie: `todap_session=${token}` } });
      assert.equal(res.status, 200);
    });
  });
});
