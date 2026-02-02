/**
 * Kaspa Wallet - Using Official WASM SDK (kaspa-wasm32-sdk)
 * 
 * This uses the official kaspa WASM package for proper transaction
 * signing that matches what the Kaspa network expects.
 */

import * as bip39 from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { HDKey } from '@scure/bip32';
import { bytesToHex } from '@noble/hashes/utils';

// Kaspa REST API
const KASPA_API = 'https://api.kaspa.org';

export interface TxResult {
  success: boolean;
  txId?: string;
  error?: string;
}

// SDK types
let sdk: any = null;

/**
 * Initialize the WASM SDK
 */
async function initSdk(): Promise<any> {
  if (sdk) return sdk;
  
  try {
    // Import kaspa-wasm32-sdk for browser
    const kaspa = await import('kaspa-wasm32-sdk');
    // Initialize WASM
    if (typeof kaspa.default === 'function') {
      await kaspa.default();
    }
    sdk = kaspa;
    console.log('[KaspaSDK] Initialized, version:', sdk.version?.() || 'unknown');
    return sdk;
  } catch (e) {
    console.error('[KaspaSDK] Failed to initialize:', e);
    throw new Error('Failed to initialize Kaspa SDK');
  }
}

export class KaspaWallet {
  private mnemonic: string = '';
  private privateKeyHex: string = '';
  private address: string = '';
  private publicKeyHex: string = '';
  private connected: boolean = false;
  private privateKey: any = null; // SDK PrivateKey object

  /**
   * Initialize wallet from mnemonic (12 or 24 words)
   */
  async initFromMnemonic(mnemonic: string): Promise<void> {
    const kaspa = await initSdk();
    
    const normalizedMnemonic = mnemonic.trim().toLowerCase().replace(/\s+/g, ' ');
    const words = normalizedMnemonic.split(' ');
    
    if (words.length !== 12 && words.length !== 24) {
      throw new Error(`Mnemonic must be 12 or 24 words (got ${words.length})`);
    }
    
    // Check if all words are in the wordlist
    const invalidWords = words.filter(w => !wordlist.includes(w));
    if (invalidWords.length > 0) {
      throw new Error(`Invalid words: ${invalidWords.join(', ')}`);
    }
    
    // Note: We skip strict checksum validation to allow test mnemonics
    // In production, you'd want: bip39.validateMnemonic(normalizedMnemonic, wordlist)

    try {
      // Derive private key using BIP32/BIP44
      // Kaspa path: m/44'/111111'/0'/0/0
      const seed = bip39.mnemonicToSeedSync(normalizedMnemonic);
      const hdKey = HDKey.fromMasterSeed(seed);
      const derivedKey = hdKey.derive("m/44'/111111'/0'/0/0");
      
      if (!derivedKey.privateKey) {
        throw new Error('Failed to derive private key');
      }
      
      this.privateKeyHex = bytesToHex(derivedKey.privateKey);
      
      // Create SDK PrivateKey from hex
      this.privateKey = new kaspa.PrivateKey(this.privateKeyHex);
      
      // Get public key and address
      const publicKey = this.privateKey.toPublicKey();
      this.publicKeyHex = publicKey.toString();
      
      // Create mainnet address
      const address = this.privateKey.toAddress('mainnet');
      this.address = address.toString();
      
      this.mnemonic = normalizedMnemonic;
      this.connected = true;
      
      console.log('[KaspaSDK] Wallet initialized from mnemonic');
      console.log('[KaspaSDK] Address:', this.address);
    } catch (e: any) {
      console.error('[KaspaSDK] Init error:', e);
      throw new Error('Failed to initialize wallet: ' + e.message);
    }
  }

  /**
   * Initialize wallet from private key hex
   */
  async initFromPrivateKey(privateKeyHex: string): Promise<void> {
    const kaspa = await initSdk();
    
    let keyHex = privateKeyHex.trim().toLowerCase();
    if (keyHex.startsWith('0x')) {
      keyHex = keyHex.slice(2);
    }
    
    if (!/^[0-9a-f]{64}$/i.test(keyHex)) {
      throw new Error('Invalid private key format (expected 64 hex chars)');
    }

    try {
      this.privateKeyHex = keyHex;
      this.privateKey = new kaspa.PrivateKey(keyHex);
      
      const publicKey = this.privateKey.toPublicKey();
      this.publicKeyHex = publicKey.toString();
      
      const address = this.privateKey.toAddress('mainnet');
      this.address = address.toString();
      
      this.connected = true;
      
      console.log('[KaspaSDK] Wallet initialized from private key');
      console.log('[KaspaSDK] Address:', this.address);
    } catch (e: any) {
      console.error('[KaspaSDK] Import error:', e);
      throw new Error('Failed to import private key: ' + e.message);
    }
  }

  getAddress(): string {
    return this.address;
  }

  getPublicKey(): string {
    return this.publicKeyHex;
  }

  isConnected(): boolean {
    return this.connected && !!this.address;
  }

  /**
   * Get wallet balance from API
   */
  async getBalance(): Promise<bigint> {
    if (!this.address) return 0n;
    
    try {
      const response = await fetch(`${KASPA_API}/addresses/${this.address}/balance`);
      if (!response.ok) return 0n;
      const data = await response.json();
      return BigInt(data.balance || 0);
    } catch (e) {
      console.warn('[KaspaSDK] Balance fetch failed:', e);
      return 0n;
    }
  }

  /**
   * Get UTXOs from API
   */
  async getUtxos(): Promise<any[]> {
    if (!this.address) return [];
    
    try {
      const response = await fetch(`${KASPA_API}/addresses/${this.address}/utxos`);
      if (!response.ok) return [];
      return await response.json();
    } catch (e) {
      console.warn('[KaspaSDK] UTXO fetch failed:', e);
      return [];
    }
  }

  /**
   * Publish a game event (with OP_RETURN payload)
   */
  async publishEvent(event: { type: string; gameId: string; [key: string]: any }): Promise<TxResult> {
    // Encode the event as JSON payload
    const payload = JSON.stringify(event);
    return this.sendWithPayload(payload);
  }

  /**
   * Send a transaction with payload data
   */
  async sendWithPayload(payload: string): Promise<TxResult> {
    if (!this.isConnected() || !this.privateKey) {
      return { success: false, error: 'Wallet not connected' };
    }

    try {
      const kaspa = await initSdk();
      
      // Fetch UTXOs from API
      const utxosRaw = await this.getUtxos();
      if (!utxosRaw || utxosRaw.length === 0) {
        return { success: false, error: 'No UTXOs available - wallet needs funds' };
      }

      console.log('[KaspaSDK] Found', utxosRaw.length, 'UTXOs');

      // Convert API UTXOs to SDK format
      const utxoEntries: any[] = [];
      let totalInput = 0n;

      for (const utxo of utxosRaw) {
        const amount = BigInt(utxo.utxoEntry?.amount || 0);
        totalInput += amount;
        
        utxoEntries.push({
          address: this.address,
          outpoint: {
            transactionId: utxo.outpoint.transactionId,
            index: utxo.outpoint.index
          },
          amount: amount,
          scriptPublicKey: {
            version: utxo.utxoEntry.scriptPublicKey.version,
            script: utxo.utxoEntry.scriptPublicKey.scriptPublicKey
          },
          blockDaaScore: BigInt(utxo.utxoEntry.blockDaaScore || 0),
          isCoinbase: utxo.utxoEntry.isCoinbase || false
        });
      }

      console.log('[KaspaSDK] Total input:', totalInput, 'sompi');

      // Calculate fee (1000 sompi per input, minimum 1000)
      const fee = BigInt(Math.max(1000, utxosRaw.length * 1000));
      const changeAmount = totalInput - fee;

      if (changeAmount < 294n) { // Minimum dust amount
        return { 
          success: false, 
          error: `Insufficient funds. Have ${totalInput} sompi, need at least ${fee + 294n}` 
        };
      }

      // Create change output (send back to self)
      const outputs = [{
        address: this.address,
        amount: changeAmount
      }];

      // Encode payload as hex
      const payloadBytes = new TextEncoder().encode(payload);
      const payloadHex = Array.from(payloadBytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      console.log('[KaspaSDK] Creating transaction...');
      console.log('[KaspaSDK] Payload:', payload);
      console.log('[KaspaSDK] Payload hex:', payloadHex);

      // Use SDK's createTransaction
      const tx = kaspa.createTransaction(
        utxoEntries,        // UTXOs
        outputs,            // Outputs
        fee,                // Priority fee
        payloadHex,         // Payload (hex)
        1                   // sigOpCount
      );

      console.log('[KaspaSDK] Transaction created, signing...');

      // Sign with SDK's signTransaction
      const signedTx = kaspa.signTransaction(tx, [this.privateKey], true);

      console.log('[KaspaSDK] Transaction signed');

      // Get JSON for API submission
      const txJson = signedTx.toJSON ? signedTx.toJSON() : signedTx;
      console.log('[KaspaSDK] TX JSON:', JSON.stringify(txJson, null, 2));

      // Submit via REST API
      const response = await fetch(`${KASPA_API}/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transaction: txJson })
      });

      const result = await response.json();
      console.log('[KaspaSDK] API response:', result);

      if (response.ok && result.transactionId) {
        console.log('[KaspaSDK] ✅ Transaction accepted:', result.transactionId);
        return { success: true, txId: result.transactionId };
      } else {
        const errorMsg = result.detail || result.error || result.message || JSON.stringify(result);
        console.error('[KaspaSDK] ❌ Transaction rejected:', errorMsg);
        return { success: false, error: errorMsg };
      }
    } catch (e: any) {
      console.error('[KaspaSDK] Transaction failed:', e);
      return { success: false, error: e.message || 'Transaction failed' };
    }
  }

  /**
   * Send KAS to an address
   */
  async send(toAddress: string, amountSompi: bigint): Promise<TxResult> {
    if (!this.isConnected() || !this.privateKey) {
      return { success: false, error: 'Wallet not connected' };
    }

    try {
      const kaspa = await initSdk();
      
      // Fetch UTXOs
      const utxosRaw = await this.getUtxos();
      if (!utxosRaw || utxosRaw.length === 0) {
        return { success: false, error: 'No UTXOs available' };
      }

      // Convert UTXOs
      const utxoEntries: any[] = [];
      let totalInput = 0n;

      for (const utxo of utxosRaw) {
        const amount = BigInt(utxo.utxoEntry?.amount || 0);
        totalInput += amount;
        
        utxoEntries.push({
          address: this.address,
          outpoint: {
            transactionId: utxo.outpoint.transactionId,
            index: utxo.outpoint.index
          },
          amount: amount,
          scriptPublicKey: {
            version: utxo.utxoEntry.scriptPublicKey.version,
            script: utxo.utxoEntry.scriptPublicKey.scriptPublicKey
          },
          blockDaaScore: BigInt(utxo.utxoEntry.blockDaaScore || 0),
          isCoinbase: utxo.utxoEntry.isCoinbase || false
        });
      }

      const fee = BigInt(Math.max(1000, utxosRaw.length * 1000));
      const changeAmount = totalInput - amountSompi - fee;

      if (changeAmount < 0n) {
        return { success: false, error: 'Insufficient funds' };
      }

      // Build outputs: payment + change
      const outputs: any[] = [
        { address: toAddress, amount: amountSompi }
      ];
      
      if (changeAmount >= 294n) {
        outputs.push({ address: this.address, amount: changeAmount });
      }

      const tx = kaspa.createTransaction(utxoEntries, outputs, fee, undefined, 1);
      const signedTx = kaspa.signTransaction(tx, [this.privateKey], true);
      const txJson = signedTx.toJSON ? signedTx.toJSON() : signedTx;

      const response = await fetch(`${KASPA_API}/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transaction: txJson })
      });

      const result = await response.json();
      
      if (response.ok && result.transactionId) {
        return { success: true, txId: result.transactionId };
      } else {
        return { success: false, error: result.detail || result.error || JSON.stringify(result) };
      }
    } catch (e: any) {
      return { success: false, error: e.message || 'Transaction failed' };
    }
  }

  disconnect(): void {
    this.mnemonic = '';
    this.privateKeyHex = '';
    this.address = '';
    this.publicKeyHex = '';
    this.connected = false;
    this.privateKey = null;
  }
}

// Singleton instance
let walletInstance: KaspaWallet | null = null;

export function getWallet(): KaspaWallet {
  if (!walletInstance) {
    walletInstance = new KaspaWallet();
  }
  return walletInstance;
}

/**
 * Generate a new mnemonic
 */
export function generateMnemonic(wordCount: 12 | 24 = 12): string {
  const strength = wordCount === 24 ? 256 : 128;
  return bip39.generateMnemonic(wordlist, strength);
}

/**
 * Validate a mnemonic - just checks word count and that all words are in wordlist
 * Note: We skip checksum validation to allow test/custom mnemonics
 */
export function validateMnemonic(mnemonic: string): boolean {
  const normalized = mnemonic.trim().toLowerCase().replace(/\s+/g, ' ');
  const words = normalized.split(' ');
  if (words.length !== 12 && words.length !== 24) return false;
  // Just check all words are valid BIP39 words (skip checksum)
  return words.every(w => wordlist.includes(w));
}
