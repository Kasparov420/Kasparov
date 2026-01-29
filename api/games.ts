import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Chess } from "chess.js";

type Game = {
  id: string;
  fen: string;
  turn: "w" | "b";
  whiteName: string;
  blackName?: string;
  moves: { uci: string; txid?: string; ts: number }[];
};

const games = new Map<string, Game>();

function createGame(whiteName: string): Game {
  const c = new Chess();
  const id = crypto.randomUUID();
  const g: Game = { id, fen: c.fen(), turn: "w", whiteName, moves: [] };
  games.set(id, g);
  return g;
}

function joinGame(gameId: string, blackName: string): Game | null {
  const g = games.get(gameId);
  if (!g) return null;
  g.blackName = blackName;
  return g;
}

function getGame(gameId: string): Game | null {
  return games.get(gameId) ?? null;
}

function applyMove(gameId: string, uci: string, txid?: string): Game | null {
  const g = games.get(gameId);
  if (!g) return null;

  const c = new Chess();
  c.load(g.fen);

  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  const promo = uci.length > 4 ? uci.slice(4) : undefined;

  const mv = c.move({ from, to, promotion: promo as any });
  if (!mv) return g;

  g.fen = c.fen();
  g.turn = c.turn();
  g.moves.push({ uci, txid, ts: Date.now() });
  return g;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
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

    res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    console.error("API error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    res.status(500).json({ error: message });
  }
}
