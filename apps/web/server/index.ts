import express from 'express'
import cors from 'cors'
import { WebSocketServer } from 'ws'
import { randomUUID } from 'crypto'
import { Chess } from 'chess.js'
import http from 'http'

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

const PORT = Number(process.env.PORT || 8787)
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*'

const app = express()
app.use(express.json({ limit: '1mb' }))
app.use(cors({ origin: CORS_ORIGIN === '*' ? true : CORS_ORIGIN }))

const games = new Map<string, Game>()
const clientsByGame = new Map<string, Set<WebSocket>>()

function broadcast(game: Game) {
  const set = clientsByGame.get(game.id)
  if (!set) return
  const msg = JSON.stringify({ type: 'game', game })
  for (const ws of set) {
    if (ws.readyState === ws.OPEN) ws.send(msg)
  }
}

app.get('/api/health', (_req, res) => res.json({ ok: true }))

app.post('/api/games', (req, res) => {
  const { address } = req.body || {}
  if (!address || typeof address !== 'string') {
    return res.status(400).json({ error: 'missing address' })
  }

  const chess = new Chess()
  const id = randomUUID().slice(0, 12)

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
  res.json({ game })
})

app.post('/api/games/:id/join', (req, res) => {
  const { address } = req.body || {}
  const game = games.get(req.params.id)
  if (!game) return res.status(404).json({ error: 'not found' })
  if (game.status !== 'waiting') return res.status(400).json({ error: 'game not joinable' })
  if (!address || typeof address !== 'string') return res.status(400).json({ error: 'missing address' })
  if (address === game.white.address) return res.status(400).json({ error: 'cannot join your own game' })

  game.black = { address }
  game.status = 'active'
  game.themeSeed = randomUUID().slice(0, 8)

  games.set(game.id, game)
  broadcast(game)
  res.json({ game })
})

app.get('/api/games/:id', (req, res) => {
  const game = games.get(req.params.id)
  if (!game) return res.status(404).json({ error: 'not found' })
  res.json({ game })
})

// List games (with optional waiting filter)
app.get('/api/games', (req, res) => {
  const waitingOnly = req.query.waiting === 'true'
  let gamesList = Array.from(games.values())
  
  if (waitingOnly) {
    gamesList = gamesList
      .filter(g => g.status === 'waiting')
      .sort((a, b) => b.createdAt - a.createdAt) // newest first
  }
  
  res.json({ games: gamesList, count: gamesList.length })
})

app.post('/api/games/:id/move', (req, res) => {
  const { address, uci } = req.body || {}
  const game = games.get(req.params.id)
  if (!game) return res.status(404).json({ error: 'not found' })
  if (game.status !== 'active') return res.status(400).json({ error: 'game not active' })

  if (!address || !uci) return res.status(400).json({ error: 'missing address/uci' })

  const expected =
    game.turn === 'w' ? game.white.address : game.black?.address

  if (!expected) return res.status(400).json({ error: 'missing opponent' })
  if (address !== expected) return res.status(403).json({ error: 'not your turn' })

  const chess = new Chess(game.fen)
  const from = uci.slice(0, 2)
  const to = uci.slice(2, 4)
  const promotion = uci.length > 4 ? uci.slice(4, 5) : undefined

  const move = chess.move({ from, to, promotion: promotion as any })
  if (!move) return res.status(400).json({ error: 'illegal move' })

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

  games.set(game.id, game)
  broadcast(game)
  res.json({ game })
})

const server = http.createServer(app)
const wss = new WebSocketServer({ server, path: '/ws' })

wss.on('connection', (ws, req) => {
  const url = new URL(req.url || '', 'http://localhost')
  const gameId = url.searchParams.get('game')
  if (!gameId) { ws.close(); return }
  if (!clientsByGame.has(gameId)) clientsByGame.set(gameId, new Set())
  clientsByGame.get(gameId)!.add(ws as any)

  const game = games.get(gameId)
  if (game) ws.send(JSON.stringify({ type: 'game', game }))

  ws.on('close', () => {
    clientsByGame.get(gameId)?.delete(ws as any)
  })
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[server] http://0.0.0.0:${PORT}`)
  console.log(`[server] ws://0.0.0.0:${PORT}/ws?game=...`)
})
