import { createGame, joinGame, getGame, applyMove } from "../../kaspa-chess-web/server/gameStore";
import type { VercelRequest, VercelResponse } from "@vercel/node";

export default (req: VercelRequest, res: VercelResponse) => {
  res.setHeader("Content-Type", "application/json");

  const route = Array.isArray(req.query.route) ? req.query.route : [req.query.route || ""];
  const [gameId, action] = route;

  try {
    // POST /api/games - Create game
    if (req.method === "POST" && !gameId) {
      const { whiteName } = req.body;
      if (!whiteName) {
        return res.status(400).json({ error: "whiteName required" });
      }
      const game = createGame(whiteName);
      return res.status(201).json({ game });
    }

    // GET /api/games/:id - Get game
    if (req.method === "GET" && gameId && !action) {
      const game = getGame(gameId);
      if (!game) {
        return res.status(404).json({ error: "Game not found" });
      }
      return res.status(200).json({ game });
    }

    // POST /api/games/:id/join - Join game
    if (req.method === "POST" && gameId && action === "join") {
      const { blackName } = req.body;
      if (!blackName) {
        return res.status(400).json({ error: "blackName required" });
      }
      const game = joinGame(gameId, blackName);
      if (!game) {
        return res.status(404).json({ error: "Game not found" });
      }
      return res.status(200).json({ game });
    }

    // POST /api/games/:id/move - Make move
    if (req.method === "POST" && gameId && action === "move") {
      const { uci, txid } = req.body;
      if (!uci) {
        return res.status(400).json({ error: "uci required" });
      }
      const game = applyMove(gameId, uci, txid);
      if (!game) {
        return res.status(404).json({ error: "Game not found" });
      }
      return res.status(200).json({ game });
    }

    res.status(404).json({ error: "Route not found" });
  } catch (error) {
    console.error("API error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
};
