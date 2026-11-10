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
process.env.PORT = "3998";
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
    "TRUNCATE team_messages, task_history, task_comments, task_assignments, tasks, project_teams, activity_log, projects, team_members, teams, sessions, login_tokens, users RESTART IDENTITY CASCADE",
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

async function createTeam(name: string): Promise<string> {
  const result = await query<{ id: string }>(
    "INSERT INTO teams (name, type) VALUES ($1, 'ongoing') RETURNING id",
    [name],
  );
  return result.rows[0].id;
}

async function addMember(teamId: string, userId: string): Promise<void> {
  await query("INSERT INTO team_members (team_id, user_id) VALUES ($1, $2)", [teamId, userId]);
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

type MessageDto = { id: string; body: string; authorName: string; isMine: boolean; updatedAt: string | null };

async function postMessage(teamId: string, userId: string, body: string): Promise<string> {
  const res = await api("POST", `/api/teams/${teamId}/messages`, userId, { body });
  assert.equal(res.status, 201);
  return ((await res.json()) as { id: string }).id;
}

async function listMessages(teamId: string, userId: string, query = ""): Promise<{ messages: MessageDto[]; hasMore: boolean }> {
  const res = await api("GET", `/api/teams/${teamId}/messages${query}`, userId);
  assert.equal(res.status, 200);
  return (await res.json()) as { messages: MessageDto[]; hasMore: boolean };
}

describe("ekip sohbeti okuma ve yazma", () => {
  test("üye mesaj yazar ve listede kendi mesajını görür", async () => {
    const team = await createTeam("Sohbet ekibi 1");
    const ali = await createUser("Ali1");
    await addMember(team, ali);
    const messageId = await postMessage(team, ali, "Merhaba ekip");

    const { messages } = await listMessages(team, ali);
    const found = messages.find((m) => m.id === messageId);
    assert.ok(found, "yeni mesaj listede olmalı");
    assert.equal(found.body, "Merhaba ekip");
    assert.equal(found.authorName, "Ali1");
    assert.equal(found.isMine, true);
  });

  test("ekip dışındaki kullanıcı okuyamaz ve yazamaz", async () => {
    const team = await createTeam("Sohbet ekibi 2");
    const member = await createUser("Uye2");
    const outsider = await createUser("Disari2");
    await addMember(team, member);
    await postMessage(team, member, "Gizli not");

    const read = await api("GET", `/api/teams/${team}/messages`, outsider);
    assert.equal(read.status, 403);
    const write = await api("POST", `/api/teams/${team}/messages`, outsider, { body: "Selam" });
    assert.equal(write.status, 403);
  });

  test("yönetici ekip sohbetini okur ama yazamaz", async () => {
    const team = await createTeam("Sohbet ekibi 3");
    const member = await createUser("Uye3");
    const admin = await createUser("Yonetici3", true);
    await addMember(team, member);
    const messageId = await postMessage(team, member, "Yönetici görmeli");

    const { messages } = await listMessages(team, admin);
    const found = messages.find((m) => m.id === messageId);
    assert.ok(found, "yönetici mesajı görmeli");
    assert.equal(found.isMine, false);

    const write = await api("POST", `/api/teams/${team}/messages`, admin, { body: "Yönetici yazıyor" });
    assert.equal(write.status, 403);
  });

  test("yönetici ekip görevlerini salt okuma ile görebilir", async () => {
    const team = await createTeam("Sohbet ekibi 4");
    const admin = await createUser("Yonetici4", true);
    const res = await api("GET", `/api/teams/${team}/tasks`, admin);
    assert.equal(res.status, 200);
  });

  test("boş ve 2000 karakteri aşan mesaj reddedilir", async () => {
    const team = await createTeam("Sohbet ekibi 5");
    const member = await createUser("Uye5");
    await addMember(team, member);

    const empty = await api("POST", `/api/teams/${team}/messages`, member, { body: "   " });
    assert.equal(empty.status, 400);
    const tooLong = await api("POST", `/api/teams/${team}/messages`, member, { body: "a".repeat(2001) });
    assert.equal(tooLong.status, 400);
    const maxLength = await api("POST", `/api/teams/${team}/messages`, member, { body: "a".repeat(2000) });
    assert.equal(maxLength.status, 201);
  });
});

describe("ekip sohbeti düzenleme ve silme", () => {
  test("yalnızca yazar düzenleyebilir ve düzenleme tarihi işlenir", async () => {
    const team = await createTeam("Düzenleme ekibi");
    const author = await createUser("Yazar6");
    const other = await createUser("Diger6");
    await addMember(team, author);
    await addMember(team, other);
    const messageId = await postMessage(team, author, "İlk hali");

    const denied = await api("PATCH", `/api/teams/${team}/messages/${messageId}`, other, { body: "Değiştirdim" });
    assert.equal(denied.status, 403);

    const ok = await api("PATCH", `/api/teams/${team}/messages/${messageId}`, author, { body: "Son hali" });
    assert.equal(ok.status, 204);

    const { messages } = await listMessages(team, other);
    const edited = messages.find((m) => m.id === messageId);
    assert.ok(edited);
    assert.equal(edited.body, "Son hali");
    assert.notEqual(edited.updatedAt, null);
  });

  test("yalnızca yazar silebilir; silinen mesaj listede ve düzenlemede görünmez", async () => {
    const team = await createTeam("Silme ekibi");
    const author = await createUser("Yazar7");
    const other = await createUser("Diger7");
    const admin = await createUser("Yonetici7", true);
    await addMember(team, author);
    await addMember(team, other);
    const messageId = await postMessage(team, author, "Silinecek");

    const denied = await api("DELETE", `/api/teams/${team}/messages/${messageId}`, admin);
    assert.equal(denied.status, 403);
    const deniedMember = await api("DELETE", `/api/teams/${team}/messages/${messageId}`, other);
    assert.equal(deniedMember.status, 403);

    const ok = await api("DELETE", `/api/teams/${team}/messages/${messageId}`, author);
    assert.equal(ok.status, 204);

    const { messages } = await listMessages(team, author);
    assert.equal(messages.some((m) => m.id === messageId), false);

    const editAfterDelete = await api("PATCH", `/api/teams/${team}/messages/${messageId}`, author, { body: "Geri" });
    assert.equal(editAfterDelete.status, 404);

    const row = await query<{ deleted_at: Date | null }>("SELECT deleted_at FROM team_messages WHERE id = $1", [messageId]);
    assert.equal(row.rowCount, 1, "mesaj fiziksel olarak silinmemeli");
    assert.notEqual(row.rows[0].deleted_at, null);
  });

  test("ekipten ayrılan kullanıcı sohbeti okuyamaz ve kendi mesajını değiştiremez", async () => {
    const team = await createTeam("Ayrılma ekibi");
    const leaver = await createUser("Ayrilan8");
    const stays = await createUser("Kalan8");
    await addMember(team, leaver);
    await addMember(team, stays);
    const messageId = await postMessage(team, leaver, "Ayrılmadan önce");

    const left = await api("POST", `/api/teams/${team}/leave`, leaver);
    assert.equal(left.status, 204);

    const read = await api("GET", `/api/teams/${team}/messages`, leaver);
    assert.equal(read.status, 403);
    const edit = await api("PATCH", `/api/teams/${team}/messages/${messageId}`, leaver, { body: "Sonradan" });
    assert.equal(edit.status, 403);

    const { messages } = await listMessages(team, stays);
    assert.ok(messages.some((m) => m.id === messageId), "mesaj ekipte kalmaya devam etmeli");
  });
});

describe("ekip sohbeti sayfalama ve akış", () => {
  test("en yeni mesajlar önce gelir ve imleçle geriye doğru sayfalanır", async () => {
    const team = await createTeam("Sayfalama ekibi");
    const member = await createUser("Uye9");
    await addMember(team, member);
    const ids: string[] = [];
    for (let i = 1; i <= 35; i += 1) {
      ids.push(await postMessage(team, member, `Mesaj ${i}`));
    }

    const first = await listMessages(team, member);
    assert.equal(first.messages.length, 30);
    assert.equal(first.hasMore, true);
    assert.equal(first.messages[first.messages.length - 1].id, ids[34], "son mesaj listenin sonunda olmalı");
    assert.equal(first.messages[0].id, ids[5]);

    const second = await listMessages(team, member, `?before=${first.messages[0].id}`);
    assert.equal(second.messages.length, 5);
    assert.equal(second.hasMore, false);
    assert.equal(second.messages[0].id, ids[0]);
  });

  test("sayfa boyutu geçersizse reddedilir", async () => {
    const team = await createTeam("Boyut ekibi");
    const member = await createUser("Uye10");
    await addMember(team, member);
    const res = await api("GET", `/api/teams/${team}/messages?limit=500`, member);
    assert.equal(res.status, 400);
  });

  test("ekip sohbeti akışa (/api/feed) düşmez", async () => {
    const team = await createTeam("Akış ekibi");
    const member = await createUser("Uye11");
    await addMember(team, member);
    await postMessage(team, member, "Akışa çıkmamalı 4711");

    const res = await api("GET", "/api/feed", member);
    assert.equal(res.status, 200);
    assert.equal((await res.text()).includes("Akışa çıkmamalı 4711"), false);
  });
});
