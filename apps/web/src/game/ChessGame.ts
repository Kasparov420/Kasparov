/**
 * Chess game state manager using chess.js
 * Handles: legal moves, move validation, suggestions, game state
 */

import { Chess, type Square, type Move, type Color } from "chess.js";

export interface GameState {
  gameId: string;
  createdAt: number;
  whitePub: string;
  blackPub: string | null;
  myColor: Color;
  fen: string;
  moves: string[]; // UCI format
  turn: Color;
  status: "lobby" | "active" | "ended";
  themeSeed: string;
  selectedSquare: Square | null;
  legalMoves: Move[];
  lastMove?: { from: Square; to: Square };
  lastTxid?: string; // Track last move's txid for payload chaining
}

export class ChessGame {
  private chess: Chess;
  private state: GameState;

  constructor(initialState?: Partial<GameState>) {
    this.chess = new Chess();
    
    this.state = {
      gameId: initialState?.gameId || this.generateGameId(),
      createdAt: initialState?.createdAt || Date.now(),
      whitePub: initialState?.whitePub || "",
      blackPub: initialState?.blackPub || null,
      myColor: initialState?.myColor || "w",
      fen: initialState?.fen || this.chess.fen(),
      moves: initialState?.moves || [],
      turn: "w",
      status: initialState?.status || "lobby",
      themeSeed: initialState?.themeSeed || this.generateThemeSeed(),
      selectedSquare: null,
      legalMoves: [],
      lastMove: initialState?.lastMove,
      lastTxid: initialState?.lastTxid || '0'.repeat(64), // 32 bytes of zeros for first move
    };

    if (initialState?.fen) {
      this.chess.load(initialState.fen);
    }
    
    if (initialState?.moves) {
      this.applyMoves(initialState.moves);
    }
  }

  private generateGameId(): string {
    return Math.random().toString(36).substring(2, 10);
  }

  private generateThemeSeed(): string {
    return Math.random().toString(36).substring(2, 10);
  }

  getState(): GameState {
    return { ...this.state };
  }

  /**
   * Get the underlying chess.js instance
   */
  getChess(): Chess {
    return this.chess;
  }

  /**
   * Load a FEN position (for syncing with server)
   */
  loadFEN(fen: string): void {
    this.chess.load(fen);
    this.state.fen = fen;
    this.state.turn = this.chess.turn();
    this.state.selectedSquare = null;
    this.state.legalMoves = [];
  }

  /**
   * Get legal moves for a specific square
   */
  getLegalMovesForSquare(square: Square): Move[] {
    const moves = this.chess.moves({ square, verbose: true });
    return moves;
  }

  /**
   * Handle square click - select piece or move
   */
  handleSquareClick(square: Square): { 
    action: "select" | "move" | "deselect" | "invalid";
    updatedState?: Partial<GameState>;
    move?: Move;
  } {
    const piece = this.chess.get(square);
    const { selectedSquare, myColor, turn } = this.state;

    // Not my turn
    if (turn !== myColor) {
      return { action: "invalid" };
    }

    // No square selected yet
    if (!selectedSquare) {
      // Clicked on my piece
      if (piece && piece.color === myColor) {
        const legalMoves = this.getLegalMovesForSquare(square);
        if (legalMoves.length > 0) {
          return {
            action: "select",
            updatedState: {
              selectedSquare: square,
              legalMoves,
            },
          };
        }
      }
      return { action: "invalid" };
    }

    // Square already selected
    // Clicked same square - deselect
    if (square === selectedSquare) {
      return {
        action: "deselect",
        updatedState: {
          selectedSquare: null,
          legalMoves: [],
        },
      };
    }

    // Clicked different square with my piece - change selection
    if (piece && piece.color === myColor) {
      const legalMoves = this.getLegalMovesForSquare(square);
      if (legalMoves.length > 0) {
        return {
          action: "select",
          updatedState: {
            selectedSquare: square,
            legalMoves,
          },
        };
      }
    }

    // Try to make a move
    const move = this.chess.move({
      from: selectedSquare,
      to: square,
    });

    if (move) {
      const uci = this.moveToUci(move);
      return {
        action: "move",
        move,
        updatedState: {
          selectedSquare: null,
          legalMoves: [],
          fen: this.chess.fen(),
          turn: this.chess.turn(),
          moves: [...this.state.moves, uci],
          lastMove: { from: move.from as Square, to: move.to as Square },
        },
      };
    }

    return { action: "invalid" };
  }

  /**
   * Handle promotion
   */
  handlePromotion(from: Square, to: Square, promotion: "q" | "r" | "b" | "n"): Move | null {
    const move = this.chess.move({ from, to, promotion });
    if (move) {
      const uci = this.moveToUci(move);
      this.state = {
        ...this.state,
        fen: this.chess.fen(),
        turn: this.chess.turn(),
        moves: [...this.state.moves, uci],
        lastMove: { from: move.from as Square, to: move.to as Square },
        selectedSquare: null,
        legalMoves: [],
      };
    }
    return move;
  }

  /**
   * Check if move to square is legal from current selection
   */
  isLegalDestination(square: Square): boolean {
    return this.state.legalMoves.some((m) => m.to === square);
  }

  /**
   * Apply a move from UCI string
   */
  applyMove(uci: string): boolean {
    const from = uci.substring(0, 2) as Square;
    const to = uci.substring(2, 4) as Square;
    const promotion = uci.length > 4 ? (uci[4] as "q" | "r" | "b" | "n") : undefined;

    const move = this.chess.move({ from, to, promotion });
    if (move) {
      this.state = {
        ...this.state,
        fen: this.chess.fen(),
        turn: this.chess.turn(),
        moves: [...this.state.moves, uci],
        lastMove: { from, to },
      };
      return true;
    }
    return false;
  }

  /**
   * Try to make a move (for drag and drop)
   */
  tryMove(from: Square, to: Square): boolean {
    if (this.state.turn !== this.state.myColor) return false;
    
    const move = this.chess.move({ from, to, promotion: 'q' }); // Auto-queen for now
    if (!move) return false;

    const uci = this.moveToUci(move);
    this.state = {
      ...this.state,
      selectedSquare: null,
      legalMoves: [],
      fen: this.chess.fen(),
      turn: this.chess.turn(),
      moves: [...this.state.moves, uci],
      lastMove: { from, to },
    };
    return true;
  }

  /**
   * Force a move (skip turn check for debugging)
   */
  tryMoveForce(from: Square, to: Square): boolean {
    const move = this.chess.move({ from, to, promotion: 'q' }); // Auto-queen for now
    if (!move) return false;

    const uci = this.moveToUci(move);
    this.state = {
      ...this.state,
      selectedSquare: null,
      legalMoves: [],
      fen: this.chess.fen(),
      turn: this.chess.turn(),
      moves: [...this.state.moves, uci],
      lastMove: { from, to },
    };
    return true;
  }

  /**
   * Apply multiple moves
   */
  private applyMoves(moves: string[]): void {
    for (const uci of moves) {
      this.applyMove(uci);
    }
  }

  /**
   * Convert chess.js Move to UCI format
   */
  private moveToUci(move: Move): string {
    let uci = move.from + move.to;
    if (move.promotion) {
      uci += move.promotion;
    }
    return uci;
  }

  /**
   * Get board orientation based on player color
   */
  getBoardOrientation(): "white" | "black" {
    return this.state.myColor === "b" ? "black" : "white";
  }

  /**
   * Check if game is over
   */
  isGameOver(): { over: boolean; result?: string } {
    if (this.chess.isGameOver()) {
      let result = "draw";
      if (this.chess.isCheckmate()) {
        result = this.chess.turn() === "w" ? "0-1" : "1-0";
      }
      return { over: true, result };
    }
    return { over: false };
  }

  /**
   * Update state externally (from network)
   */
  updateState(updates: Partial<GameState>): void {
    this.state = { ...this.state, ...updates };
    if (updates.fen) {
      this.chess.load(updates.fen);
    }
  }
}

export default ChessGame;
