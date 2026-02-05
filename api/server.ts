/**
 * Kasparov Chess API Server
 *
 * Simple Node.js server for game creation and state management
 * Uses the watcher to poll for transactions and update game state
 */

import express from 'express';
import cors from 'cors';
import { createGame, getGame, getGameMoves, startWatcher } from '../apps/web/src/kaspa/watcher';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// In-memory game storage (replace with DB)
const activeGames = new Map<string, any>();

/**
 * Create a new game
 */
app.post('/api/games', (req, res) => {
  try {
    // For now, use a fixed sink address for all games
    // In production, this could be a per-game address or main contract
    const sinkAddress = 'kaspa:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqhxwq4r';
    
    const gameId = createGame(sinkAddress);
    activeGames.set(gameId, { sinkAddress, createdAt: new Date() });

    console.log('[API] Created game:', gameId, 'sink:', sinkAddress);

    // Return game in the format expected by frontend
    const game = {
      id: gameId,
      createdAt: Date.now(),
      status: 'LOBBY' as const,
      allowStakes: false,
      whiteName: 'Player 1',
      turn: 'w' as const,
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      moves: [],
      lastMoveTxid: '0'.repeat(64),
    };

    res.json({ game });
  } catch (error) {
    console.error('[API] Error creating game:', error);
    res.status(500).json({ error: 'Failed to create game' });
  }
});

/**
 * Get game state
 */
app.get('/api/games/:gameId', (req, res) => {
  try {
    const { gameId } = req.params;
    const game = getGame(gameId);

    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }

    const moves = getGameMoves(gameId);

    res.json({
      ...game,
      moves
    });
  } catch (error) {
    console.error('[API] Error getting game:', error);
    res.status(500).json({ error: 'Failed to get game' });
  }
});

/**
 * Join a game (placeholder - would validate player address)
 */
app.post('/api/games/:gameId/join', (req, res) => {
  try {
    const { gameId } = req.params;
    const { address } = req.body;

    const game = getGame(gameId);
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }

    // For now, just accept any join
    console.log('[API] Player joined game:', gameId, 'address:', address);

    res.json({ success: true });
  } catch (error) {
    console.error('[API] Error joining game:', error);
    res.status(500).json({ error: 'Failed to join game' });
  }
});

/**
 * Make a move (frontend calls this after publishing tx)
 */
app.post('/api/games/:gameId/move', (req, res) => {
  try {
    const { gameId } = req.params;
    const { address, uci, txid } = req.body;

    console.log('[API] Move reported:', { gameId, address, uci, txid });

    // In a real implementation, we'd validate the tx and update state
    // For now, just acknowledge
    res.json({ success: true });
  } catch (error) {
    console.error('[API] Error recording move:', error);
    res.status(500).json({ error: 'Failed to record move' });
  }
});

/**
 * Health check
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    games: activeGames.size,
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`[API] Server running on port ${PORT}`);

  // Start the watcher for all games
  startWatcher().catch(error => {
    console.error('[API] Watcher failed:', error);
  });
});

export default app;