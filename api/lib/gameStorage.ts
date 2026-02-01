import { Redis } from '@upstash/redis'
import { Chess } from 'chess.js'
import { randomUUID } from 'crypto'

export type Game = {
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

// Try to connect to Upstash Redis if env vars are set
let redis: Redis | null = null
try {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })
    console.log('[storage] Using Upstash Redis for game storage')
  }
} catch (e) {
  console.log('[storage] Redis not available, using in-memory fallback')
}

// In-memory fallback (works for local dev and warm serverless instances)
declare global {
  var __games: Map<string, Game> | undefined
}
if (!global.__games) {
  global.__games = new Map<string, Game>()
}
const memoryGames = global.__games

const GAME_PREFIX = 'game:'
const GAME_TTL = 60 * 60 * 24 // 24 hours

function generateId(): string {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789'
  let id = ''
  for (let i = 0; i < 8; i++) {
    id += chars[Math.floor(Math.random() * chars.length)]
  }
  return id
}

export async function createGame(address: string): Promise<Game> {
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

  if (redis) {
    await redis.set(GAME_PREFIX + id, JSON.stringify(game), { ex: GAME_TTL })
    console.log(`[storage/redis] Created game ${id}`)
  } else {
    memoryGames.set(id, game)
    console.log(`[storage/memory] Created game ${id}, total: ${memoryGames.size}`)
  }

  return game
}

export async function getGame(gameId: string): Promise<Game | null> {
  if (redis) {
    const data = await redis.get<string>(GAME_PREFIX + gameId)
    if (data) {
      console.log(`[storage/redis] Found game ${gameId}`)
      return typeof data === 'string' ? JSON.parse(data) : data as Game
    }
    console.log(`[storage/redis] Game ${gameId} not found`)
    return null
  } else {
    const game = memoryGames.get(gameId) || null
    console.log(`[storage/memory] Get game ${gameId}: ${game ? 'found' : 'not found'}, total: ${memoryGames.size}`)
    return game
  }
}

export async function saveGame(game: Game): Promise<void> {
  if (redis) {
    await redis.set(GAME_PREFIX + game.id, JSON.stringify(game), { ex: GAME_TTL })
  } else {
    memoryGames.set(game.id, game)
  }
}

export async function joinGame(gameId: string, address: string): Promise<Game | null> {
  const game = await getGame(gameId)
  if (!game) return null
  if (game.status !== 'waiting') return null
  if (address === game.white.address) return null

  game.black = { address }
  game.status = 'active'
  game.themeSeed = randomUUID().slice(0, 8)
  
  await saveGame(game)
  return game
}

export async function applyMove(gameId: string, address: string, uci: string): Promise<Game | null> {
  const game = await getGame(gameId)
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

  await saveGame(game)
  return game
}

export async function listGames(): Promise<{ games: Game[], count: number, storage: string }> {
  if (redis) {
    const keys = await redis.keys(GAME_PREFIX + '*')
    const games: Game[] = []
    for (const key of keys) {
      const data = await redis.get<string>(key)
      if (data) {
        games.push(typeof data === 'string' ? JSON.parse(data) : data as Game)
      }
    }
    return { games, count: games.length, storage: 'redis' }
  } else {
    return { 
      games: Array.from(memoryGames.values()), 
      count: memoryGames.size, 
      storage: 'memory' 
    }
  }
}

export function isUsingRedis(): boolean {
  return redis !== null
}
