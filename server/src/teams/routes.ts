import { Router } from "express";
import { requireAuth } from "../auth/session.js";
import { query } from "../db.js";
import { asObject, parseId, parseNonNegativeInteger } from "../validation.js";
import { getTeamDetail, joinTeam, leaveTeam, listTeams, updateTeamRequiredPeople } from "./service.js";

export const teamsRouter = Router();

teamsRouter.use(requireAuth);

const TEAM_COLUMNS = "t.id, t.name, t.description, t.type, t.term_start, t.term_end";
const MAX_REQUIRED_PEOPLE = 1000;

teamsRouter.get("/", async (req, res) => {
  res.json({ teams: await listTeams(req.user!.id) });
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

teamsRouter.get("/:id", async (req, res) => {
  const id = parseId(req.params.id, "Geçersiz ekip kimliği.");
  res.json({ team: await getTeamDetail(req.user!.id, id) });
});

teamsRouter.post("/:id/join", async (req, res) => {
  const id = parseId(req.params.id, "Geçersiz ekip kimliği.");
  await joinTeam(req.user!.id, id);
  res.status(204).end();
});

teamsRouter.post("/:id/leave", async (req, res) => {
  const id = parseId(req.params.id, "Geçersiz ekip kimliği.");
  await leaveTeam(req.user!.id, id);
  res.status(204).end();
});

teamsRouter.patch("/:id", async (req, res) => {
  const id = parseId(req.params.id, "Geçersiz ekip kimliği.");
  const body = asObject(req.body);
  const requiredPeople = parseNonNegativeInteger(body.requiredPeople, "Gerekli kişi sayısı", MAX_REQUIRED_PEOPLE);
  await updateTeamRequiredPeople(req.user!.id, id, requiredPeople);
  res.json({ team: await getTeamDetail(req.user!.id, id) });
});
