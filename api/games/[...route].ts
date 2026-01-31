import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Chess } from 'chess.js'
import { randomUUID } from 'crypto'

type Game = {
  id: string
  createdAt: number
  white: { address: string }
  black?: { address: string }
  fen: string
  turn: 'w' | 'b'
  status: 'waiting' | 'active' | 'ended'
  themeSeed: string
  lastMoveUci?: string
  moveCount: number
}

const games = new Map<string, Game>();

function generateId(): string {
  return randomUUID().slice(0, 12)
}

function createGame(address: string): Game {
  const chess = new Chess()
  const id = generateId()
  const game: Game = {
    id,
    createdAt: Date.now(),
    white: { address },
    fen: chess.fen(),
    turn: chess.turn() as 'w' | 'b',
    status: 'waiting',
    themeSeed: '',
    moveCount: 0,
  }
  games.set(id, game)
  return game
}

function joinGame(gameId: string, address: string): Game | null {
  const game = games.get(gameId)
  if (!game) return null
  if (game.status !== 'waiting') return null
  if (address === game.white.address) return null

  game.black = { address }
  game.status = 'active'
  game.themeSeed = randomUUID().slice(0, 8)
  return game
}

function getGame(gameId: string): Game | null {
  return games.get(gameId) || null
}

function applyMove(gameId: string, address: string, uci: string): Game | null {
  const game = games.get(gameId)
  if (!game) return null
  if (game.status !== 'active') return null

  const expected = game.turn === 'w' ? game.white.address : game.black?.address
  if (!expected || address !== expected) return null

  const chess = new Chess(game.fen)
  const from = uci.slice(0, 2)
  const to = uci.slice(2, 4)
  const promotion = uci.length > 4 ? uci.slice(4, 5) : undefined

  const move = chess.move({ from, to, promotion: promotion as any })
  if (!move) return null

  game.fen = chess.fen()
  game.turn = chess.turn() as 'w' | 'b'
  game.lastMoveUci = uci
  game.moveCount += 1

  if (
    chess.isCheckmate() ||
    chess.isDraw() ||
    chess.isStalemate() ||
    chess.isThreefoldRepetition() ||
    chess.isInsufficientMaterial()
  ) {
    game.status = 'ended'
  }

  return game
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'application/json');

  const route = Array.isArray(req.query.route) ? req.query.route : [req.query.route || ''];
  const [gameId, action] = route;

  try {
    if (req.method === 'POST' && !gameId) {
      const { address } = req.body || {};
      if (!address) {
        return res.status(400).json({ error: 'missing address' });
      }
      const game = createGame(address);
      return res.status(201).json({ game });
    }

    if (req.method === 'GET' && gameId && !action) {
      const game = getGame(gameId as string);
      if (!game) {
        return res.status(404).json({ error: 'not found' });
      }
      return res.status(200).json({ game });
    }

    if (req.method === 'POST' && gameId && action === 'join') {
      const { address } = req.body || {};
      if (!address) {
        return res.status(400).json({ error: 'missing address' });
      }
      const game = joinGame(gameId as string, address);
      if (!game) {
        return res.status(400).json({ error: 'cannot join' });
      }
      return res.status(200).json({ game });
    }

    if (req.method === 'POST' && gameId && action === 'move') {
      const { address, uci } = req.body || {};
      if (!address || !uci) {
        return res.status(400).json({ error: 'missing address/uci' });
      }
      const game = applyMove(gameId as string, address, uci);
      if (!game) {
        return res.status(400).json({ error: 'move failed' });
      }
      return res.status(200).json({ game });
    }

    res.status(404).json({ error: 'not found' });
  } catch (e) {
    res.status(500).json({ error: 'internal server error' });
  }
}
