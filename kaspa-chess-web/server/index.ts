import express from 'express'
import cors from 'cors'
import { WebSocketServer } from 'ws'
import { nanoid } from 'nanoid'
import { Chess } from 'chess.js'
import http from 'http'
import { ethers } from 'ethers'

type GameStatus = 'LOBBY' | 'ACTIVE' | 'ENDED'
type ResultType = 'WHITE' | 'BLACK' | 'DRAW' | 'ABORT'

type Move = { ply: number; uci: string; txid: string; at: number }

type Game = {
  id: string
  createdAt: number
  status: GameStatus
  allowStakes: boolean
  stakeSompi?: string
  whiteName: string
  whiteWallet?: string
  blackName?: string
  blackWallet?: string
  turn: 'w'|'b'
  fen: string
  lastMoveTxid?: string
  moves: Move[]
  result?: { type: ResultType; reason: string }
  drawOffer?: { by: 'WHITE'|'BLACK'; at: number }
}

const PORT = Number(process.env.PORT || 8787)
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*'

const app = express()
app.use(express.json({ limit: '1mb' }))
app.use(cors({ origin: CORS_ORIGIN === '*' ? true : CORS_ORIGIN }))

const games = new Map<string, Game>()
const clientsByGame = new Map<string, Set<WebSocket>>()
const challenges = new Map<string, string>()
const sessions = new Map<string, string>()

function broadcast(game: Game) {
  const set = clientsByGame.get(game.id)
  if (!set) return
  const msg = JSON.stringify({ type: 'game', game })
  for (const ws of set) {
    if (ws.readyState === ws.OPEN) ws.send(msg)
  }
}

function currentTurnSide(game: Game): 'WHITE'|'BLACK' {
  return game.turn === 'w' ? 'WHITE' : 'BLACK'
}

function applyMoves(game: Game): Chess {
  const c = new Chess()
  for (const m of game.moves) {
    const from = m.uci.slice(0,2)
    const to = m.uci.slice(2,4)
    const promo = m.uci.length > 4 ? (m.uci[4] as any) : undefined
    const ok = c.move({ from, to, promotion: promo })
    if (!ok) throw new Error('stored move illegal: ' + m.uci)
  }
  return c
}

function endIfGameOver(game: Game, c: Chess) {
  if (!c.isGameOver()) return
  if (c.isCheckmate()) {
    // side to move is checkmated, so winner is opposite
    const winner = c.turn() === 'w' ? 'BLACK' : 'WHITE'
    game.status = 'ENDED'
    game.result = { type: winner, reason: 'checkmate' }
  } else if (c.isDraw() || c.isStalemate() || c.isThreefoldRepetition() || c.isInsufficientMaterial()) {
    game.status = 'ENDED'
    game.result = { type: 'DRAW', reason: 'draw' }
  } else {
    game.status = 'ENDED'
    game.result = { type: 'ABORT', reason: 'ended' }
  }
}

app.get('/api/health', (_req, res) => res.json({ ok: true }))

app.post('/api/auth/challenge', (req, res) => {
  const { address } = req.body || {}
  if (!address || typeof address !== 'string') return res.status(400).send('address required')
  const nonce = nanoid(16)
  challenges.set(address.toLowerCase(), nonce)
  res.json({ nonce })
})

app.post('/api/auth/verify', (req, res) => {
  const { address, signature } = req.body || {}
  if (!address || typeof address !== 'string') return res.status(400).send('address required')
  if (!signature || typeof signature !== 'string') return res.status(400).send('signature required')
  const expected = challenges.get(address.toLowerCase())
  if (!expected) return res.status(400).send('no challenge')
  try {
    // verify using ethers (eth-style signature)
    const recovered = ethers.verifyMessage(expected, signature)
    if (recovered.toLowerCase() === address.toLowerCase()) {
      const token = nanoid(24)
      sessions.set(token, address)
      challenges.delete(address.toLowerCase())
      res.json({ ok: true, token })
    } else {
      res.status(401).send('signature mismatch')
    }
  } catch (e) {
    res.status(400).send('invalid signature')
  }
})

app.post('/api/games', (req, res) => {
  const { whiteName, whiteWallet, allowStakes, stakeSompi } = req.body || {}
  if (!whiteName || typeof whiteName !== 'string') return res.status(400).send('whiteName required')
  if (allowStakes && (!stakeSompi || typeof stakeSompi !== 'string')) return res.status(400).send('stakeSompi required when allowStakes=true')
  if (whiteWallet && typeof whiteWallet !== 'string') return res.status(400).send('whiteWallet must be string')

  const id = nanoid(10)
  const c = new Chess()
  const game: Game = {
    id,
    createdAt: Date.now(),
    status: 'LOBBY',
    allowStakes: !!allowStakes,
    stakeSompi: allowStakes ? stakeSompi : undefined,
    whiteName,
    whiteWallet: whiteWallet || undefined,
    turn: 'w',
    fen: c.fen(),
    moves: []
  }
  games.set(id, game)
  res.json({ game })
})

app.post('/api/games/:id/join', (req, res) => {
  const game = games.get(req.params.id)
  if (!game) return res.status(404).send('game not found')
  if (game.status !== 'LOBBY') return res.status(400).send('not joinable')
  const { blackName, blackWallet } = req.body || {}
  if (!blackName || typeof blackName !== 'string') return res.status(400).send('blackName required')
  if (blackWallet && typeof blackWallet !== 'string') return res.status(400).send('blackWallet must be string')
  game.blackName = blackName
  game.blackWallet = blackWallet || undefined
  game.status = 'ACTIVE'
  broadcast(game)
  res.json({ game })
})

app.get('/api/games/:id', (req, res) => {
  const game = games.get(req.params.id)
  if (!game) return res.status(404).send('game not found')
  res.json({ game })
})

app.post('/api/games/:id/move', (req, res) => {
  const game = games.get(req.params.id)
  if (!game) return res.status(404).send('game not found')
  if (game.status !== 'ACTIVE') return res.status(400).send('game not active')
  if (game.result) return res.status(400).send('game ended')

  const { uci, prevTxid, walletTxid } = req.body || {}
  if (!uci || typeof uci !== 'string') return res.status(400).send('uci required')
  if (prevTxid && typeof prevTxid !== 'string') return res.status(400).send('prevTxid must be string')
  if (walletTxid && typeof walletTxid !== 'string') return res.status(400).send('walletTxid must be string')
  if ((game.lastMoveTxid || '') !== (prevTxid || '')) return res.status(409).send('prevTxid mismatch')

  // recompute and validate
  const c = applyMoves(game)
  const from = uci.slice(0,2)
  const to = uci.slice(2,4)
  const promo = uci.length > 4 ? (uci[4] as any) : undefined
  const ok = c.move({ from, to, promotion: promo })
  if (!ok) return res.status(400).send('illegal move')

  const ply = game.moves.length + 1
  const txid = walletTxid || ('blockchain_' + nanoid(20))
  game.moves.push({ ply, uci, txid, at: Date.now() })
  game.turn = c.turn()
  game.fen = c.fen()
  game.lastMoveTxid = txid

  endIfGameOver(game, c)

  broadcast(game)
  res.json({ game })
})

app.post('/api/games/:id/resign', (req, res) => {
  const game = games.get(req.params.id)
  if (!game) return res.status(404).send('game not found')
  if (game.status !== 'ACTIVE' || game.result) return res.status(400).send('not resignable')
  const side = currentTurnSide(game)
  const winner = side === 'WHITE' ? 'BLACK' : 'WHITE'
  game.status = 'ENDED'
  game.result = { type: winner, reason: 'resign' }
  broadcast(game)
  res.json({ game })
})

app.post('/api/games/:id/offer-draw', (req, res) => {
  const game = games.get(req.params.id)
  if (!game) return res.status(404).send('game not found')
  if (game.status !== 'ACTIVE' || game.result) return res.status(400).send('not active')
  // offer by side to move (simple)
  const by = currentTurnSide(game)
  game.drawOffer = { by, at: Date.now() }
  broadcast(game)
  res.json({ game })
})

app.post('/api/games/:id/accept-draw', (req, res) => {
  const game = games.get(req.params.id)
  if (!game) return res.status(404).send('game not found')
  if (game.status !== 'ACTIVE' || game.result) return res.status(400).send('not active')
  if (!game.drawOffer) return res.status(400).send('no draw offered')
  game.status = 'ENDED'
  game.result = { type: 'DRAW', reason: 'agreed draw' }
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
