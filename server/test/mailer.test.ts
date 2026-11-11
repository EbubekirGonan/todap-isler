import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { afterEach, mock, test } from "node:test";

process.env.NODE_ENV = "production";
process.env.DATABASE_URL = "postgres://localhost/test";
process.env.PORT = "3999";
process.env.SESSION_SECRET = "test-secret";
process.env.APP_BASE_URL = "https://app.example.com";
process.env.RESEND_API_KEY = "test-api-key";
process.env.EMAIL_FROM = "giris@auth.example.com";

const { sendLoginMail } = await import("../src/auth/mailer.js");
const mail = { to: "kisi@example.com", link: "https://app.example.com/giris#token=test-token", code: "123456" };

afterEach(() => mock.restoreAll());

test("canlı e-posta bağlantıyı ve kodu Resend'e gönderir", async () => {
  const fetchMock = mock.method(globalThis, "fetch", async () => new Response('{"id":"test"}', { status: 200 }));
  await sendLoginMail(mail);
  assert.equal(fetchMock.mock.callCount(), 1);
  const [url, options] = fetchMock.mock.calls[0].arguments;
  assert.equal(url, "https://api.resend.com/emails");
  assert.equal(options?.method, "POST");
  assert.deepEqual(options?.headers, { Authorization: "Bearer test-api-key", "Content-Type": "application/json" });
  assert.equal(typeof options?.body, "string");
  const body = JSON.parse(options.body as string) as { from: string; to: string[]; subject: string; text: string };
  assert.equal(body.from, "giris@auth.example.com");
  assert.deepEqual(body.to, [mail.to]);
  assert.match(body.subject, /Todap/);
  assert.ok(body.text.includes(mail.link));
  assert.ok(body.text.includes(mail.code));
  assert.ok(options.signal);
});

test("Resend hatası durum koduyla, yanıtın hassas içeriği olmadan raporlanır", async () => {
  mock.method(globalThis, "fetch", async () => new Response("gizli içerik", { status: 429 }));
  await assert.rejects(sendLoginMail(mail), (error: Error) =>
    error.message.includes("429") && !error.message.includes("gizli içerik"),
  );
});

test("ağ hatası hassas ayrıntılar olmadan raporlanır", async () => {
  mock.method(globalThis, "fetch", async () => { throw new Error("gizli içerik"); });
  await assert.rejects(sendLoginMail(mail), { message: "Resend'e bağlanılamadı." });
});

test("üretimde Resend değişkenleri eksikse yapılandırma başarısız olur", () => {
  for (const key of ["RESEND_API_KEY", "EMAIL_FROM"]) {
    const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", "await import('./src/config.ts')"], {
      cwd: process.cwd(),
      env: { ...process.env, [key]: " " },
      encoding: "utf8",
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, new RegExp(key));
    assert.ok(!result.stderr.includes("test-api-key"));
  }
});

test("üretimde geçersiz gönderen veya HTTPS dışı uygulama adresi reddedilir", () => {
  for (const [key, value] of [["APP_BASE_URL", "http://localhost:5173"], ["EMAIL_FROM", "hatalı"]]) {
    const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", "await import('./src/config.ts')"], {
      cwd: process.cwd(),
      env: { ...process.env, [key]: value },
      encoding: "utf8",
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, new RegExp(key));
  }
});
