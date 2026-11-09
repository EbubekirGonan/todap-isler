import { Router } from "express";
import { requireAuth } from "../auth/session.js";
import { query } from "../db.js";

export const teamsRouter = Router();

teamsRouter.use(requireAuth);

const TEAM_COLUMNS = "t.id, t.name, t.description, t.type, t.term_start, t.term_end";

teamsRouter.get("/", async (_req, res) => {
  const result = await query(`SELECT ${TEAM_COLUMNS} FROM teams t ORDER BY t.name, t.id`);
  res.json({ teams: result.rows });
});

// Kullanıcının aktif üyesi olduğu ekipler; ekip sekmeleri bu listeden oluşur.
teamsRouter.get("/mine", async (req, res) => {
  const result = await query(
    `SELECT ${TEAM_COLUMNS}, m.role_title
       FROM teams t
       JOIN team_members m ON m.team_id = t.id
      WHERE m.user_id = $1 AND m.ended_at IS NULL
      ORDER BY t.name, t.id`,
    [req.user!.id],
  );
  res.json({ teams: result.rows });
});
