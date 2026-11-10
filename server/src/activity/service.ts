import type pg from "pg";
import { query } from "../db.js";
import { feedTaskVisibleSql } from "../policy/visibility.js";

export type ActivityInput = {
  userId: string;
  action: string;
  entityType: "project" | "team";
  entityId: string;
  entityName: string;
  field?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
};

// Görev dışı hareketleri akışa yazar. Çağıran, ana işlemle aynı transaction içinde çağırmalıdır.
export async function recordActivity(client: pg.PoolClient, input: ActivityInput): Promise<void> {
  await client.query(
    `INSERT INTO activity_log (user_id, action, entity_type, entity_id, entity_name, field, old_value, new_value)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      input.userId,
      input.action,
      input.entityType,
      input.entityId,
      input.entityName,
      input.field ?? null,
      input.oldValue ?? null,
      input.newValue ?? null,
    ],
  );
}

export type FeedEntry = {
  kind: "task" | "project" | "team";
  entityId: string;
  entityName: string;
  action: string | null;
  field: string | null;
  oldValue: string | null;
  newValue: string | null;
  userId: string;
  userName: string;
  createdAt: string;
};

type FeedRow = {
  kind: "task" | "project" | "team";
  entity_id: string;
  entity_name: string;
  action: string | null;
  field: string | null;
  old_value: string | null;
  new_value: string | null;
  user_id: string;
  user_name: string;
  created_at: Date;
};

// Görev hareketleri task_history'den, diğerleri activity_log'dan okunur. Ekibe özel görevler yalnızca üyelerine görünür.
export async function listFeed(userId: string, limit: number, before: string | null): Promise<FeedEntry[]> {
  const result = await query<FeedRow>(
    `WITH feed AS (
       SELECT 'task'::text AS kind, h.task_id AS entity_id, t.title AS entity_name, NULL::text AS action,
              h.field, h.old_value, h.new_value, h.user_id, h.created_at, t.team_only, t.team_id
         FROM task_history h
         JOIN tasks t ON t.id = h.task_id
       UNION ALL
       SELECT a.entity_type, a.entity_id, a.entity_name, a.action,
              a.field, a.old_value, a.new_value, a.user_id, a.created_at, false, NULL::bigint
         FROM activity_log a
     )
     SELECT f.kind, f.entity_id, f.entity_name, f.action, f.field, f.old_value, f.new_value,
            f.user_id, u.name AS user_name, f.created_at
       FROM (
         SELECT f0.kind, f0.entity_id, f0.entity_name, f0.action, f0.field, f0.old_value, f0.new_value,
                f0.user_id, f0.team_only, f0.team_id, date_trunc('milliseconds', f0.created_at) AS created_at
           FROM feed f0
       ) f -- JSON ve imleç milisaniye hassasiyetinde, karşılaştırma da öyle olmalı
       JOIN users u ON u.id = f.user_id
      WHERE ($2::timestamptz IS NULL OR f.created_at <= $2)
        AND (f.kind <> 'task' OR ${feedTaskVisibleSql("$1", "f")})
      ORDER BY f.created_at DESC, f.kind, f.entity_id DESC
      LIMIT $3`,
    [userId, before, limit],
  );

  return result.rows.map((row) => ({
    kind: row.kind,
    entityId: row.entity_id,
    entityName: row.entity_name,
    action: row.action,
    field: row.field,
    oldValue: row.old_value,
    newValue: row.new_value,
    userId: row.user_id,
    userName: row.user_name,
    createdAt: row.created_at.toISOString(),
  }));
}
