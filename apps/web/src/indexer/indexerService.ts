/**
 * Indexer service - reads game state from API
 * 
 * Uses the Vercel API endpoints for shared game storage
 * Falls back to local mock for development
 */

// API base URL - detect environment
function API_BASE(): string {
  if (typeof window === 'undefined') return '/api';
  
  // Always use relative path in browser to leverage Vite proxy or same-origin in production
  // this avoids CORS issues and port visibility problems in Codespaces
  return '/api';
}

export interface IndexedGame {
  gameId: string;
  whitePub: string;
  blackPub: string | null;
  moves: string[];
  status: "lobby" | "active" | "ended";
  createdAt: number;
  fen?: string;
  turn?: 'w' | 'b';
}

export interface IndexedEvent {
  txId: string;
  type: "game-init" | "game-join" | "move" | "chat";
  gameId: string;
  timestamp: number;
  data: any;
}

/**
 * API-backed indexer
 * Stores games on server so they're shared across all clients
 */
class ApiIndexer {
  // Local cache for current session
  private localCache: Map<string, IndexedGame> = new Map();

  async createGame(address: string, creatorColor?: 'w' | 'b'): Promise<IndexedGame> {
    try {
      const url = `${API_BASE()}/games`;
      console.log('[API] Creating game at:', url);
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, creatorColor }),
      });
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const data = await response.json();
      const apiGame = data.game;
      
      // Convert API format to IndexedGame format
      // The server sets white.address or black.address based on random color assignment
      const game: IndexedGame = {
        gameId: apiGame.id,
        whitePub: apiGame.white?.address || '',
        blackPub: apiGame.black?.address || null,
        moves: [],
        status: apiGame.status === 'waiting' ? 'lobby' : apiGame.status === 'active' ? 'active' : 'ended',
        createdAt: apiGame.createdAt || Date.now(),
        fen: apiGame.fen,
        turn: apiGame.turn,
      };
      
      console.log('[Indexer] Created game:', game.gameId, 'whitePub:', game.whitePub, 'blackPub:', game.blackPub);
      this.localCache.set(game.gameId, game);
      return game;
    } catch (e) {
      console.error('[Indexer] API create failed:', e);
      throw e;
    }
  }

  async getGame(gameId: string): Promise<IndexedGame | null> {
    try {
      const response = await fetch(`${API_BASE()}/games/${gameId}`);
      
      if (!response.ok) {
        if (response.status === 404) {
          console.log('[Indexer] Game not found:', gameId);
          return null;
        }
        throw new Error(`API error: ${response.status}`);
      }
      
      const data = await response.json();
      const apiGame = data.game;
      
      if (!apiGame) {
        return this.localCache.get(gameId) || null;
      }
      
      // Convert API format to IndexedGame format
      const game: IndexedGame = {
        gameId: apiGame.id,
        whitePub: apiGame.white?.address || '',
        blackPub: apiGame.black?.address || null,
        moves: [],
        status: apiGame.status === 'waiting' ? 'lobby' : apiGame.status === 'active' ? 'active' : 'ended',
        createdAt: apiGame.createdAt || Date.now(),
        fen: apiGame.fen,
        turn: apiGame.turn,
      };
      
      this.localCache.set(gameId, game);
      return game;
    } catch (e) {
      console.error('[Indexer] API get failed:', e);
      // Fallback to local cache
      return this.localCache.get(gameId) || null;
    }
  }

  async joinGame(gameId: string, blackPub: string): Promise<IndexedGame | null> {
    try {
      const response = await fetch(`${API_BASE()}/games/${gameId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: blackPub }),
      });
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const data = await response.json();
      const apiGame = data.game;
      
      const game: IndexedGame = {
        gameId: apiGame.id,
        whitePub: apiGame.white?.address || '',
        blackPub: apiGame.black?.address || blackPub,
        moves: [],
        status: 'active',
        createdAt: apiGame.createdAt || Date.now(),
        fen: apiGame.fen,
        turn: apiGame.turn,
      };
      
      this.localCache.set(gameId, game);
      console.log('[Indexer] Joined game via API:', gameId);
      return game;
    } catch (e) {
      console.error('[Indexer] API join failed:', e);
      return null;
    }
  }

  async recordMove(gameId: string, address: string, uci: string, txid?: string): Promise<boolean> {
    try {
      const response = await fetch(`${API_BASE()}/games/${gameId}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, uci, txid }),
      });
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      console.log('[Indexer] Move recorded via API:', gameId, uci);
      return true;
    } catch (e) {
      console.error('[Indexer] API move failed:', e);
      return false;
    }
  }

  async listGames(): Promise<IndexedGame[]> {
    try {
      const response = await fetch(`${API_BASE()}/games`);
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const data = await response.json();
      const games = (data.games || []).map((apiGame: any) => ({
        gameId: apiGame.id,
        whitePub: apiGame.white?.address || '',
        blackPub: apiGame.black?.address || null,
        moves: [],
        status: apiGame.status === 'waiting' ? 'lobby' : apiGame.status === 'active' ? 'active' : 'ended',
        createdAt: apiGame.createdAt || Date.now(),
      }));
      
      return games;
    } catch (e) {
      console.error('[Indexer] API list failed:', e);
      return Array.from(this.localCache.values());
    }
  }

  // For mock events (transaction indexing simulation)
  async indexEvent(event: IndexedEvent): Promise<void> {
    // This is a no-op now since we use the API
    // The actual game state is managed by the API
    console.log('[Indexer] Event (for TX record):', event.type, event.gameId);
  }
}

/**
 * Indexer service singleton
 */
class IndexerService {
  private indexer: ApiIndexer;
  private pollInterval: number | null = null;

  constructor() {
    this.indexer = new ApiIndexer();
  }

  async createGame(address: string, creatorColor?: 'w' | 'b'): Promise<IndexedGame> {
    return this.indexer.createGame(address, creatorColor);
  }

  async getGame(gameId: string): Promise<IndexedGame | null> {
    return this.indexer.getGame(gameId);
  }

  async joinGame(gameId: string, blackPub: string): Promise<IndexedGame | null> {
    return this.indexer.joinGame(gameId, blackPub);
  }

  async recordMove(gameId: string, address: string, uci: string, txid?: string): Promise<boolean> {
    return this.indexer.recordMove(gameId, address, uci, txid);
  }

  async getGameEvents(gameId: string): Promise<IndexedEvent[]> {
    // Events are now tracked via blockchain transactions
    return [];
  }

  // Legacy method for compatibility - now uses API
  async mockIndexEvent(event: Omit<IndexedEvent, "txId">): Promise<void> {
    await this.indexer.indexEvent({
      ...event,
      txId: `local-${Date.now()}`,
    });
  }

  startPolling(gameId: string, callback: (game: IndexedGame) => void): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }

    this.pollInterval = window.setInterval(async () => {
      const game = await this.getGame(gameId);
      if (game) {
        callback(game);
      }
    }, 2000);
  }

  stopPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  async listGames(): Promise<IndexedGame[]> {
    return this.indexer.listGames();
  }
}

export const indexerService = new IndexerService();
export default indexerService;
