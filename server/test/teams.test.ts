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
    "TRUNCATE task_history, task_comments, task_assignments, tasks, project_teams, activity_log, projects, team_members, teams, sessions, login_tokens, users RESTART IDENTITY CASCADE",
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

async function createTask(userId: string, body: Record<string, unknown>): Promise<string> {
  const res = await api("POST", "/api/tasks", userId, { title: "Görev", ...body });
  assert.equal(res.status, 201);
  return ((await res.json()) as { id: string }).id;
}

describe("ekip oluşturma", () => {
  test("herhangi bir kullanıcı süresiz ekip kurabilir", async () => {
    const user = await createUser("Kurucu1");
    const res = await api("POST", "/api/teams", user, { name: "Yeni ekip", type: "ongoing", requiredPeople: 2 });
    assert.equal(res.status, 201);
    const { id } = (await res.json()) as { id: string };
    const row = await query<{ required_people: number }>("SELECT required_people FROM teams WHERE id = $1", [id]);
    assert.equal(row.rows[0].required_people, 2);
    const members = await query("SELECT 1 FROM team_members WHERE team_id = $1", [id]);
    assert.equal(members.rowCount, 0, "kuruluşta üyelik açılmamalı");
  });

  test("dönemli ekipte başlangıç ve bitiş zorunlu, bitiş başlangıçtan önce olamaz", async () => {
    const user = await createUser("Kurucu2");
    const missing = await api("POST", "/api/teams", user, { name: "Dönem", type: "term" });
    assert.equal(missing.status, 400);
    const reversed = await api("POST", "/api/teams", user, {
      name: "Dönem",
      type: "term",
      termStart: "2026-05-10",
      termEnd: "2026-05-01",
    });
    assert.equal(reversed.status, 400);
    const valid = await api("POST", "/api/teams", user, {
      name: "Dönem",
      type: "term",
      termStart: "2026-05-01",
      termEnd: "2026-05-10",
    });
    assert.equal(valid.status, 201);
  });

  test("süresiz ekipte dönem bitişi olamaz", async () => {
    const user = await createUser("Kurucu3");
    const res = await api("POST", "/api/teams", user, {
      name: "Süresiz",
      type: "ongoing",
      termEnd: "2026-05-10",
    });
    assert.equal(res.status, 400);
  });

  test("ekip adı zorunlu", async () => {
    const user = await createUser("Kurucu4");
    const res = await api("POST", "/api/teams", user, { name: "  ", type: "ongoing" });
    assert.equal(res.status, 400);
  });
});

describe("ekip düzenleme", () => {
  test("üye ad, açıklama ve gerekli kişi sayısını değiştirebilir; her alan için ayrı kayıt yazılır", async () => {
    const member = await createUser("Duzenleyen");
    const teamId = await createTeam("Eski ad");
    await addMember(teamId, member);

    const res = await api("PATCH", `/api/teams/${teamId}`, member, {
      name: "Yeni ad",
      description: "Yeni açıklama",
      requiredPeople: 3,
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { team: { name: string; description: string; requiredPeople: number } };
    assert.equal(body.team.name, "Yeni ad");
    assert.equal(body.team.description, "Yeni açıklama");
    assert.equal(body.team.requiredPeople, 3);

    const activity = await query<{ field: string }>(
      "SELECT field FROM activity_log WHERE entity_id = $1 AND action = 'updated' ORDER BY field",
      [teamId],
    );
    assert.deepEqual(activity.rows.map((row) => row.field), ["description", "name", "required_people"]);
  });

  test("değişiklik yoksa kayıt yazılmaz", async () => {
    const member = await createUser("Degismeyen");
    const teamId = await createTeam("Sabit");
    await addMember(teamId, member);
    const res = await api("PATCH", `/api/teams/${teamId}`, member, { name: "Sabit", requiredPeople: 0 });
    assert.equal(res.status, 200);
    const activity = await query("SELECT 1 FROM activity_log WHERE entity_id = $1", [teamId]);
    assert.equal(activity.rowCount, 0);
  });

  test("ekip adı boş olamaz", async () => {
    const member = await createUser("Bos");
    const teamId = await createTeam("Bos ad");
    await addMember(teamId, member);
    const res = await api("PATCH", `/api/teams/${teamId}`, member, { name: "", requiredPeople: 0 });
    assert.equal(res.status, 400);
  });
});

describe("yönetici: üye çıkarma", () => {
  test("yönetici olmayan üye başka birini ekipten çıkaramaz", async () => {
    const actor = await createUser("Sıradan");
    const target = await createUser("Hedef1");
    const teamId = await createTeam("Kadro1");
    await addMember(teamId, actor);
    await addMember(teamId, target);
    const res = await api("DELETE", `/api/teams/${teamId}/members/${target}`, actor);
    assert.equal(res.status, 403);
  });

  test("yönetici ekipteki bir kişiyi çıkarır; ikinci kez 409 döner", async () => {
    const admin = await createUser("Yonetici1", true);
    const target = await createUser("Hedef2");
    const teamId = await createTeam("Kadro2");
    await addMember(teamId, target);

    assert.equal((await api("DELETE", `/api/teams/${teamId}/members/${target}`, admin)).status, 204);
    const membership = await query("SELECT ended_at FROM team_members WHERE team_id = $1 AND user_id = $2", [
      teamId,
      target,
    ]);
    assert.notEqual(membership.rows[0].ended_at, null);
    assert.equal((await api("DELETE", `/api/teams/${teamId}/members/${target}`, admin)).status, 409);
  });

  test("ekibe özel açık görevde katkısı olan kişi çıkarılamaz", async () => {
    const admin = await createUser("Yonetici2", true);
    const owner = await createUser("Sahip");
    const target = await createUser("Hedef3");
    const teamId = await createTeam("Kadro3");
    await addMember(teamId, owner);
    await addMember(teamId, target);
    const taskId = await createTask(owner, { teamId, teamOnly: true });
    assert.equal((await api("POST", `/api/tasks/${taskId}/claim`, target)).status, 200);

    const res = await api("DELETE", `/api/teams/${teamId}/members/${target}`, admin);
    assert.equal(res.status, 409);
  });
});

describe("yönetici: görevden kişi çıkarma", () => {
  test("yönetici olmayan görevden kişi çıkaramaz", async () => {
    const owner = await createUser("Sahip2");
    const other = await createUser("Diger");
    const taskId = await createTask(owner, {});
    assert.equal((await api("POST", `/api/tasks/${taskId}/claim`, other)).status, 200);
    const res = await api("DELETE", `/api/tasks/${taskId}/assignments/${other}`, owner);
    assert.equal(res.status, 403);
  });

  test("yönetici, görevi göremediği bir ekibin özel görevinden de kişi çıkarabilir ve geçmişe yazılır", async () => {
    const admin = await createUser("Yonetici3", true);
    const owner = await createUser("Sahip3");
    const target = await createUser("Hedef4");
    const teamId = await createTeam("Kadro4");
    await addMember(teamId, owner);
    await addMember(teamId, target);
    const taskId = await createTask(owner, { teamId, teamOnly: true });
    assert.equal((await api("POST", `/api/tasks/${taskId}/claim`, target)).status, 200);

    const res = await api("DELETE", `/api/tasks/${taskId}/assignments/${target}`, admin);
    assert.equal(res.status, 204);

    const open = await query("SELECT 1 FROM task_assignments WHERE task_id = $1 AND user_id = $2 AND ended_at IS NULL", [
      taskId,
      target,
    ]);
    assert.equal(open.rowCount, 0);
    const history = await query<{ user_id: string }>(
      "SELECT user_id FROM task_history WHERE task_id = $1 AND field = 'owner' AND new_value IS NULL ORDER BY id DESC LIMIT 1",
      [taskId],
    );
    assert.equal(history.rows[0]?.user_id, admin);
  });

  test("açık üstlenmesi olmayan kişi için 409 döner", async () => {
    const admin = await createUser("Yonetici4", true);
    const owner = await createUser("Sahip4");
    const taskId = await createTask(owner, {});
    const res = await api("DELETE", `/api/tasks/${taskId}/assignments/${owner}`, admin);
    assert.equal(res.status, 409);
  });
});
