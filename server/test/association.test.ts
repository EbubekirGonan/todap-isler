import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import type { Server } from "node:http";
import { after, before, describe, test } from "node:test";
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

let server: Server;
let baseUrl: string;

before(async () => {
  execFileSync("npx", ["node-pg-migrate", "up", "-m", "migrations", "--database-url-var", "DATABASE_URL"], {
    cwd: serverDir,
    env: process.env,
    stdio: "inherit",
  });
  await query(
    "TRUNCATE association_tile_members, association_tiles, sessions, login_tokens, users RESTART IDENTITY CASCADE",
  );

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

async function createUser(name: string, isAdmin = false): Promise<string> {
  const result = await query<{ id: string }>(
    "INSERT INTO users (name, email, is_admin) VALUES ($1, $2, $3) RETURNING id",
    [name, `${name.toLowerCase()}@example.com`, isAdmin],
  );
  return result.rows[0].id;
}

async function api(method: string, path: string, userId: string | null, body?: unknown): Promise<Response> {
  const headers: Record<string, string> = {};
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (userId) {
    headers.Cookie = `todap_session=${await createSession(userId)}`;
  }
  return fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function createTile(adminId: string, title: string): Promise<string> {
  const res = await api("POST", "/api/association/tiles", adminId, { title, description: `${title} açıklaması` });
  assert.equal(res.status, 201);
  return ((await res.json()) as { id: string }).id;
}

type TileResponse = { tiles: { id: string; title: string; description: string | null }[] };

describe("dernek kutucukları", () => {
  test("kutucuklar eklenme sırasına göre listelenir ve yalnızca yönetici ekleyebilir", async () => {
    const admin = await createUser("Yonetici1", true);
    const member = await createUser("Uye1");

    const forbidden = await api("POST", "/api/association/tiles", member, { title: "Yetkisiz" });
    assert.equal(forbidden.status, 403);

    await createTile(admin, "Birinci kutucuk");
    await createTile(admin, "İkinci kutucuk");

    const res = await api("GET", "/api/association/tiles", member);
    assert.equal(res.status, 200);
    const body = (await res.json()) as TileResponse;
    assert.deepEqual(
      body.tiles.map((tile) => tile.title),
      ["Birinci kutucuk", "İkinci kutucuk"],
    );
  });

  test("yönetici kutucuğu düzenler; yönetici olmayan düzenleyemez", async () => {
    const admin = await createUser("Yonetici2", true);
    const member = await createUser("Uye2");
    const tileId = await createTile(admin, "Eski başlık");

    const forbidden = await api("PATCH", `/api/association/tiles/${tileId}`, member, { title: "Yeni" });
    assert.equal(forbidden.status, 403);

    const res = await api("PATCH", `/api/association/tiles/${tileId}`, admin, {
      title: "Yeni başlık",
      description: "Yeni açıklama",
    });
    assert.equal(res.status, 204);

    const body = (await (await api("GET", "/api/association/tiles", member)).json()) as TileResponse;
    const edited = body.tiles.find((tile) => tile.id === tileId);
    assert.equal(edited?.title, "Yeni başlık");
    assert.equal(edited?.description, "Yeni açıklama");
  });

  test("silinmiş kutucuk listelenmez ve düzenlenemez", async () => {
    const admin = await createUser("Yonetici4", true);
    const tileId = await createTile(admin, "Silinecek kutucuk");
    await query("UPDATE association_tiles SET deleted_at = now() WHERE id = $1", [tileId]);

    const listed = (await (await api("GET", "/api/association/tiles", admin)).json()) as TileResponse;
    assert.equal(listed.tiles.some((tile) => tile.id === tileId), false);

    const res = await api("PATCH", `/api/association/tiles/${tileId}`, admin, { title: "Değişmez" });
    assert.equal(res.status, 404);
  });

  test("kişi uçları kaldırıldı", async () => {
    const admin = await createUser("Yonetici5", true);
    const person = await createUser("Kisi5");
    const tileId = await createTile(admin, "Kişisiz kutucuk");

    const added = await api("POST", `/api/association/tiles/${tileId}/people`, admin, { userId: person });
    assert.equal(added.status, 404);

    const removed = await api("DELETE", `/api/association/tiles/${tileId}/people/${person}`, admin);
    assert.equal(removed.status, 404);
  });
});
