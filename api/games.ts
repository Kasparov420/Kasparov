import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createGame, joinGame, getGame, applyMove } from "../kaspa-chess-web/server/gameStore";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Parse path: /api/games, /api/games/123, /api/games/123/join, /api/games/123/move
  const parts = req.url?.split("/").filter(Boolean) || [];
  const gameId = parts[2]; // games/[id]
  const action = parts[3]; // join, move, etc

  // POST /api/games - create game
  if (req.method === "POST" && !gameId && !action) {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const game = createGame(body?.whiteName ?? "White");
    return res.status(200).json({ game });
  }

  // GET /api/games?gameId=xxx - retrieve game
  if (req.method === "GET" && !gameId) {
    const id = typeof req.query.gameId === "string" ? req.query.gameId : null;
    if (!id) return res.status(400).json({ error: "gameId required" });
    const game = getGame(id);
    if (!game) return res.status(404).json({ error: "game not found" });
    return res.status(200).json({ game });
  }

  if (!gameId) return res.status(400).json({ error: "gameId required" });

  // GET /api/games/[id] - retrieve specific game
  if (req.method === "GET" && !action) {
    const game = getGame(gameId);
    if (!game) return res.status(404).json({ error: "game not found" });
    return res.status(200).json({ game });
  }

  // POST /api/games/[id]/join - join game
  if (req.method === "POST" && action === "join") {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const game = joinGame(gameId, body?.blackName ?? "Black");
    if (!game) return res.status(404).json({ error: "game not found" });
    return res.status(200).json({ game });
  }

  // POST /api/games/[id]/move - apply move
  if (req.method === "POST" && action === "move") {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const game = applyMove(gameId, body?.uci, body?.txid);
    if (!game) return res.status(404).json({ error: "game not found" });
    return res.status(200).json({ game });
  }

  res.status(405).end();
}
