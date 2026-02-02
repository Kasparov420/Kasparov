import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createGame, listGames, listWaitingGames, isUsingRedis } from '../lib/gameStorage.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  console.log(`[games/index] ${req.method} - storage: ${isUsingRedis() ? 'redis' : 'memory'}`);

  try {
    // Create new game (POST /api/games)
    if (req.method === 'POST') {
      const { address } = req.body || {};
      if (!address) {
        return res.status(400).json({ error: 'missing address' });
      }
      const game = await createGame(address);
      return res.status(201).json({ game });
    }

    // List games (GET /api/games)
    if (req.method === 'GET') {
      const waitingOnly = req.query.waiting === 'true';
      const result = waitingOnly ? await listWaitingGames() : await listGames();
      return res.status(200).json(result);
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('[games/index] Error:', e);
    res.status(500).json({ error: 'internal server error', details: String(e) });
  }
}
