import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createGame, getGame, joinGame, applyMove, listGames, isUsingRedis } from '../lib/gameStorage'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const route = Array.isArray(req.query.route) ? req.query.route : [req.query.route || ''];
  const [gameId, action] = route;

  console.log(`[games] ${req.method} /${route.join('/')} - storage: ${isUsingRedis() ? 'redis' : 'memory'}`)

  try {
    // List all games (for debugging)
    if (req.method === 'GET' && gameId === 'list') {
      const result = await listGames()
      return res.status(200).json(result);
    }

    if (req.method === 'POST' && !gameId) {
      const { address } = req.body || {};
      if (!address) {
        return res.status(400).json({ error: 'missing address' });
      }
      const game = await createGame(address);
      return res.status(201).json({ game });
    }

    if (req.method === 'GET' && gameId && !action) {
      const game = await getGame(gameId as string);
      if (!game) {
        const storage = isUsingRedis() ? 'Redis' : 'memory (serverless instance)'
        return res.status(404).json({ 
          error: `Game "${gameId}" not found.`,
          hint: `Games are stored in ${storage}. On Vercel without Redis, games may be lost between requests.`,
          storage: isUsingRedis() ? 'redis' : 'memory'
        });
      }
      return res.status(200).json({ game });
    }

    if (req.method === 'POST' && gameId && action === 'join') {
      const { address } = req.body || {};
      if (!address) {
        return res.status(400).json({ error: 'missing address' });
      }
      const game = await joinGame(gameId as string, address);
      if (!game) {
        return res.status(400).json({ error: 'Cannot join game. Game may not exist, has already started, or you are trying to join your own game.' });
      }
      return res.status(200).json({ game });
    }

    if (req.method === 'POST' && gameId && action === 'move') {
      const { address, uci } = req.body || {};
      if (!address || !uci) {
        return res.status(400).json({ error: 'missing address/uci' });
      }
      const game = await applyMove(gameId as string, address, uci);
      if (!game) {
        return res.status(400).json({ error: 'move failed' });
      }
      return res.status(200).json({ game });
    }

    res.status(404).json({ error: 'not found' });
  } catch (e) {
    console.error('[games] Error:', e);
    res.status(500).json({ error: 'internal server error', details: String(e) });
  }
}
