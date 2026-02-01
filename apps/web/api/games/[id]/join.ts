import type { VercelRequest, VercelResponse } from "@vercel/node";
import { joinGame, isUsingRedis } from '../../lib/gameStorage.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const gameId = req.query.id as string;
  console.log(`[games/${gameId}/join] POST - storage: ${isUsingRedis() ? 'redis' : 'memory'}`);

  try {
    const { address } = req.body || {};
    if (!address) {
      return res.status(400).json({ error: 'missing address' });
    }
    
    const game = await joinGame(gameId, address);
    if (!game) {
      return res.status(400).json({ 
        error: 'Cannot join game. Game may not exist, has already started, or you are trying to join your own game.' 
      });
    }
    
    return res.status(200).json({ game });
  } catch (e) {
    console.error('[games/join] Error:', e);
    res.status(500).json({ error: 'internal server error', details: String(e) });
  }
}
