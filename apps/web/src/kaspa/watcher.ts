/**
 * Kasparov Chess Transaction Watcher
 *
 * Polls Kas.fyi API for transactions to game sink addresses
 * Parses payloads and updates game state (Tier 1 MVP)
 *
 * Follows K-Social/Kasia pattern: indexer detects txs, parses payload, builds state
 */

import { decodeMovePayload, isValidPayload } from '../kaspa/payload';

export interface GameState {
  id: string;
  sinkAddress: string;
  createdAt: Date;
  status: 'waiting' | 'playing' | 'finished';
  lastTxid: string;
  moveNumber: number;
  fen: string;
  whiteAddress?: string;
  blackAddress?: string;
}

export interface MoveRecord {
  gameId: string;
  ply: number;
  txid: string;
  uci: string;
  payloadHash: string;
  createdAt: Date;
}

// In-memory storage (replace with DB in production)
const games = new Map<string, GameState>();
const moves = new Map<string, MoveRecord[]>(); // gameId -> moves
const processedTxs = new Set<string>(); // Prevent double processing

// Kas.fyi API configuration
const KAS_FYI_BASE = 'https://api.kas.fyi/v1';

// Chess engine for move validation (simplified)
class SimpleChessEngine {
  private board: string[][] = [
    ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'],
    ['p', 'p', 'p', 'p', 'p', 'p', 'p', 'p'],
    [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
    [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
    [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
    [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
    ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'],
    ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R']
  ];

  private toMove: 'white' | 'black' = 'white';
  private moveCount = 0;

  getFen(): string {
    // Simplified FEN generation
    return `${this.board.map(row => row.join('').replace(/ +/g, (m: string) => m.length.toString())).join('/')} ${this.toMove === 'white' ? 'w' : 'b'} - - 0 ${this.moveCount}`;
  }

  isValidMove(uci: string): boolean {
    // Very basic validation - in production use a proper chess engine
    if (uci.length < 4 || uci.length > 5) return false;

    const fromFile = uci.charCodeAt(0) - 'a'.charCodeAt(0);
    const fromRank = 8 - parseInt(uci[1]);
    const toFile = uci.charCodeAt(2) - 'a'.charCodeAt(0);
    const toRank = 8 - parseInt(uci[3]);

    if (fromFile < 0 || fromFile > 7 || fromRank < 0 || fromRank > 7) return false;
    if (toFile < 0 || toFile > 7 || toRank < 0 || toRank > 7) return false;

    const piece = this.board[fromRank][fromFile];
    if (piece === ' ') return false;

    // Check piece color matches turn
    const isWhitePiece = piece === piece.toUpperCase();
    if ((this.toMove === 'white' && !isWhitePiece) || (this.toMove === 'black' && isWhitePiece)) {
      return false;
    }

    // Basic destination check
    const destPiece = this.board[toRank][toFile];
    if (destPiece !== ' ') {
      const isDestWhite = destPiece === destPiece.toUpperCase();
      if ((isWhitePiece && isDestWhite) || (!isWhitePiece && !isDestWhite)) {
        return false; // Can't capture own piece
      }
    }

    return true;
  }

  makeMove(uci: string): boolean {
    if (!this.isValidMove(uci)) return false;

    const fromFile = uci.charCodeAt(0) - 'a'.charCodeAt(0);
    const fromRank = 8 - parseInt(uci[1]);
    const toFile = uci.charCodeAt(2) - 'a'.charCodeAt(0);
    const toRank = 8 - parseInt(uci[3]);

    // Make the move
    this.board[toRank][toFile] = this.board[fromRank][fromFile];
    this.board[fromRank][fromFile] = ' ';

    // Handle promotion (simplified)
    if (uci.length === 5) {
      const promoteTo = uci[4].toUpperCase();
      if (this.toMove === 'white' && toRank === 0) {
        this.board[toRank][toFile] = promoteTo;
      } else if (this.toMove === 'black' && toRank === 7) {
        this.board[toRank][toFile] = promoteTo.toLowerCase();
      }
    }

    this.toMove = this.toMove === 'white' ? 'black' : 'white';
    if (this.toMove === 'white') this.moveCount++;

    return true;
  }

  clone(): SimpleChessEngine {
    const engine = new SimpleChessEngine();
    engine.board = this.board.map(row => [...row]);
    engine.toMove = this.toMove;
    engine.moveCount = this.moveCount;
    return engine;
  }
}

/**
 * Fetch transactions for an address from Kas.fyi API
 */
async function fetchAddressTransactions(address: string, cursor?: string): Promise<any> {
  const url = new URL(`${KAS_FYI_BASE}/addresses/${address}/transactions`);
  url.searchParams.set('include_payload', 'true');
  if (cursor) {
    url.searchParams.set('cursor', cursor);
  }

  console.log('[Watcher] Fetching transactions for', address, cursor ? `from cursor ${cursor}` : '');

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Kas.fyi API error: ${response.status}`);
  }

  return response.json();
}

/**
 * Process a single transaction
 */
async function processTransaction(tx: any, sinkAddress: string): Promise<void> {
  const txid = tx.transaction_id || tx.id;
  if (processedTxs.has(txid)) {
    return; // Already processed
  }

  console.log('[Watcher] Processing tx:', txid);

  // Check if transaction pays to our sink address
  const outputs = tx.outputs || [];
  let paymentAmount = 0;

  for (const output of outputs) {
    if (output.script_public_key_address === sinkAddress) {
      paymentAmount += parseInt(output.amount || 0);
    }
  }

  if (paymentAmount === 0) {
    console.log('[Watcher] Tx', txid, 'does not pay to sink address');
    return;
  }

  // Check payload
  const payloadHex = tx.payload;
  if (!payloadHex) {
    console.log('[Watcher] Tx', txid, 'has no payload');
    return;
  }

  try {
    const payloadBytes = Buffer.from(payloadHex, 'hex');
    const parsed = decodeMovePayload(payloadBytes);

    if (!parsed) {
      console.log('[Watcher] Tx', txid, 'has invalid payload');
      return;
    }

    console.log('[Watcher] Valid payload:', parsed);

    // Find the game
    const game = games.get(parsed.gameId);
    if (!game) {
      console.log('[Watcher] Game not found:', parsed.gameId);
      return;
    }

    // Validate sequence
    if (parsed.prevTxid !== game.lastTxid) {
      console.log('[Watcher] Invalid sequence - expected prevTxid:', game.lastTxid, 'got:', parsed.prevTxid);
      return;
    }

    if (parsed.ply !== game.moveNumber) {
      console.log('[Watcher] Invalid ply - expected:', game.moveNumber, 'got:', parsed.ply);
      return;
    }

    // Validate move legality
    const engine = new SimpleChessEngine();
    // TODO: Replay all previous moves to get to current position
    // For now, just check if move looks valid
    if (!engine.isValidMove(parsed.uci)) {
      console.log('[Watcher] Invalid move:', parsed.uci);
      return;
    }

    // Accept the move
    console.log('[Watcher] Accepting move:', parsed.uci, 'for game:', parsed.gameId);

    // Update game state
    game.lastTxid = txid;
    game.moveNumber = parsed.ply + 1;
    // TODO: Update FEN by replaying moves

    // Record the move
    const moveRecord: MoveRecord = {
      gameId: parsed.gameId,
      ply: parsed.ply,
      txid,
      uci: parsed.uci,
      payloadHash: Buffer.from(payloadBytes).toString('hex'),
      createdAt: new Date(),
    };

    const gameMoves = moves.get(parsed.gameId) || [];
    gameMoves.push(moveRecord);
    moves.set(parsed.gameId, gameMoves);

    processedTxs.add(txid);

    console.log('[Watcher] Move accepted and recorded');

  } catch (error) {
    console.error('[Watcher] Error processing tx', txid, ':', error);
  }
}

/**
 * Watch a specific game for new moves
 */
export async function watchGame(gameId: string): Promise<void> {
  const game = games.get(gameId);
  if (!game) {
    throw new Error(`Game ${gameId} not found`);
  }

  console.log('[Watcher] Starting to watch game:', gameId, 'sink:', game.sinkAddress);

  let cursor: string | undefined;

  // Watch loop
  while (true) {
    try {
      const response = await fetchAddressTransactions(game.sinkAddress, cursor);

      const txs = response.transactions || [];
      console.log('[Watcher] Found', txs.length, 'transactions for game', gameId);

      for (const tx of txs) {
        await processTransaction(tx, game.sinkAddress);
      }

      // Update cursor for next poll
      cursor = response.cursor;

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, 2000)); // 2 seconds

    } catch (error) {
      console.error('[Watcher] Error watching game', gameId, ':', error);
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait longer on error
    }
  }
}

/**
 * Create a new game
 */
export function createGame(sinkAddress: string): string {
  const gameId = generateGameId();
  const game: GameState = {
    id: gameId,
    sinkAddress,
    createdAt: new Date(),
    status: 'waiting',
    lastTxid: '0'.repeat(64), // 32 bytes of zeros
    moveNumber: 0,
    fen: new SimpleChessEngine().getFen(),
  };

  games.set(gameId, game);
  moves.set(gameId, []);

  console.log('[Watcher] Created game:', gameId, 'with sink:', sinkAddress);
  return gameId;
}

/**
 * Get game state
 */
export function getGame(gameId: string): GameState | null {
  return games.get(gameId) || null;
}

/**
 * Get moves for a game
 */
export function getGameMoves(gameId: string): MoveRecord[] {
  return moves.get(gameId) || [];
}

/**
 * Generate a random game ID (16 bytes)
 */
function generateGameId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Start watching all active games
 */
export async function startWatcher(): Promise<void> {
  console.log('[Watcher] Starting watcher for', games.size, 'games');

  const watchPromises = Array.from(games.keys()).map(gameId => watchGame(gameId));

  await Promise.all(watchPromises);
}