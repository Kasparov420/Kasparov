import type { VercelRequest, VercelResponse } from "@vercel/node";

// Simple in-memory game store
const games = new Map();

// Simple UUID v4 generator
function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

interface Game {
  id: string;
  fen: string;
  turn: 'w' | 'b';
  whiteName: string;
  blackName?: string;
  moves: Array<{ uci: string; txid?: string; ts: number }>;
}

function createGame(whiteName: string): Game {
  const id = generateId();
  const game: Game = {
    id,
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    turn: 'w',
    whiteName,
    moves: []
  };
  games.set(id, game);
  return game;
}

function joinGame(gameId: string, blackName: string): Game | null {
  const game = games.get(gameId);
  if (!game) return null;
  game.blackName = blackName;
  return game;
}

function getGame(gameId: string): Game | null {
  return games.get(gameId) || null;
}

function applyMove(gameId: string, uci: string, txid?: string): Game | null {
  const game = games.get(gameId);
  if (!game) return null;

  // For now, just add the move without validation
  game.moves.push({ uci, txid, ts: Date.now() });
  // Toggle turn
  game.turn = game.turn === 'w' ? 'b' : 'w';
  return game;
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'application/json');

  const route = Array.isArray(req.query.route) ? req.query.route : [req.query.route || ''];
  const [gameId, action] = route;

  try {
    // POST /api/games - Create game
    if (req.method === 'POST' && !gameId) {
      const { whiteName } = req.body || {};
      if (!whiteName) {
        return res.status(400).json({ error: 'whiteName required' });
      }
      const game = createGame(whiteName);
      return res.status(201).json({ game });
    }

    // GET /api/games/:id - Get game
    if (req.method === 'GET' && gameId && !action) {
      const game = getGame(gameId as string);
      if (!game) {
        return res.status(404).json({ error: 'Game not found' });
      }
      return res.status(200).json({ game });
    }

    // POST /api/games/:id/join - Join game
    if (req.method === 'POST' && gameId && action === 'join') {
      const { blackName } = req.body || {};
      if (!blackName) {
        return res.status(400).json({ error: 'blackName required' });
      }
      const game = joinGame(gameId as string, blackName);
      if (!game) {
        return res.status(404).json({ error: 'Game not found' });
      }
      return res.status(200).json({ game });
    }

    // POST /api/games/:id/move - Make move
    if (req.method === 'POST' && gameId && action === 'move') {
      const { uci, txid } = req.body || {};
      if (!uci) {
        return res.status(400).json({ error: 'uci required' });
      }
      const game = applyMove(gameId as string, uci, txid);
      if (!game) {
        return res.status(404).json({ error: 'Game not found' });
      }
      return res.status(200).json({ game });
    }

    res.status(404).json({ error: 'Route not found' });
  } catch (error) {
    console.error('API error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    res.status(500).json({ error: errorMessage });
  }
}
