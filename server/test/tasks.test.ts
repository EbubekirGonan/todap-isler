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

async function createUser(name: string, active = true): Promise<string> {
  const result = await query<{ id: string }>(
    "INSERT INTO users (name, email, active) VALUES ($1, $2, $3) RETURNING id",
    [name, `${name.toLowerCase()}@example.com`, active],
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

async function listIds(userId: string, path: string): Promise<string[]> {
  const res = await api("GET", path, userId);
  assert.equal(res.status, 200);
  return ((await res.json()) as { tasks: { id: string }[] }).tasks.map((t) => t.id);
}

describe("görünürlük kuralları", () => {
  let alice: string;
  let bob: string;
  let carol: string;
  let teamA: string;

  before(async () => {
    alice = await createUser("Alice");
    bob = await createUser("Bob");
    carol = await createUser("Carol");
    teamA = await createTeam("Ekip A");
    await addMember(teamA, alice);
    await addMember(teamA, bob);
  });

  test("ekibe özel görev herkese görünür ama üye olmayan katılamaz", async () => {
    const taskId = await createTask(alice, { teamId: teamA, teamOnly: true });

    const seenByOutsider = await api("GET", `/api/tasks/${taskId}`, carol);
    assert.equal(seenByOutsider.status, 200);
    const outsiderBody = (await seenByOutsider.json()) as { task: { canJoin: boolean } };
    assert.equal(outsiderBody.task.canJoin, false);
    assert.ok((await listIds(carol, "/api/tasks")).includes(taskId));

    const member = await api("GET", `/api/tasks/${taskId}`, bob);
    const memberBody = (await member.json()) as { task: { canJoin: boolean } };
    assert.equal(memberBody.task.canJoin, true);
  });

  test("ekibe özel görev havuzda görünmez", async () => {
    const taskId = await createTask(alice, { teamId: teamA, teamOnly: true });
    assert.ok(!(await listIds(carol, "/api/tasks/pool")).includes(taskId));
    assert.ok(!(await listIds(bob, "/api/tasks/pool")).includes(taskId));
  });

  test("havuzda bana özel kapsamı yalnızca üyesi olunan ekiplerin ekibe özel görevlerini getirir", async () => {
    const publicId = await createTask(alice, {});
    const teamOnlyId = await createTask(alice, { teamId: teamA, teamOnly: true });

    const bobIds = await listIds(bob, "/api/tasks/pool?scope=mine-team");
    assert.ok(bobIds.includes(teamOnlyId));
    assert.ok(!bobIds.includes(publicId));

    const carolIds = await listIds(carol, "/api/tasks/pool?scope=mine-team");
    assert.ok(!carolIds.includes(teamOnlyId));
  });

  test("üye olmayan katkı sağlayamaz ya da destek olamaz (409)", async () => {
    const taskId = await createTask(alice, { teamId: teamA, teamOnly: true });
    assert.equal((await api("POST", `/api/tasks/${taskId}/claim`, carol)).status, 409);
    assert.equal((await api("POST", `/api/tasks/${taskId}/support`, carol)).status, 409);
    assert.equal((await api("POST", `/api/tasks/${taskId}/claim`, bob)).status, 200);
  });

  test("ekibe özel görev için ekip seçilmezse 400 döner", async () => {
    const res = await api("POST", "/api/tasks", alice, { title: "Gizli", teamOnly: true });
    assert.equal(res.status, 400);
  });

  test("ekipten ayrılan kişide atanmış görev İşlerim'de kalır", async () => {
    const dave = await createUser("Dave");
    const team = await createTeam("Ekip D");
    await addMember(team, dave);
    const taskId = await createTask(dave, { teamId: team, teamOnly: true });
    await api("POST", `/api/tasks/${taskId}/claim`, dave);

    await query("UPDATE team_members SET ended_at = now() WHERE user_id = $1 AND team_id = $2", [dave, team]);

    assert.ok((await listIds(dave, "/api/tasks/mine")).includes(taskId));
    assert.equal((await api("GET", `/api/tasks/${taskId}`, dave)).status, 200);
  });

  test("bana özel kapsamı yalnızca üyesi olunan ekiplerin ekibe özel görevlerini getirir", async () => {
    const publicId = await createTask(alice, {});
    const teamOnlyId = await createTask(alice, { teamId: teamA, teamOnly: true });

    const ids = await listIds(bob, "/api/tasks?scope=mine-team");
    assert.ok(ids.includes(teamOnlyId));
    assert.ok(!ids.includes(publicId));
  });
});

describe("havuz ve üstlenme", () => {
  let alice: string;
  let bob: string;
  let teamB: string;

  before(async () => {
    alice = await createUser("Ayse");
    bob = await createUser("Burak");
    teamB = await createTeam("Ekip B");
    await addMember(teamB, alice);
    await addMember(teamB, bob);
  });

  test("tahmini kişi sayısı dolana kadar görev havuzda kalır", async () => {
    const taskId = await createTask(alice, { estimatedPeople: 2 });
    assert.ok((await listIds(bob, "/api/tasks/pool")).includes(taskId));

    assert.equal((await api("POST", `/api/tasks/${taskId}/claim`, bob)).status, 200);
    assert.ok((await listIds(alice, "/api/tasks/pool")).includes(taskId));
    assert.ok((await listIds(bob, "/api/tasks/mine")).includes(taskId));

    const carol = await createUser("Kapasite");
    assert.equal((await api("POST", `/api/tasks/${taskId}/claim`, carol)).status, 200);
    assert.ok(!(await listIds(alice, "/api/tasks/pool")).includes(taskId));
    assert.equal((await api("POST", `/api/tasks/${taskId}/claim`, alice)).status, 409);
  });

  test("destek olan kişi kapasiteye sayılmaz ve havuzdan çıkarmaz", async () => {
    const taskId = await createTask(alice, { estimatedPeople: 1 });
    assert.equal((await api("POST", `/api/tasks/${taskId}/support`, bob)).status, 200);
    assert.ok((await listIds(alice, "/api/tasks/pool")).includes(taskId));
  });

  test("aynı anda iki katkı isteğinden yalnızca biri kabul edilir", async () => {
    const taskId = await createTask(alice, {});
    const [first, second] = await Promise.all([
      api("POST", `/api/tasks/${taskId}/claim`, alice),
      api("POST", `/api/tasks/${taskId}/claim`, bob),
    ]);
    assert.deepEqual([first.status, second.status].sort(), [200, 409]);

    const owners = await query(
      "SELECT 1 FROM task_assignments WHERE task_id = $1 AND role = 'owner' AND ended_at IS NULL",
      [taskId],
    );
    assert.equal(owners.rowCount, 1);
  });

  test("aynı kişi iki kez katkı sağlayamaz", async () => {
    const taskId = await createTask(alice, { estimatedPeople: 3 });
    assert.equal((await api("POST", `/api/tasks/${taskId}/claim`, bob)).status, 200);
    assert.equal((await api("POST", `/api/tasks/${taskId}/claim`, bob)).status, 409);
  });

  test("bırakılan görev tekrar havuza döner ve geçmişe kaydedilir", async () => {
    const taskId = await createTask(alice, {});
    await api("POST", `/api/tasks/${taskId}/claim`, bob);
    assert.equal((await api("POST", `/api/tasks/${taskId}/release`, bob)).status, 200);

    assert.ok((await listIds(alice, "/api/tasks/pool")).includes(taskId));

    const detail = (await (await api("GET", `/api/tasks/${taskId}`, alice)).json()) as {
      task: { history: { field: string; new_value: string | null; old_value: string | null }[] };
    };
    const ownerEntries = detail.task.history.filter((h) => h.field === "owner");
    assert.equal(ownerEntries.length, 2);
    assert.equal(ownerEntries[0].new_value, "Burak");
    assert.equal(ownerEntries[1].old_value, "Burak");
  });

  test("ara hedef tarihi oluşturulur, güncellenir ve geçmişe kaydedilir", async () => {
    const taskId = await createTask(alice, { targetDate: "2026-12-01" });
    const created = (await (await api("GET", `/api/tasks/${taskId}`, alice)).json()) as {
      task: { targetDate: string | null; dueDate: string | null };
    };
    assert.equal(created.task.targetDate, "2026-12-01");
    assert.equal(created.task.dueDate, null);

    assert.equal(
      (await api("PATCH", `/api/tasks/${taskId}`, alice, { targetDate: "2026-12-15" })).status,
      200,
    );
    const updated = (await (await api("GET", `/api/tasks/${taskId}`, alice)).json()) as {
      task: { targetDate: string | null; history: { field: string }[] };
    };
    assert.equal(updated.task.targetDate, "2026-12-15");
    assert.ok(updated.task.history.some((h) => h.field === "target_date"));
  });

  test("ekibe özel görevde ekip dışındaki kişiye atama 400 döner", async () => {
    const outsider = await createUser("Disari");
    const taskId = await createTask(alice, { teamId: teamB, teamOnly: true });

    const res = await api("POST", `/api/tasks/${taskId}/assign`, alice, { userId: outsider });
    assert.equal(res.status, 400);
  });

  test("pasif kullanıcıya atama 400 döner", async () => {
    const inactive = await createUser("Pasif", false);
    const taskId = await createTask(alice, {});
    const res = await api("POST", `/api/tasks/${taskId}/assign`, alice, { userId: inactive });
    assert.equal(res.status, 400);
  });

  test("atama kapasite dolu değilse katkı sağlayan ekler ve destek kaydını katkıya çevirir", async () => {
    const taskId = await createTask(alice, { estimatedPeople: 2 });
    await api("POST", `/api/tasks/${taskId}/claim`, alice);
    await api("POST", `/api/tasks/${taskId}/support`, bob);

    assert.equal((await api("POST", `/api/tasks/${taskId}/assign`, alice, { userId: bob })).status, 200);

    const rows = await query<{ user_id: string; role: string }>(
      "SELECT user_id, role FROM task_assignments WHERE task_id = $1 AND ended_at IS NULL ORDER BY role, user_id",
      [taskId],
    );
    assert.deepEqual(
      rows.rows.map((r) => [r.user_id, r.role]),
      [[alice, "owner"], [bob, "owner"]],
    );
  });

  test("atama kapasite doluyken 409 döner", async () => {
    const taskId = await createTask(alice, {});
    await api("POST", `/api/tasks/${taskId}/claim`, alice);
    assert.equal((await api("POST", `/api/tasks/${taskId}/assign`, alice, { userId: bob })).status, 409);
  });

  test("tahmini kişi sayısı mevcut katkı sağlayan sayısından az yapılamaz", async () => {
    const taskId = await createTask(alice, { estimatedPeople: 2 });
    await api("POST", `/api/tasks/${taskId}/claim`, alice);
    await api("POST", `/api/tasks/${taskId}/claim`, bob);
    assert.equal((await api("PATCH", `/api/tasks/${taskId}`, alice, { estimatedPeople: 1 })).status, 409);
  });

  test("boş tahmini kişi sayısı 1 olarak kaydedilir, 0 ve 51 reddedilir", async () => {
    const taskId = await createTask(alice, { estimatedPeople: "" });
    const row = await query<{ estimated_people: number }>("SELECT estimated_people FROM tasks WHERE id = $1", [taskId]);
    assert.equal(row.rows[0].estimated_people, 1);
    assert.equal((await api("POST", "/api/tasks", alice, { title: "Sınır", estimatedPeople: 0 })).status, 400);
    assert.equal((await api("POST", "/api/tasks", alice, { title: "Sınır", estimatedPeople: 51 })).status, 400);
  });

  test("destek olunan görevde ikinci kez destek veya üstlenme 409 döner", async () => {
    const taskId = await createTask(alice, {});
    assert.equal((await api("POST", `/api/tasks/${taskId}/support`, bob)).status, 200);
    assert.equal((await api("POST", `/api/tasks/${taskId}/support`, bob)).status, 409);
    assert.equal((await api("POST", `/api/tasks/${taskId}/claim`, bob)).status, 200);
  });
});

describe("düzenleme, yorum ve silme", () => {
  let alice: string;
  let bob: string;
  let carol: string;
  let teamC: string;

  before(async () => {
    alice = await createUser("Cem");
    bob = await createUser("Deniz");
    carol = await createUser("Elif");
    teamC = await createTeam("Ekip C");
    await addMember(teamC, alice);
    await addMember(teamC, bob);
  });

  test("ekibe özel yapılamaz: ekip dışı atanmış kişi varken 409 döner", async () => {
    const taskId = await createTask(alice, {});
    await api("POST", `/api/tasks/${taskId}/assign`, alice, { userId: carol });

    const res = await api("PATCH", `/api/tasks/${taskId}`, alice, { teamOnly: true, teamId: teamC });
    assert.equal(res.status, 409);
  });

  test("düzenleme geçmişe yazılır ve son hareket zamanı güncellenir", async () => {
    const taskId = await createTask(alice, {});
    const before = await query<{ last_activity_at: Date }>("SELECT last_activity_at FROM tasks WHERE id = $1", [taskId]);

    const res = await api("PATCH", `/api/tasks/${taskId}`, bob, { title: "Yeni başlık" });
    assert.equal(res.status, 200);

    const after = await query<{ last_activity_at: Date }>("SELECT last_activity_at FROM tasks WHERE id = $1", [taskId]);
    assert.ok(after.rows[0].last_activity_at > before.rows[0].last_activity_at);

    const history = await query<{ field: string; new_value: string }>(
      "SELECT field, new_value FROM task_history WHERE task_id = $1 AND field = 'title'",
      [taskId],
    );
    assert.equal(history.rows[0].new_value, "Yeni başlık");
  });

  test("tamamlanınca completed_at dolar, geri alınınca boşalır", async () => {
    const taskId = await createTask(alice, {});
    await api("PATCH", `/api/tasks/${taskId}`, alice, { status: "done" });
    let row = await query<{ completed_at: Date | null }>("SELECT completed_at FROM tasks WHERE id = $1", [taskId]);
    assert.notEqual(row.rows[0].completed_at, null);

    await api("PATCH", `/api/tasks/${taskId}`, alice, { status: "in_progress" });
    row = await query<{ completed_at: Date | null }>("SELECT completed_at FROM tasks WHERE id = $1", [taskId]);
    assert.equal(row.rows[0].completed_at, null);
  });

  test("yorum eklenir ve görev detayında listelenir", async () => {
    const taskId = await createTask(alice, {});
    const res = await api("POST", `/api/tasks/${taskId}/comments`, bob, { body: "Yapabilirim" });
    assert.equal(res.status, 201);

    const detail = (await (await api("GET", `/api/tasks/${taskId}`, alice)).json()) as {
      task: { comments: { body: string }[] };
    };
    assert.equal(detail.task.comments[0].body, "Yapabilirim");
  });

  test("silme yumuşaktır: görev listeden ve detaydan gider, satır kalır", async () => {
    const taskId = await createTask(alice, {});
    assert.equal((await api("DELETE", `/api/tasks/${taskId}`, bob)).status, 204);

    assert.equal((await api("GET", `/api/tasks/${taskId}`, alice)).status, 404);
    assert.ok(!(await listIds(alice, "/api/tasks")).includes(taskId));

    const row = await query<{ deleted_at: Date | null }>("SELECT deleted_at FROM tasks WHERE id = $1", [taskId]);
    assert.notEqual(row.rows[0].deleted_at, null);
  });

  test("sıralama en gecikmişten başlar, tarihsizler sonda kalır", async () => {
    const late = await createTask(alice, { dueDate: "2026-01-05" });
    const early = await createTask(alice, { dueDate: "2026-01-01" });
    const none = await createTask(alice, {});

    const ids = await listIds(alice, "/api/tasks");
    assert.ok(ids.indexOf(early) < ids.indexOf(late));
    assert.ok(ids.indexOf(late) < ids.indexOf(none));
  });
});

describe("projeler ilerleme sayıları", () => {
  test("ilerleme yüzdesi ve kişi aranıyor sayısı doğru hesaplanır", async () => {
    const alice = await createUser("Fatma");
    const created = await api("POST", "/api/projects", alice, { name: "Kermes" });
    assert.equal(created.status, 201);
    const projectId = ((await created.json()) as { id: string }).id;

    const open = await createTask(alice, { projectId, estimatedPeople: 2 });
    const done = await createTask(alice, { projectId });
    await api("PATCH", `/api/tasks/${done}`, alice, { status: "done" });
    assert.ok(open);

    const res = await api("GET", `/api/projects/${projectId}`, alice);
    const body = (await res.json()) as { project: { progress: Record<string, number> } };
    assert.deepEqual(body.project.progress, { total: 2, done: 1, percent: 50, openCount: 1 });
  });

  test("faaliyet görev listesi tamamlananları da içerir ve kişi aranıyor filtresi çalışır", async () => {
    const alice = await createUser("Gül");
    const created = await api("POST", "/api/projects", alice, { name: "Piknik" });
    const projectId = ((await created.json()) as { id: string }).id;

    const seeking = await createTask(alice, { projectId, estimatedPeople: 2 });
    const finished = await createTask(alice, { projectId });
    await api("PATCH", `/api/tasks/${finished}`, alice, { status: "done" });

    const all = await listIds(alice, `/api/projects/${projectId}/tasks`);
    assert.ok(all.includes(seeking) && all.includes(finished));

    const openOnly = await listIds(alice, "/api/tasks?seeking=true");
    assert.ok(openOnly.includes(seeking));
    assert.ok(!openOnly.includes(finished));

    const withDone = await listIds(alice, "/api/tasks?includeDone=true");
    assert.ok(withDone.includes(finished));
  });

  test("bilinmeyen faaliyet için görev listesi 404 döner", async () => {
    const alice = await createUser("Hasan");
    assert.equal((await api("GET", "/api/projects/999999/tasks", alice)).status, 404);
  });
});

describe("takımlar, faaliyet-takım bağlantıları ve akış", () => {
  async function setRequired(teamId: string, count: number): Promise<void> {
    await query("UPDATE teams SET required_people = $2 WHERE id = $1", [teamId, count]);
  }

  test("katılım gerekli kişi sayısına göre açılır ve kapanır; ayrılan kişi yeniden girebilir", async () => {
    const ali = await createUser("Ali");
    const veli = await createUser("Veli");
    const team = await createTeam("Katılım Ekibi");
    await setRequired(team, 1);

    assert.equal((await api("POST", `/api/teams/${team}/join`, ali)).status, 204);
    assert.equal((await api("POST", `/api/teams/${team}/join`, veli)).status, 409);
    assert.equal((await api("POST", `/api/teams/${team}/join`, ali)).status, 409);

    assert.equal((await api("POST", `/api/teams/${team}/leave`, ali)).status, 204);
    assert.equal((await api("POST", `/api/teams/${team}/leave`, ali)).status, 409);
    assert.equal((await api("POST", `/api/teams/${team}/join`, ali)).status, 204);
  });

  test("ekip listesi açık kontenjanı ve katılım durumunu gösterir", async () => {
    const ayse = await createUser("Ayşe");
    const team = await createTeam("Liste Ekibi");
    await setRequired(team, 2);

    const before = await api("GET", "/api/teams", ayse);
    const listBefore = ((await before.json()) as { teams: { id: string; openSlots: number; canJoin: boolean }[] }).teams;
    const itemBefore = listBefore.find((t) => t.id === team)!;
    assert.equal(itemBefore.openSlots, 2);
    assert.equal(itemBefore.canJoin, true);

    await api("POST", `/api/teams/${team}/join`, ayse);
    const after = await api("GET", "/api/teams", ayse);
    const itemAfter = ((await after.json()) as { teams: { id: string; openSlots: number; canJoin: boolean; isMember: boolean }[] }).teams.find((t) => t.id === team)!;
    assert.equal(itemAfter.openSlots, 1);
    assert.equal(itemAfter.isMember, true);
    assert.equal(itemAfter.canJoin, false);
  });

  test("ekibe özel faaliyeti üstlenmiş kişi ekipten ayrılamaz; bırakınca ayrılabilir", async () => {
    const selin = await createUser("Selin");
    const emre = await createUser("Emre");
    const team = await createTeam("Kilit Ekibi");
    await setRequired(team, 3);
    await api("POST", `/api/teams/${team}/join`, selin);
    await api("POST", `/api/teams/${team}/join`, emre);

    const taskId = await createTask(selin, { teamId: team, teamOnly: true });
    assert.equal((await api("POST", `/api/tasks/${taskId}/assign`, selin, { userId: emre })).status, 200);

    assert.equal((await api("POST", `/api/teams/${team}/leave`, emre)).status, 409);
    assert.equal((await api("POST", `/api/tasks/${taskId}/release`, emre)).status, 200);
    assert.equal((await api("POST", `/api/teams/${team}/leave`, emre)).status, 204);
  });

  test("gerekli kişi sayısını herhangi bir aktif kullanıcı değiştirir ve akışa düşer", async () => {
    const okan = await createUser("Okan");
    const team = await createTeam("Sayı Ekibi");
    const res = await api("PATCH", `/api/teams/${team}`, okan, { requiredPeople: 4 });
    assert.equal(res.status, 200);
    assert.equal(((await res.json()) as { team: { requiredPeople: number } }).team.requiredPeople, 4);

    const feed = ((await (await api("GET", "/api/feed", okan)).json()) as { entries: { kind: string; action: string | null; entityName: string; field: string | null }[] }).entries;
    assert.ok(feed.some((e) => e.kind === "team" && e.entityName === "Sayı Ekibi" && e.field === "required_people"));
  });

  test("faaliyet birden fazla ekibe bağlanır, bağlantı kaldırılıp yeniden kurulabilir", async () => {
    const gizem = await createUser("Gizem");
    const ekip1 = await createTeam("Bağlantı Bir");
    const ekip2 = await createTeam("Bağlantı İki");

    const created = await api("POST", "/api/projects", gizem, { name: "Ortak Faaliyet", teamIds: [ekip1, ekip2] });
    assert.equal(created.status, 201);
    const projectId = ((await created.json()) as { id: string }).id;

    const detail = ((await (await api("GET", `/api/projects/${projectId}`, gizem)).json()) as { project: { teams: { id: string }[] } }).project;
    assert.deepEqual(detail.teams.map((t) => t.id).sort(), [ekip1, ekip2].sort());

    assert.equal((await api("POST", `/api/projects/${projectId}/teams`, gizem, { teamId: ekip1 })).status, 409);
    assert.equal((await api("DELETE", `/api/projects/${projectId}/teams/${ekip1}`, gizem)).status, 204);
    assert.equal((await api("DELETE", `/api/projects/${projectId}/teams/${ekip1}`, gizem)).status, 404);
    assert.equal((await api("POST", `/api/projects/${projectId}/teams`, gizem, { teamId: ekip1 })).status, 204);

    const relinked = ((await (await api("GET", `/api/projects/${projectId}`, gizem)).json()) as { project: { teams: { id: string }[] } }).project;
    assert.equal(relinked.teams.length, 2);
  });

  test("akış ekibe özel görev başlığını yalnızca üyelere gösterir ve sayfalanır", async () => {
    const hale = await createUser("Hale");
    const ferhat = await createUser("Ferhat");
    const outsider = await createUser("Kerem");
    const team = await createTeam("Akış Ekibi");
    await setRequired(team, 2);
    await api("POST", `/api/teams/${team}/join`, hale);

    const secretTitle = "Gizli ekip görevi";
    await createTask(hale, { title: secretTitle, teamId: team, teamOnly: true });

    const memberFeed = ((await (await api("GET", "/api/feed?limit=100", hale)).json()) as { entries: { entityName: string }[] }).entries;
    assert.ok(memberFeed.some((e) => e.entityName === secretTitle));

    const outsiderFeed = ((await (await api("GET", "/api/feed?limit=100", outsider)).json()) as { entries: { entityName: string }[] }).entries;
    assert.ok(!outsiderFeed.some((e) => e.entityName === secretTitle));

    type FeedItem = { createdAt: string };
    const feedOf = async (path: string) => ((await (await api("GET", path, ferhat)).json()) as { entries: FeedItem[] }).entries;
    const all = await feedOf("/api/feed?limit=100");
    const page1 = await feedOf("/api/feed?limit=2");
    assert.equal(page1.length, 2);

    const cursor = page1[1].createdAt;
    const next = await feedOf(`/api/feed?limit=100&before=${encodeURIComponent(cursor)}`);
    assert.ok(next.every((e) => e.createdAt <= cursor));
    assert.equal(next.length, all.filter((e) => e.createdAt <= cursor).length);
  });

  test("bilinmeyen ekip ve geçersiz sayı doğru hata döner", async () => {
    const yusuf = await createUser("Yusuf");
    assert.equal((await api("GET", "/api/teams/999999", yusuf)).status, 404);
    assert.equal((await api("PATCH", `/api/teams/${await createTeam("Hata Ekibi")}`, yusuf, { requiredPeople: -1 })).status, 400);
    assert.equal((await api("GET", "/api/feed?limit=0", yusuf)).status, 400);
  });
});
