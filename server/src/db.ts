import pg from "pg";
import { config } from "./config.js";

// date (OID 1082) gün bilgisidir; sürücü varsayılan olarak yerel gece yarısı Date'e çevirir.
// Metin olarak bırakılır ki gün kayması olmasın (YYYY-MM-DD).
pg.types.setTypeParser(1082, (value) => value);

// Tüm istekler bu tek havuzu paylaşır.
export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
});

export function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(text, params);
}
