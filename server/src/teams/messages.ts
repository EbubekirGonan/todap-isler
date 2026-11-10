import { query } from "../db.js";
import { HttpError } from "../http-error.js";

export const MESSAGE_MAX_LENGTH = 2000;
export const MESSAGE_PAGE_SIZE = 30;

type MessageRow = {
  id: string;
  user_id: string;
  author_name: string;
  body: string;
  created_at: Date;
  updated_at: Date | null;
};

function messageDto(row: MessageRow, userId: string) {
  return {
    id: row.id,
    body: row.body,
    authorName: row.author_name,
    isMine: row.user_id === userId,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at ? row.updated_at.toISOString() : null,
  };
}

export async function teamExists(teamId: string): Promise<boolean> {
  const result = await query("SELECT 1 FROM teams WHERE id = $1", [teamId]);
  return result.rowCount === 1;
}

// En yeni mesajlardan geriye doğru sayfalar; dönen liste eski→yeni sıralıdır.
export async function listTeamMessages(userId: string, teamId: string, before: string | null, limit: number) {
  const result = await query<MessageRow>(
    `SELECT m.id, m.user_id, u.name AS author_name, m.body, m.created_at, m.updated_at
       FROM team_messages m
       JOIN users u ON u.id = m.user_id
      WHERE m.team_id = $1
        AND m.deleted_at IS NULL
        AND ($2::bigint IS NULL OR m.id < $2::bigint)
      ORDER BY m.id DESC
      LIMIT $3`,
    [teamId, before, limit + 1],
  );
  const hasMore = result.rows.length > limit;
  const rows = result.rows.slice(0, limit).reverse();
  return {
    messages: rows.map((row) => messageDto(row, userId)),
    hasMore,
  };
}

export async function createTeamMessage(userId: string, teamId: string, body: string) {
  const result = await query<{ id: string }>(
    "INSERT INTO team_messages (team_id, user_id, body) VALUES ($1, $2, $3) RETURNING id",
    [teamId, userId, body],
  );
  return result.rows[0].id;
}

type MessageRef = { id: string; team_id: string; user_id: string };

// Silinmemiş mesajı bulur; bulunamazsa 404 döner.
export async function findTeamMessage(teamId: string, messageId: string): Promise<MessageRef> {
  const result = await query<MessageRef>(
    "SELECT id, team_id, user_id FROM team_messages WHERE id = $1 AND team_id = $2 AND deleted_at IS NULL",
    [messageId, teamId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new HttpError(404, "Mesaj bulunamadı.");
  }
  return row;
}

export async function updateTeamMessage(teamId: string, messageId: string, body: string): Promise<void> {
  await query(
    "UPDATE team_messages SET body = $3, updated_at = now() WHERE id = $1 AND team_id = $2 AND deleted_at IS NULL",
    [messageId, teamId, body],
  );
}

// Mesajlar fiziksel olarak silinmez; deleted_at ile gizlenir.
export async function deleteTeamMessage(teamId: string, messageId: string): Promise<void> {
  await query(
    "UPDATE team_messages SET deleted_at = now() WHERE id = $1 AND team_id = $2 AND deleted_at IS NULL",
    [messageId, teamId],
  );
}
