export type Game = {
  id: string
  createdAt: number
  status: 'LOBBY'|'ACTIVE'|'ENDED'
  stakeSompi?: string
  allowStakes: boolean
  timeControl?: 'blitz'|'10min'|'rapid'|'classical'
  initialMs?: number
  incrementMs?: number
  whiteMs?: number
  blackMs?: number
  lastMoveAt?: number
  whiteName: string
  whiteWallet?: string
  blackName?: string
  blackWallet?: string
  turn: 'w'|'b'
  fen: string
  lastMoveTxid?: string
  moves: Array<{ ply: number; uci: string; txid: string; txids?: string[]; at: number }>
  result?: { type: 'WHITE'|'BLACK'|'DRAW'|'ABORT'; reason: string }
}

async function j<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers || {}) } })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export const api = {
  createGame: (body: { whiteName: string; whiteWallet?: string; allowStakes: boolean; stakeSompi?: string }) =>
    j<{ game: Game }>('/api/games', { method: 'POST', body: JSON.stringify(body) }),
  joinGame: (id: string, body: { blackName: string; blackWallet?: string }) =>
    j<{ game: Game }>(`/api/games/${id}/join`, { method: 'POST', body: JSON.stringify(body) }),
  getGame: (id: string) => j<{ game: Game }>(`/api/games/${id}`),
  move: (id: string, body: { uci: string; prevTxid?: string; walletTxid?: string }) =>
    j<{ game: Game }>(`/api/games/${id}/move`, { method: 'POST', body: JSON.stringify(body) }),
  resign: (id: string) => j<{ game: Game }>(`/api/games/${id}/resign`, { method: 'POST' }),
  offerDraw: (id: string) => j<{ game: Game }>(`/api/games/${id}/offer-draw`, { method: 'POST' }),
  acceptDraw: (id: string) => j<{ game: Game }>(`/api/games/${id}/accept-draw`, { method: 'POST' }),
}
