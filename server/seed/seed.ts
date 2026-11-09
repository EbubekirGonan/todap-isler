import type pg from "pg";
import { config } from "../src/config.js";
import { pool } from "../src/db.js";

// Geliştirme ortamı için örnek veri. Her çalıştırmada tabloları temizleyip baştan doldurur.
if (process.env.NODE_ENV === "production") {
  console.error("Seed production ortamında çalıştırılamaz.");
  process.exit(1);
}

// Seed mevcut verileri siler; bu yüzden açıkça izin verilmedikçe çalışmaz.
if (process.env.ALLOW_SEED !== "true") {
  console.error(
    "Seed çalıştırılmadı: ALLOW_SEED=true tanımlı değil.\n" +
      "Seed tabloları temizler; yalnızca geliştirme veritabanında ALLOW_SEED=true ile çalıştırın.",
  );
  process.exit(1);
}

// Silme işleminden önce hedef sunucu görünsün diye yalnızca hostname yazılır (kullanıcı ve şifre yazılmaz).
console.log(`Hedef veritabanı sunucusu: ${new URL(config.databaseUrl).hostname}`);

const DAY_MS = 24 * 60 * 60 * 1000;

// Olay zamanları (started_at, ended_at, completed_at) için JS tarafında hesaplanan timestamptz değeri.
const daysFromNow = (days: number): Date => new Date(Date.now() + days * DAY_MS);

const adminEmail = process.env.SEED_ADMIN_EMAIL?.trim() || "admin@example.com";

type Id = number;

async function insertRow(client: pg.PoolClient, sql: string, params: unknown[]): Promise<Id> {
  const { rows } = await client.query<{ id: string }>(`${sql} RETURNING id`, params);
  return Number(rows[0].id);
}

async function seedUsers(client: pg.PoolClient) {
  const defs = [
    { key: "ayse", name: "Ayşe Yılmaz", email: adminEmail, isAdmin: true },
    { key: "mehmet", name: "Mehmet Kaya", email: "mehmet@example.com", isAdmin: false },
    { key: "zeynep", name: "Zeynep Arslan", email: "zeynep@example.com", isAdmin: false },
    { key: "selin", name: "Selin Çelik", email: "selin@example.com", isAdmin: false },
    { key: "kerem", name: "Kerem Demir", email: "kerem@example.com", isAdmin: false },
  ];

  const ids: Record<string, Id> = {};
  for (const u of defs) {
    ids[u.key] = await insertRow(
      client,
      "INSERT INTO users (name, email, is_admin) VALUES ($1, $2, $3)",
      [u.name, u.email, u.isAdmin],
    );
  }
  return ids;
}

async function seedTeams(client: pg.PoolClient) {
  const board = await insertRow(
    client,
    "INSERT INTO teams (name, description, type, term_start, term_end) VALUES ($1, $2, 'term', $3, $4)",
    [
      "Yönetim Kurulu",
      "Derneğin dönemli yönetim kurulu",
      "2025-06-01",
      "2027-06-01",
    ],
  );
  const social = await insertRow(
    client,
    "INSERT INTO teams (name, description, type) VALUES ($1, $2, 'ongoing')",
    ["Sosyal medya ekibi", "Dernek hesaplarının içerik ve paylaşım takibi"],
  );
  const education = await insertRow(
    client,
    "INSERT INTO teams (name, description, type) VALUES ($1, $2, 'ongoing')",
    ["Eğitim ekibi", "Gönüllü eğitim programları"],
  );
  return { board, social, education };
}

async function addMember(
  client: pg.PoolClient,
  teamId: Id,
  userId: Id,
  roleTitle: string,
  endedAt: Date | null = null,
) {
  await insertRow(
    client,
    "INSERT INTO team_members (team_id, user_id, role_title, started_at, ended_at) VALUES ($1, $2, $3, $4, $5)",
    [teamId, userId, roleTitle, daysFromNow(-120), endedAt],
  );
}

async function seedMembers(
  client: pg.PoolClient,
  u: Record<string, Id>,
  t: Record<string, Id>,
) {
  await addMember(client, t.board, u.ayse, "Başkan");
  await addMember(client, t.board, u.mehmet, "Sayman");
  await addMember(client, t.board, u.zeynep, "Üye");

  await addMember(client, t.social, u.selin, "Koordinatör");
  await addMember(client, t.social, u.kerem, "Üye");
  await addMember(client, t.social, u.ayse, "Üye");

  await addMember(client, t.education, u.mehmet, "Koordinatör");
  await addMember(client, t.education, u.zeynep, "Üye");
  await addMember(client, t.education, u.selin, "Üye");
  // Bırakılmış üyelik: geçmiş korunur, ended_at dolu.
  await addMember(client, t.education, u.kerem, "Üye", daysFromNow(-90));
}

async function seedProjects(
  client: pg.PoolClient,
  u: Record<string, Id>,
  t: Record<string, Id>,
) {
  const education = await insertRow(
    client,
    "INSERT INTO projects (name, description, start_date, due_date, team_id, created_by) VALUES ($1, $2, current_date + $3::integer, current_date + $4::integer, $5, $6)",
    [
      "Kasım eğitim programı",
      "Kasım ayındaki gönüllü eğitim oturumlarının hazırlığı",
      -10,
      20,
      t.education,
      u.mehmet,
    ],
  );
  const general = await insertRow(
    client,
    "INSERT INTO projects (name, description, start_date, due_date, team_id, created_by) VALUES ($1, $2, current_date + $3::integer, current_date + $4::integer, $5, $6)",
    [
      "Yıllık genel kurul",
      "Yıllık genel kurul toplantısının organizasyonu",
      -30,
      60,
      t.board,
      u.ayse,
    ],
  );
  return { education, general };
}

type TaskInput = {
  title: string;
  description?: string;
  status?: "todo" | "doing" | "done";
  // Bugüne göre gün ofseti (ör. -5 = 5 gün önce); null ise termin yok.
  dueDate?: number | null;
  completedAt?: Date | null;
  needsAssignee?: boolean;
  teamOnly?: boolean;
  teamId?: Id | null;
  projectId?: Id | null;
  parentId?: Id | null;
  createdBy: Id;
};

async function createTask(client: pg.PoolClient, task: TaskInput): Promise<Id> {
  return insertRow(
    client,
    `INSERT INTO tasks
       (title, description, status, due_date, completed_at, needs_assignee, team_only,
        team_id, project_id, parent_task_id, created_by)
     VALUES ($1, $2, $3, current_date + $4::integer, $5, $6, $7, $8, $9, $10, $11)`,
    [
      task.title,
      task.description ?? null,
      task.status ?? "todo",
      task.dueDate ?? null,
      task.completedAt ?? null,
      task.needsAssignee ?? false,
      task.teamOnly ?? false,
      task.teamId ?? null,
      task.projectId ?? null,
      task.parentId ?? null,
      task.createdBy,
    ],
  );
}

async function assign(
  client: pg.PoolClient,
  taskId: Id,
  userId: Id,
  role: "owner" | "support" | "approver",
  source: "assigned" | "claimed",
  assignedBy: Id | null,
  endedAt: Date | null = null,
) {
  await insertRow(
    client,
    `INSERT INTO task_assignments
       (task_id, user_id, role, source, assigned_by, started_at, ended_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [taskId, userId, role, source, assignedBy, daysFromNow(-5), endedAt],
  );
}

async function seedTasks(
  client: pg.PoolClient,
  u: Record<string, Id>,
  t: Record<string, Id>,
  p: Record<string, Id>,
) {
  // 1. Gecikmiş, sahipli (üstlenilmiş), onaylayıcılı
  const report = await createTask(client, {
    title: "Bağış raporunu hazırlamak",
    description: "Üç aylık bağış özetinin hazırlanması",
    status: "doing",
    dueDate: -5,
    teamId: t.board,
    createdBy: u.ayse,
  });
  await assign(client, report, u.mehmet, "owner", "claimed", null);
  await assign(client, report, u.ayse, "approver", "assigned", u.mehmet);

  // 2. Yaklaşan, sahipli (üstlenilmiş), projeye bağlı
  const hall = await createTask(client, {
    title: "Eğitim salonu rezervasyonu",
    status: "todo",
    dueDate: 2,
    teamId: t.education,
    projectId: p.education,
    createdBy: u.mehmet,
  });
  await assign(client, hall, u.zeynep, "owner", "claimed", null);

  // 3. Terminsiz, sahipli (üstlenilmiş)
  const calendar = await createTask(client, {
    title: "Sosyal medya paylaşım takvimi",
    status: "doing",
    dueDate: null,
    teamId: t.social,
    createdBy: u.selin,
  });
  await assign(client, calendar, u.selin, "owner", "claimed", null);

  // 4. Havuz: needs_assignee = true, sahipsiz
  const trainer = await createTask(client, {
    title: "Kurs için gönüllü eğitmen bulmak",
    description: "Kasım programındaki atölye için eğitmen aranıyor",
    status: "todo",
    dueDate: 7,
    needsAssignee: true,
    teamId: t.education,
    projectId: p.education,
    createdBy: u.mehmet,
  });

  // 5. Havuz: needs_assignee = true, sahipsiz
  await createTask(client, {
    title: "Genel kurul için kahve ikramı tedariki",
    status: "todo",
    dueDate: 30,
    needsAssignee: true,
    teamId: t.board,
    projectId: p.general,
    createdBy: u.ayse,
  });

  // 6. needs_assignee = true ama sahipli: havuzda görünmez
  const poster = await createTask(client, {
    title: "Genel kurul afişi tasarımı",
    status: "todo",
    dueDate: 10,
    needsAssignee: true,
    teamId: t.social,
    createdBy: u.selin,
  });
  await assign(client, poster, u.kerem, "owner", "claimed", null);

  // 7. Ekibe özel ve sahipsiz: havuzda görünmez (team_only = true)
  const archive = await createTask(client, {
    title: "Yönetim kurulu toplantı notları arşivi",
    description: "Yalnızca kurul üyelerinin göreceği dosyalar",
    status: "todo",
    dueDate: 4,
    needsAssignee: true,
    teamOnly: true,
    teamId: t.board,
    createdBy: u.ayse,
  });

  // 8. Bitmiş görev
  const certificates = await createTask(client, {
    title: "Ocak eğitim sertifikalarını basmak",
    status: "done",
    dueDate: -4,
    completedAt: daysFromNow(-3),
    teamId: t.education,
    projectId: p.education,
    createdBy: u.mehmet,
  });
  await assign(client, certificates, u.mehmet, "owner", "claimed", null);

  // 9. Alt görev (parent: salon rezervasyonu)
  const projector = await createTask(client, {
    title: "Salon için projeksiyon kontrolü",
    status: "todo",
    dueDate: 1,
    teamId: t.education,
    parentId: hall,
    createdBy: u.mehmet,
  });
  await assign(client, projector, u.selin, "owner", "claimed", null);

  // 10. Bırakılmış atama: Kerem bıraktı, görev havuza döndü
  const survey = await createTask(client, {
    title: "Sosyal medya anket formu",
    status: "todo",
    dueDate: 14,
    needsAssignee: true,
    teamId: t.social,
    createdBy: u.selin,
  });
  await assign(client, survey, u.kerem, "owner", "claimed", null, daysFromNow(-2));

  // 11. Sahipli + destekçi (atanmış)
  const invitation = await createTask(client, {
    title: "Genel kurul davetiye metni",
    status: "doing",
    dueDate: 15,
    teamId: t.board,
    projectId: p.general,
    createdBy: u.ayse,
  });
  await assign(client, invitation, u.ayse, "owner", "claimed", null);
  await assign(client, invitation, u.zeynep, "support", "assigned", u.ayse);

  // 12. Gecikmiş, atanmış sahip
  const translation = await createTask(client, {
    title: "Eğitim materyali çevirisi",
    status: "doing",
    dueDate: -12,
    teamId: t.education,
    projectId: p.education,
    createdBy: u.mehmet,
  });
  await assign(client, translation, u.zeynep, "owner", "assigned", u.mehmet);

  return { report, archive, trainer, certificates, survey };
}

async function seedCommentsAndHistory(
  client: pg.PoolClient,
  u: Record<string, Id>,
  tasks: Record<string, Id>,
) {
  const comments: [Id, Id, string][] = [
    [tasks.report, u.ayse, "Rapor için bağış tablosunu güncelleyebilir misiniz?"],
    [tasks.trainer, u.mehmet, "Bu konuda herkes destek olabilir."],
    [tasks.archive, u.ayse, "Bu not yalnızca kurul üyelerine görünür."],
    [tasks.survey, u.kerem, "Anket formunu bu hafta bırakıyorum, kişi aranıyor."],
  ];
  for (const [taskId, userId, body] of comments) {
    await insertRow(
      client,
      "INSERT INTO task_comments (task_id, user_id, body) VALUES ($1, $2, $3)",
      [taskId, userId, body],
    );
  }

  const history: [Id, Id, string, string | null, string | null][] = [
    [tasks.report, u.mehmet, "status", "todo", "doing"],
    [tasks.trainer, u.mehmet, "needs_assignee", "false", "true"],
    [tasks.certificates, u.mehmet, "status", "doing", "done"],
    [tasks.survey, u.kerem, "owner", "Kerem Demir", null],
  ];
  for (const [taskId, userId, field, oldValue, newValue] of history) {
    await insertRow(
      client,
      "INSERT INTO task_history (task_id, user_id, field, old_value, new_value) VALUES ($1, $2, $3, $4, $5)",
      [taskId, userId, field, oldValue, newValue],
    );
  }
}

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "TRUNCATE sessions, login_tokens, task_history, task_comments, task_assignments, tasks, projects, team_members, teams, users RESTART IDENTITY CASCADE",
    );

    const users = await seedUsers(client);
    const teams = await seedTeams(client);
    await seedMembers(client, users, teams);
    const projects = await seedProjects(client, users, teams);
    const tasks = await seedTasks(client, users, teams, projects);
    await seedCommentsAndHistory(client, users, tasks);

    await client.query("COMMIT");

    const { rows } = await client.query<{ table_name: string; count: string }>(
      `SELECT 'users' AS table_name, count(*) FROM users
       UNION ALL SELECT 'teams', count(*) FROM teams
       UNION ALL SELECT 'team_members', count(*) FROM team_members
       UNION ALL SELECT 'projects', count(*) FROM projects
       UNION ALL SELECT 'tasks', count(*) FROM tasks
       UNION ALL SELECT 'task_assignments', count(*) FROM task_assignments
       UNION ALL SELECT 'task_comments', count(*) FROM task_comments
       UNION ALL SELECT 'task_history', count(*) FROM task_history`,
    );
    console.log("Seed tamamlandı:");
    for (const row of rows) {
      console.log(`  ${row.table_name}: ${row.count}`);
    }
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Seed başarısız:", err);
  process.exit(1);
});
