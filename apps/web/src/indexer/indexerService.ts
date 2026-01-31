/**
 * Indexer service - reads game state from DAG
 * 
 * In production, this would connect to:
 * - kasia-indexer (forked/extended)
 * - or custom indexer service
 * 
 * For now: mock local state
 */

export interface IndexedGame {
  gameId: string;
  whitePub: string;
  blackPub: string | null;
  moves: string[];
  status: "lobby" | "active" | "ended";
  createdAt: number;
}

export interface IndexedEvent {
  txId: string;
  type: "game-init" | "game-join" | "move" | "chat";
  gameId: string;
  timestamp: number;
  data: any;
}

/**
 * Mock indexer for development
 * In production: connect to actual indexer API
 */
class MockIndexer {
  private games: Map<string, IndexedGame> = new Map();
  private events: Map<string, IndexedEvent[]> = new Map();

  async getGame(gameId: string): Promise<IndexedGame | null> {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 100));
    
    return this.games.get(gameId) || null;
  }

  async getGameEvents(gameId: string): Promise<IndexedEvent[]> {
    await new Promise(resolve => setTimeout(resolve, 100));
    
    return this.events.get(gameId) || [];
  }

  async indexEvent(event: IndexedEvent): Promise<void> {
    const { gameId } = event;
    
    // Update game state
    let game = this.games.get(gameId);
    
    if (event.type === "game-init") {
      game = {
        gameId,
        whitePub: event.data.whitePub,
        blackPub: null,
        moves: [],
        status: "lobby",
        createdAt: event.timestamp,
      };
      this.games.set(gameId, game);
    } else if (event.type === "game-join" && game) {
      game.blackPub = event.data.blackPub;
      game.status = "active";
    } else if (event.type === "move" && game) {
      game.moves.push(event.data.uci);
    }
    
    // Store event
    const gameEvents = this.events.get(gameId) || [];
    gameEvents.push(event);
    this.events.set(gameId, gameEvents);
  }

  async listGames(): Promise<IndexedGame[]> {
    await new Promise(resolve => setTimeout(resolve, 100));
    
    return Array.from(this.games.values());
  }
}

/**
 * Indexer service singleton
 */
class IndexerService {
  private indexer: MockIndexer;
  private pollInterval: number | null = null;

  constructor() {
    this.indexer = new MockIndexer();
  }

  async getGame(gameId: string): Promise<IndexedGame | null> {
    return this.indexer.getGame(gameId);
  }

  async getGameEvents(gameId: string): Promise<IndexedEvent[]> {
    return this.indexer.getGameEvents(gameId);
  }

  async listGames(): Promise<IndexedGame[]> {
    return this.indexer.listGames();
  }

  /**
   * Start polling for game updates
   */
  startPolling(gameId: string, onUpdate: (game: IndexedGame) => void): void {
    if (this.pollInterval) {
      this.stopPolling();
    }

    const poll = async () => {
      const game = await this.getGame(gameId);
      if (game) {
        onUpdate(game);
      }
    };

    // Initial poll
    poll();

    // Poll every 2 seconds
    this.pollInterval = window.setInterval(poll, 2000);
  }

  stopPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  /**
   * Mock: simulate indexing our own published events
   */
  async mockIndexEvent(event: Omit<IndexedEvent, "txId">): Promise<void> {
    const indexedEvent: IndexedEvent = {
      ...event,
      txId: "mock-tx-" + Date.now(),
    };
    
    await this.indexer.indexEvent(indexedEvent);
  }
}

// Export singleton
export const indexerService = new IndexerService();

export default indexerService;
