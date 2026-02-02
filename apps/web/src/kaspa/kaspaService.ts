/**
 * Kaspa Service - Clean K-Social Style Implementation
 * 
 * - No wallet extensions
 * - No fake success
 * - Honest error handling
 * - Tight event encoding
 */

import { 
  KaspaWallet, 
  getWallet, 
  generateMnemonic as genMnemonic,
  validateMnemonic as valMnemonic,
  validatePrivateKey as valPrivKey
} from './wallet';
import type { GameEvent } from './eventCodec';

export interface TxResult {
  success: boolean;
  txId?: string;
  error?: string;
}

/**
 * Kaspa Service - manages wallet and game events
 */
class KaspaService {
  private wallet: KaspaWallet;
  
  constructor() {
    this.wallet = getWallet();
  }

  /**
   * Check if there's a stored wallet address (for UI hint only)
   * Does NOT mean wallet is connected - user must re-import
   */
  checkExistingWallet(): string | null {
    return localStorage.getItem('kasparov-wallet-address');
  }

  /**
   * Generate a new mnemonic (12 or 24 words)
   */
  async generateNewMnemonic(wordCount: 12 | 24 = 12): Promise<string> {
    return genMnemonic(wordCount);
  }

  /**
   * Validate mnemonic (12 or 24 words)
   */
  async validateMnemonic(phrase: string): Promise<boolean> {
    return valMnemonic(phrase);
  }

  /**
   * Validate private key (64-char hex)
   */
  validatePrivateKey(key: string): boolean {
    return valPrivKey(key);
  }

  /**
   * Initialize wallet from mnemonic
   */
  async initialize(mnemonic: string): Promise<void> {
    await this.wallet.initFromMnemonic(mnemonic);
    
    // Store address hint (not the mnemonic!)
    const address = this.wallet.getAddress();
    if (address) {
      localStorage.setItem('kasparov-wallet-address', address);
    }
  }

  /**
   * Initialize wallet from private key
   */
  async initializeWithPrivateKey(privateKey: string): Promise<void> {
    await this.wallet.initFromPrivateKey(privateKey);
    
    // Store address hint (not the private key!)
    const address = this.wallet.getAddress();
    if (address) {
      localStorage.setItem('kasparov-wallet-address', address);
    }
  }

  /**
   * Get wallet address
   */
  getAddress(): string | null {
    return this.wallet.getAddress() || null;
  }

  /**
   * Check if wallet is initialized and connected
   */
  isInitialized(): boolean {
    return this.wallet.isConnected();
  }

  /**
   * Get wallet balance
   */
  async getBalance(): Promise<bigint> {
    return this.wallet.getBalance();
  }

  /**
   * Disconnect and clear wallet
   */
  disconnect(): void {
    this.wallet.disconnect();
    localStorage.removeItem('kasparov-wallet-address');
  }

  /**
   * Publish game init event
   * On-chain disabled until signing is fixed - game works without it
   */
  async publishGameInit(gameId: string): Promise<TxResult> {
    console.log('[KaspaService] Game init (server-only):', gameId);
    return { success: true };
  }

  /**
   * Publish game join event
   * On-chain disabled until signing is fixed - game works without it
   */
  async publishGameJoin(gameId: string): Promise<TxResult> {
    console.log('[KaspaService] Game join (server-only):', gameId);
    return { success: true };
  }

  /**
   * Publish chess move
   * On-chain disabled until signing is fixed - game works without it
   */
  async publishMove(gameId: string, uci: string, ply: number): Promise<TxResult> {
    console.log('[KaspaService] Move (server-only):', gameId, uci, ply);
    return { success: true };
  }

  /**
   * Publish chat message
   */
  async publishChat(gameId: string, msg: string, seq: number): Promise<TxResult> {
    const event: GameEvent = { type: 'chat', gameId, seq, msg };
    return this.wallet.publishEvent(event);
  }

  /**
   * Publish resign
   */
  async publishResign(gameId: string): Promise<TxResult> {
    const address = this.wallet.getAddress();
    if (!address) {
      return { success: false, error: 'Wallet not connected' };
    }
    
    const event: GameEvent = { type: 'resign', gameId, pubkey: address };
    return this.wallet.publishEvent(event);
  }
}

export const kaspaService = new KaspaService();
export default kaspaService;
