import { Router } from "express";
import { requireAuth } from "../auth/session.js";
import { query } from "../db.js";

export const associationRouter = Router();

associationRouter.use(requireAuth);

// Dernek sekmesi herkese açıktır: tüm ekipler, türleri, dönem bilgisi ve aktif üyeler.
associationRouter.get("/teams", async (_req, res) => {
  const teams = await query<{
    id: string;
    name: string;
    description: string | null;
    type: string;
    term_start: string | null;
    term_end: string | null;
  }>("SELECT id, name, description, type, term_start, term_end FROM teams ORDER BY name, id");

  const members = await query<{ team_id: string; user_id: string; name: string; role_title: string | null }>(
    `SELECT m.team_id, m.user_id, u.name, m.role_title
       FROM team_members m
       JOIN users u ON u.id = m.user_id
      WHERE m.ended_at IS NULL
      ORDER BY u.name, m.user_id`,
  );

  const membersByTeam = new Map<string, { userId: string; name: string; roleTitle: string | null }[]>();
  for (const member of members.rows) {
    const list = membersByTeam.get(member.team_id) ?? [];
    list.push({ userId: member.user_id, name: member.name, roleTitle: member.role_title });
    membersByTeam.set(member.team_id, list);
  }

  res.json({
    teams: teams.rows.map((team) => ({
      id: team.id,
      name: team.name,
      description: team.description,
      type: team.type,
      termStart: team.term_start,
      termEnd: team.term_end,
      members: membersByTeam.get(team.id) ?? [],
    })),
  });
});
