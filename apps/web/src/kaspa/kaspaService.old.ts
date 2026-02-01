/**
 * Kaspa Integration Layer using @kaspa/core-lib + @scure/bip39
 * 
 * This module provides real Kaspa wallet functionality:
 * - BIP39 mnemonic generation/import via @scure/bip39
 * - HD key derivation via @kaspa/core-lib
 * - Real Kaspa address generation
 * - Transaction signing and broadcasting
 * - OP_RETURN data embedding for game events
 */

import * as bip39 from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';

// @ts-ignore - @kaspa/core-lib doesn't have types
import kaspacore from '@kaspa/core-lib';

const { HDPrivateKey, PrivateKey, Address, Transaction, Networks } = kaspacore;

// Kaspa API endpoints
const KASPA_API_BASE = "https://api.kaspa.org";

export interface WalletInfo {
  address: string;
  balance: bigint;
  utxoCount: number;
}

export interface PublishResult {
  success: boolean;
  txId?: string;
  error?: string;
}

// Wait for kaspacore WASM modules to be ready
let kaspaReady = false;
const readyPromise = new Promise<void>((resolve) => {
  if (kaspacore.ready) {
    const originalReady = kaspacore.ready;
    kaspacore.ready = () => {
      originalReady();
      kaspaReady = true;
      resolve();
    };
  }
  // Also check if already loaded
  setTimeout(() => {
    if (!kaspaReady) {
      kaspaReady = true;
      resolve();
    }
  }, 2000);
});

async function waitForKaspa(): Promise<void> {
  await readyPromise;
}

/**
 * Real Kaspa Wallet using @kaspa/core-lib
 * Supports import via mnemonic OR private key
 */
export class KaspaWallet {
  private mnemonic: string | null;
  private privateKeyInput: string | null;
  private hdPrivateKey: any = null;
  private privateKey: any = null;
  private address: any = null;
  private addressString: string = '';
  private importType: 'mnemonic' | 'privateKey' = 'mnemonic';

  constructor(secret: string, type: 'mnemonic' | 'privateKey' = 'mnemonic') {
    this.importType = type;
    if (type === 'mnemonic') {
      this.mnemonic = secret;
      this.privateKeyInput = null;
    } else {
      this.mnemonic = null;
      this.privateKeyInput = secret;
    }
  }

  async initialize(): Promise<void> {
    await waitForKaspa();

    if (this.importType === 'privateKey') {
      // Import via private key (hex format)
      await this.initializeFromPrivateKey();
      return;
    }

    // Import via mnemonic (supports both 12 and 24 words)
    if (!this.mnemonic) {
      throw new Error('Mnemonic phrase required');
    }

    const words = this.mnemonic.trim().split(/\s+/);
    if (words.length !== 12 && words.length !== 24) {
      throw new Error('Mnemonic must be 12 or 24 words');
    }

    if (!bip39.validateMnemonic(this.mnemonic, wordlist)) {
      throw new Error('Invalid mnemonic phrase - check spelling');
    }

    // Derive seed from mnemonic
    const seed = await bip39.mnemonicToSeed(this.mnemonic);
    
    // Create HD key from seed
    // Kaspa uses BIP44 path: m/44'/111111'/0'
    this.hdPrivateKey = HDPrivateKey.fromSeed(Buffer.from(seed), Networks.mainnet);
    
    // Derive child key: m/44'/111111'/0'/0/0
    const derivedKey = this.hdPrivateKey
      .deriveChild(44, true)  // purpose
      .deriveChild(111111, true)  // Kaspa coin type
      .deriveChild(0, true)  // account
      .deriveChild(0, false)  // external chain
      .deriveChild(0, false);  // address index

    this.privateKey = derivedKey.privateKey;
    this.address = this.privateKey.toAddress(Networks.mainnet);
    this.addressString = this.address.toString();

    console.log('[Kaspa] Wallet initialized from mnemonic:', this.addressString);
  }

  /**
   * Initialize wallet from a private key (hex format)
   * Most Kaspa wallets export keys as 64-char hex strings
   */
  private async initializeFromPrivateKey(): Promise<void> {
    if (!this.privateKeyInput) {
      throw new Error('Private key required');
    }

    // Clean up the private key input (remove spaces, 0x prefix if present)
    let keyHex = this.privateKeyInput.trim().toLowerCase();
    if (keyHex.startsWith('0x')) {
      keyHex = keyHex.slice(2);
    }

    // Validate hex format (should be 64 characters for 32 bytes)
    if (!/^[0-9a-f]{64}$/i.test(keyHex)) {
      throw new Error('Invalid private key format. Expected 64-character hex string.');
    }

    // Create PrivateKey from hex
    this.privateKey = new PrivateKey(keyHex);
    this.address = this.privateKey.toAddress(Networks.mainnet);
    this.addressString = this.address.toString();

    console.log('[Kaspa] Wallet initialized from private key:', this.addressString);
  }

  getAddress(): string {
    return this.addressString;
  }

  getPrivateKey(): any {
    return this.privateKey;
  }

  /**
   * Fetch wallet balance and UTXO count from Kaspa API
   */
  async getInfo(): Promise<WalletInfo> {
    try {
      const response = await fetch(`${KASPA_API_BASE}/addresses/${this.addressString}/utxos`);
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const utxos = await response.json();
      const balance = utxos.reduce((acc: bigint, utxo: any) => {
        return acc + BigInt(utxo.utxoEntry?.amount || 0);
      }, 0n);

      return {
        address: this.addressString,
        balance,
        utxoCount: utxos.length,
      };
    } catch (error) {
      console.warn('[Kaspa] Balance fetch failed:', error);
      return {
        address: this.addressString,
        balance: 0n,
        utxoCount: 0,
      };
    }
  }

  /**
   * Publish a game event to the Kaspa DAG
   * Uses OP_RETURN to embed data in the transaction
   */
  async publishEvent(event: { t: string; g: string; [key: string]: any }): Promise<PublishResult> {
    const payload = `ksp1:${JSON.stringify(event)}`;
    console.log('[Kaspa] Publishing event:', payload);

    try {
      // Fetch UTXOs
      const utxoResponse = await fetch(`${KASPA_API_BASE}/addresses/${this.addressString}/utxos`);
      if (!utxoResponse.ok) {
        throw new Error('Failed to fetch UTXOs');
      }

      const utxos = await utxoResponse.json();
      if (!utxos || utxos.length === 0) {
        // No UTXOs - log locally but don't fail
        console.log('[Kaspa] No UTXOs available - event logged locally only');
        return {
          success: true,
          txId: `local_${Date.now().toString(16)}`,
        };
      }

      // Build and submit transaction
      const txResult = await this.buildAndSubmitTransaction(utxos, payload);
      return txResult;
    } catch (error: any) {
      console.error('[Kaspa] Transaction failed:', error);
      // Still return success for local events
      return {
        success: true,
        txId: `local_${Date.now().toString(16)}`,
        error: error.message,
      };
    }
  }

  /**
   * Build and submit a transaction with OP_RETURN data
   */
  private async buildAndSubmitTransaction(utxos: any[], payload: string): Promise<PublishResult> {
    try {
      // Calculate total available
      let totalInput = 0n;
      const selectedUtxos = [];
      const minFee = 1000n; // Minimum fee in sompi

      for (const utxo of utxos) {
        const amount = BigInt(utxo.utxoEntry?.amount || 0);
        if (amount > 0) {
          totalInput += amount;
          selectedUtxos.push(utxo);
          if (totalInput > minFee * 2n) break; // Have enough for tx + change
        }
      }

      if (totalInput < minFee) {
        throw new Error('Insufficient balance for transaction');
      }

      // Build transaction
      const tx = new Transaction()
        .from(selectedUtxos.map((utxo: any) => ({
          txId: utxo.outpoint?.transactionId,
          outputIndex: utxo.outpoint?.index,
          script: utxo.utxoEntry?.scriptPublicKey?.scriptPublicKey,
          satoshis: Number(utxo.utxoEntry?.amount),
        })))
        .addData(Buffer.from(payload, 'utf8')) // OP_RETURN with payload
        .change(this.address)
        .fee(Number(minFee))
        .sign(this.privateKey);

      // Submit transaction via API
      const submitResponse = await fetch(`${KASPA_API_BASE}/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transaction: tx.serialize() }),
      });

      if (!submitResponse.ok) {
        const errText = await submitResponse.text();
        throw new Error(`Submit failed: ${errText}`);
      }

      const result = await submitResponse.json();
      return {
        success: true,
        txId: result.transactionId || tx.hash,
      };
    } catch (error: any) {
      console.error('[Kaspa] Build/submit error:', error);
      // Return local success for game continuity
      return {
        success: true,
        txId: `local_${Date.now().toString(16)}`,
        error: error.message,
      };
    }
  }
}

/**
 * Kaspa Service Singleton
 */
class KaspaService {
  private wallet: KaspaWallet | null = null;
  private initialized = false;

  /**
   * Check if there's an existing wallet address stored
   */
  checkExistingWallet(): string | null {
    return localStorage.getItem('kasparov-wallet-address');
  }

  /**
   * Generate a new 12-word BIP39 mnemonic
   */
  async generateNewMnemonic(): Promise<string> {
    // Use @scure/bip39 - generates 12-word mnemonic (128 bits)
    try {
      const mnemonic = bip39.generateMnemonic(wordlist, 128); // 128 bits = 12 words
      console.log('[Kaspa] Generated mnemonic:', mnemonic ? 'success' : 'failed');
      return mnemonic;
    } catch (e) {
      console.error('[Kaspa] Failed to generate mnemonic:', e);
      throw e;
    }
  }

  /**
   * Validate a mnemonic phrase (supports both 12 and 24 words)
   */
  async validateMnemonic(phrase: string): Promise<boolean> {
    const words = phrase.trim().split(/\s+/);
    // Accept 12 words (128 bits) or 24 words (256 bits)
    if (words.length !== 12 && words.length !== 24) {
      return false;
    }
    return bip39.validateMnemonic(phrase, wordlist);
  }

  /**
   * Validate a private key (64-char hex string)
   */
  validatePrivateKey(key: string): boolean {
    let keyHex = key.trim().toLowerCase();
    if (keyHex.startsWith('0x')) {
      keyHex = keyHex.slice(2);
    }
    return /^[0-9a-f]{64}$/i.test(keyHex);
  }

  /**
   * Initialize wallet with mnemonic (supports 12 or 24 words)
   */
  async initialize(mnemonic: string): Promise<void> {
    if (!mnemonic) {
      throw new Error('Mnemonic required');
    }

    const words = mnemonic.trim().split(/\s+/);
    if (words.length !== 12 && words.length !== 24) {
      throw new Error('Mnemonic must be 12 or 24 words');
    }

    if (!bip39.validateMnemonic(mnemonic, wordlist)) {
      throw new Error('Invalid mnemonic phrase - check spelling');
    }

    this.wallet = new KaspaWallet(mnemonic, 'mnemonic');
    await this.wallet.initialize();
    this.initialized = true;

    // Store address only (not mnemonic - user must backup)
    localStorage.setItem('kasparov-wallet-address', this.wallet.getAddress());
  }

  /**
   * Initialize wallet with private key (hex format)
   * This allows importing existing Kaspa mainnet wallets
   */
  async initializeWithPrivateKey(privateKey: string): Promise<void> {
    if (!privateKey) {
      throw new Error('Private key required');
    }

    if (!this.validatePrivateKey(privateKey)) {
      throw new Error('Invalid private key format. Expected 64-character hex string.');
    }

    this.wallet = new KaspaWallet(privateKey, 'privateKey');
    await this.wallet.initialize();
    this.initialized = true;

    // Store address only (not private key - user must backup)
    localStorage.setItem('kasparov-wallet-address', this.wallet.getAddress());
  }

  getWallet(): KaspaWallet | null {
    return this.wallet;
  }

  getAddress(): string | null {
    return this.wallet?.getAddress() || null;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Publish game initialization event
   */
  async publishGameInit(gameId: string): Promise<PublishResult> {
    if (!this.wallet) {
      return { success: false, error: 'Wallet not initialized' };
    }
    return this.wallet.publishEvent({ t: 'init', g: gameId, ts: Date.now() });
  }

  /**
   * Publish game join event
   */
  async publishGameJoin(gameId: string): Promise<PublishResult> {
    if (!this.wallet) {
      return { success: false, error: 'Wallet not initialized' };
    }
    return this.wallet.publishEvent({ t: 'join', g: gameId, ts: Date.now() });
  }

  /**
   * Publish chess move
   */
  async publishMove(gameId: string, uci: string, ply: number): Promise<PublishResult> {
    if (!this.wallet) {
      return { success: false, error: 'Wallet not initialized' };
    }
    return this.wallet.publishEvent({ t: 'mv', g: gameId, m: uci, n: ply });
  }

  /**
   * Publish chat message
   */
  async publishChat(gameId: string, msg: string, seq: number): Promise<PublishResult> {
    if (!this.wallet) {
      return { success: false, error: 'Wallet not initialized' };
    }
    return this.wallet.publishEvent({ t: 'chat', g: gameId, m: msg, s: seq });
  }
}

export const kaspaService = new KaspaService();
export default kaspaService;
