import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getGame, isUsingRedis } from '../../lib/gameStorage.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const gameId = req.query.id as string;
  console.log(`[games/${gameId}] ${req.method} - storage: ${isUsingRedis() ? 'redis' : 'memory'}`);

  try {
    // Debug endpoint
    if (gameId === 'debug') {
      const url = process.env.UPSTASH_REDIS_REST_URL || ''
      const token = process.env.UPSTASH_REDIS_REST_TOKEN || ''
      let testResult = 'not tested'
      try {
        const { Redis } = await import('@upstash/redis')
        const testRedis = new Redis({ url, token })
        await testRedis.ping()
        testResult = 'connected!'
      } catch (e) {
        testResult = 'error: ' + String(e)
      }
      return res.status(200).json({ 
        storage: isUsingRedis() ? 'redis' : 'memory',
        testResult,
        urlLen: url.length,
        tokenLen: token.length
      });
    }

    // Get game (GET /api/games/:id)
    if (req.method === 'GET') {
      const game = await getGame(gameId);
      if (!game) {
        return res.status(404).json({ 
          error: `Game "${gameId}" not found.`,
          storage: isUsingRedis() ? 'redis' : 'memory'
        });
      }
      return res.status(200).json({ game });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('[games] Error:', e);
    res.status(500).json({ error: 'internal server error', details: String(e) });
  }
}
