import type { VercelRequest, VercelResponse } from "@vercel/node";
import { applyMove, isUsingRedis } from '../../lib/gameStorage.js'

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
  console.log(`[games/${gameId}/move] POST - storage: ${isUsingRedis() ? 'redis' : 'memory'}`);

  try {
    const { address, uci } = req.body || {};
    if (!address || !uci) {
      return res.status(400).json({ error: 'missing address or uci' });
    }
    
    const game = await applyMove(gameId, address, uci);
    if (!game) {
      return res.status(400).json({ error: 'Move failed. It may not be your turn or the move is invalid.' });
    }
    
    return res.status(200).json({ game });
  } catch (e) {
    console.error('[games/move] Error:', e);
    res.status(500).json({ error: 'internal server error', details: String(e) });
  }
}
