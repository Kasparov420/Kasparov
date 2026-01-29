import { Chess } from "chess.js";

export type Game = {
  id: string;
  fen: string;
  turn: "w" | "b";
  whiteName: string;
  blackName?: string;
  moves: { uci: string; txid?: string; ts: number }[];
};

const games = new Map<string, Game>();

export function createGame(whiteName: string): Game {
  const c = new Chess();
  const id = crypto.randomUUID();
  const g: Game = { id, fen: c.fen(), turn: "w", whiteName, moves: [] };
  games.set(id, g);
  return g;
}

export function joinGame(gameId: string, blackName: string): Game | null {
  const g = games.get(gameId);
  if (!g) return null;
  g.blackName = blackName;
  return g;
}

export function getGame(gameId: string): Game | null {
  return games.get(gameId) ?? null;
}

export function applyMove(gameId: string, uci: string, txid?: string): Game | null {
  const g = games.get(gameId);
  if (!g) return null;

  const c = new Chess();
  c.load(g.fen);

  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  const promo = uci.length > 4 ? uci.slice(4) : undefined;

  const mv = c.move({ from, to, promotion: promo as any });
  if (!mv) return g;

  g.fen = c.fen();
  g.turn = c.turn();
  g.moves.push({ uci, txid, ts: Date.now() });
  return g;
}
