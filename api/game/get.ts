import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getGame } from "../kaspa-chess-web/server/gameStore";

export default function handler(req: VercelRequest, res: VercelResponse) {
  const gameId = String(req.query.gameId || "");
  const game = getGame(gameId);
  if (!game) return res.status(404).json({ error: "not found" });
  res.status(200).json({ game });
}
