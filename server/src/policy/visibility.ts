import type { NextFunction, Request, Response } from "express";
import type pg from "pg";
import { query } from "../db.js";

// Görünürlük kuralları yalnızca bu dosyada tanımlanır. Rotalar ve servisler buradaki SQL parçalarını kullanır.
// Düzenleme ve silme herkese (aktif kullanıcılara) açıktır; bu yüzden bu dosyada rol kontrolü yoktur.

export type TaskScope = "public" | "mine-team" | "all";

function activeTeamIdsSql(userParam: string): string {
  return `SELECT m.team_id FROM team_members m WHERE m.user_id = ${userParam} AND m.ended_at IS NULL`;
}

// Tüm görevler herkese görünür (ekibe özel olanlar dahil). Ekibe özel olması yalnızca katılımı kısıtlar.
export function visibleToUserSql(alias = "t"): string {
  return `${alias}.deleted_at IS NULL`;
}

// Görevler sekmesindeki kapsam: herkese açık, bana özel (üyesi olduğum ekiplerin ekibe özel görevleri) ya da hepsi.
export function scopeSql(scope: TaskScope, userParam: string, alias = "t"): string {
  switch (scope) {
    case "public":
      return `${alias}.team_only = false`;
    case "mine-team":
      return `(${alias}.team_only = true AND ${alias}.team_id IN (${activeTeamIdsSql(userParam)}))`;
    case "all":
      return "TRUE";
  }
}

// Havuz yalnızca herkese açık görevleri gösterir; ekibe özel görevler havuza girmez.
export function poolSql(alias = "t"): string {
  return `${alias}.team_only = false`;
}

// Kullanıcının aktif üyesi olduğu ekiplerin kimlikleri. Görev DTO'sundaki canJoin hesabında kullanılır.
export async function activeTeamIds(userId: string): Promise<Set<string>> {
  const result = await query<{ team_id: string }>(`${activeTeamIdsSql("$1")}`, [userId]);
  return new Set(result.rows.map((row) => row.team_id));
}

// Katılım kuralı: ekibe özel görevlere yalnızca o ekibin aktif üyeleri katkı sağlayabilir ya da destek olabilir.
export function canJoinTask(task: { team_only: boolean; team_id: string | null }, teamIds: Set<string>): boolean {
  return !task.team_only || (task.team_id !== null && teamIds.has(task.team_id));
}

// Ekibe özel görevlere yalnızca o ekibin aktif üyeleri atanabilir.
export async function isActiveTeamMember(
  client: pg.PoolClient,
  teamId: string,
  userId: string,
): Promise<boolean> {
  const result = await client.query(
    "SELECT 1 FROM team_members WHERE team_id = $1 AND user_id = $2 AND ended_at IS NULL",
    [teamId, userId],
  );
  return result.rowCount === 1;
}

// Ekip sekmesi ve ekip görevleri yalnızca aktif üyelere açıktır.
export async function isTeamMember(userId: string, teamId: string): Promise<boolean> {
  const result = await query(
    "SELECT 1 FROM team_members WHERE team_id = $1 AND user_id = $2 AND ended_at IS NULL",
    [teamId, userId],
  );
  return result.rowCount === 1;
}

// Yönetici uçları yalnızca admin kullanıcıya açıktır. requireAuth'tan sonra kullanılmalıdır.
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user?.isAdmin) {
    res.status(403).json({ error: "Bu işlem için yönetici yetkisi gerekiyor." });
    return;
  }
  next();
}
