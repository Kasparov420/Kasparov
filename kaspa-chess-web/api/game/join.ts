import type { VercelRequest, VercelResponse } from "@vercel/node";
import { joinGame } from "../../server/gameStore";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).end();
  const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  const game = joinGame(body?.gameId, body?.blackName ?? "Black");
  if (!game) return res.status(404).json({ error: "not found" });
  res.status(200).json({ game });
}
