const { Chess } = require('chess.js');

// Simple in-memory game store
const games = new Map();

function createGame(whiteName) {
  const chess = new Chess();
  const id = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substr(2, 9);
  const game = {
    id,
    fen: chess.fen(),
    turn: 'w',
    whiteName,
    moves: []
  };
  games.set(id, game);
  return game;
}

function joinGame(gameId, blackName) {
  const game = games.get(gameId);
  if (!game) return null;
  game.blackName = blackName;
  return game;
}

function getGame(gameId) {
  return games.get(gameId) || null;
}

function applyMove(gameId, uci, txid) {
  const game = games.get(gameId);
  if (!game) return null;

  const chess = new Chess();
  chess.load(game.fen);

  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  const promo = uci.length > 4 ? uci.slice(4) : undefined;

  const move = chess.move({ from, to, promotion: promo });
  if (!move) return game;

  game.fen = chess.fen();
  game.turn = chess.turn();
  game.moves.push({ uci, txid, ts: Date.now() });
  return game;
}

module.exports = (req, res) => {
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
      const game = getGame(gameId);
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
      const game = joinGame(gameId, blackName);
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
      const game = applyMove(gameId, uci, txid);
      if (!game) {
        return res.status(404).json({ error: 'Game not found' });
      }
      return res.status(200).json({ game });
    }

    res.status(404).json({ error: 'Route not found' });
  } catch (error) {
    console.error('API error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
};
