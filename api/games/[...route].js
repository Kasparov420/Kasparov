// In-memory game store
const games = new Map();

module.exports = (req, res) => {
  res.setHeader("Content-Type", "application/json");
  
  try {
    const { method, body, query } = req;
    const route = req.query.route || [];
    const gameId = route[0];
    const action = route[1];

    // POST /api/games - create game
    if (method === "POST" && !gameId) {
      const id = Math.random().toString(36).substr(2, 9);
      const game = {
        id,
        fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        turn: "w",
        whiteName: body?.whiteName || "White",
        moves: []
      };
      games.set(id, game);
      return res.status(200).json({ game });
    }

    // GET /api/games/[id] - retrieve game
    if (method === "GET" && gameId && !action) {
      const game = games.get(gameId);
      if (!game) return res.status(404).json({ error: "game not found" });
      return res.status(200).json({ game });
    }

    // POST /api/games/[id]/join - join game
    if (method === "POST" && gameId && action === "join") {
      const game = games.get(gameId);
      if (!game) return res.status(404).json({ error: "game not found" });
      game.blackName = body?.blackName || "Black";
      return res.status(200).json({ game });
    }

    // POST /api/games/[id]/move - apply move
    if (method === "POST" && gameId && action === "move") {
      const game = games.get(gameId);
      if (!game) return res.status(404).json({ error: "game not found" });
      game.moves.push({ uci: body?.uci, txid: body?.txid, ts: Date.now() });
      game.turn = game.turn === "w" ? "b" : "w";
      return res.status(200).json({ game });
    }

    res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    console.error("API error:", error);
    res.status(500).json({ error: "Internal server error", message: error.message });
  }
};
