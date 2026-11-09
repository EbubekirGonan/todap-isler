import express from "express";
import { config } from "./config.js";
import { query } from "./db.js";

const app = express();

app.use(express.json());

app.get("/api/health", async (_req, res) => {
  try {
    await query("SELECT 1");
    res.json({ status: "ok", db: "ok" });
  } catch {
    res.status(503).json({ status: "error", db: "unreachable" });
  }
});

app.listen(config.port, () => {
  console.log(`API çalışıyor: http://localhost:${config.port}`);
});
