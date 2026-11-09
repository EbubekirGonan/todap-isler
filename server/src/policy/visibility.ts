import type pg from "pg";

// Görünürlük kuralları yalnızca bu dosyada tanımlanır. Rotalar ve servisler buradaki SQL parçalarını kullanır.
// Düzenleme ve silme herkese (aktif kullanıcılara) açıktır; bu yüzden bu dosyada rol kontrolü yoktur.

export type TaskScope = "public" | "mine-team" | "all";

function activeTeamIdsSql(userParam: string): string {
  return `SELECT m.team_id FROM team_members m WHERE m.user_id = ${userParam} AND m.ended_at IS NULL`;
}

function activeAssignmentSql(userParam: string, alias: string): string {
  return `EXISTS (SELECT 1 FROM task_assignments a WHERE a.task_id = ${alias}.id AND a.user_id = ${userParam} AND a.ended_at IS NULL)`;
}

// Kullanıcının görebildiği görevler: herkese açık olanlar, aktif üyesi olduğu ekiplerin ekibe özel görevleri
// ve üzerinde aktif bir atama bulunan görevler (ekipten ayrılsa bile İşlerim'de kalır).
export function visibleToUserSql(userParam: string, alias = "t"): string {
  return `(${alias}.team_only = false OR ${alias}.team_id IN (${activeTeamIdsSql(userParam)}) OR ${activeAssignmentSql(userParam, alias)})`;
}

// Görevler sekmesindeki kapsam: herkese açık, bana özel (üyesi olduğum ekiplerin ekibe özel görevleri) ya da hepsi.
export function scopeSql(scope: TaskScope, userParam: string, alias = "t"): string {
  switch (scope) {
    case "public":
      return `${alias}.team_only = false`;
    case "mine-team":
      return `(${alias}.team_only = true AND ${alias}.team_id IN (${activeTeamIdsSql(userParam)}))`;
    case "all":
      return visibleToUserSql(userParam, alias);
  }
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
