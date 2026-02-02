/**
 * Kaspa Wallet - Using Official WASM SDK
 * 
 * This uses the official kaspa WASM package for proper transaction
 * signing that matches what the node expects.
 */

import * as bip39 from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';

// The kaspa WASM SDK
let kaspaWasm: any = null;

// Kaspa REST API
const KASPA_API = 'https://api.kaspa.org';

export interface TxResult {
  success: boolean;
  txId?: string;
  error?: string;
}

/**
 * Initialize the WASM SDK
 */
async function initWasm(): Promise<void> {
  if (kaspaWasm) return;
  
  try {
    // Dynamic import of the kaspa WASM module
    const kaspa = await import('kaspa');
    await kaspa.default(); // Initialize WASM
    kaspaWasm = kaspa;
    console.log('[KaspaWASM] SDK initialized');
  } catch (e) {
    console.error('[KaspaWASM] Failed to initialize:', e);
    throw new Error('Failed to initialize Kaspa WASM SDK');
  }
}

export class KaspaWalletWasm {
  private mnemonic: string = '';
  private privateKeyHex: string = '';
  private address: string = '';
  private publicKeyHex: string = '';
  private connected: boolean = false;
  private xPrv: any = null; // Extended private key from SDK
  private keypair: any = null;

  /**
   * Initialize wallet from mnemonic
   */
  async initFromMnemonic(mnemonic: string): Promise<void> {
    await initWasm();
    
    const normalizedMnemonic = mnemonic.trim().toLowerCase().replace(/\s+/g, ' ');
    const words = normalizedMnemonic.split(' ');
    
    if (words.length !== 12 && words.length !== 24) {
      throw new Error(`Mnemonic must be 12 or 24 words (got ${words.length})`);
    }
    
    if (!bip39.validateMnemonic(normalizedMnemonic, wordlist)) {
      throw new Error('Invalid mnemonic phrase');
    }

    try {
      // Use the SDK's mnemonic handling
      const { Mnemonic, XPrv, PublicKey, Address, NetworkType } = kaspaWasm;
      
      // Create mnemonic object
      const mnemonicObj = new Mnemonic(normalizedMnemonic);
      
      // Derive seed and extended private key
      const seed = mnemonicObj.toSeed();
      this.xPrv = new XPrv(seed);
      
      // Derive the first receive address key (m/44'/111111'/0'/0/0)
      const derivedKey = this.xPrv
        .deriveChild(44, true)  // purpose
        .deriveChild(111111, true)  // coin type (Kaspa)
        .deriveChild(0, true)  // account
        .deriveChild(0, false)  // external chain
        .deriveChild(0, false);  // address index
      
      // Get keypair for signing
      const privateKey = derivedKey.privateKey;
      this.keypair = privateKey.toKeypair();
      
      // Get public key and address
      const publicKey = privateKey.toPublicKey();
      this.publicKeyHex = publicKey.toString();
      
      // Create address (mainnet)
      const address = publicKey.toAddress(NetworkType.Mainnet);
      this.address = address.toString();
      
      this.mnemonic = normalizedMnemonic;
      this.connected = true;
      
      console.log('[KaspaWASM] Wallet initialized');
      console.log('[KaspaWASM] Address:', this.address);
      console.log('[KaspaWASM] Public Key:', this.publicKeyHex);
    } catch (e: any) {
      console.error('[KaspaWASM] Init error:', e);
      throw new Error('Failed to initialize wallet: ' + e.message);
    }
  }

  /**
   * Initialize wallet from private key hex
   */
  async initFromPrivateKey(privateKeyHex: string): Promise<void> {
    await initWasm();
    
    let keyHex = privateKeyHex.trim().toLowerCase();
    if (keyHex.startsWith('0x')) {
      keyHex = keyHex.slice(2);
    }
    
    if (!/^[0-9a-f]{64}$/i.test(keyHex)) {
      throw new Error('Invalid private key format');
    }

    try {
      const { PrivateKey, NetworkType } = kaspaWasm;
      
      // Create private key from hex
      const privateKey = new PrivateKey(keyHex);
      this.keypair = privateKey.toKeypair();
      
      // Get public key and address
      const publicKey = privateKey.toPublicKey();
      this.publicKeyHex = publicKey.toString();
      
      const address = publicKey.toAddress(NetworkType.Mainnet);
      this.address = address.toString();
      
      this.privateKeyHex = keyHex;
      this.connected = true;
      
      console.log('[KaspaWASM] Wallet initialized from private key');
      console.log('[KaspaWASM] Address:', this.address);
    } catch (e: any) {
      console.error('[KaspaWASM] Import error:', e);
      throw new Error('Failed to import private key: ' + e.message);
    }
  }

  getAddress(): string {
    return this.address;
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
      console.warn('[KaspaWASM] Balance fetch failed:', e);
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
      console.warn('[KaspaWASM] UTXO fetch failed:', e);
      return [];
    }
  }

  /**
   * Send a transaction with OP_RETURN data (for game events)
   */
  async sendWithPayload(payload: string): Promise<TxResult> {
    if (!this.isConnected() || !this.keypair) {
      return { success: false, error: 'Wallet not connected' };
    }

    try {
      await initWasm();
      
      const {
        Transaction,
        TransactionInput,
        TransactionOutput,
        TransactionOutpoint,
        ScriptPublicKey,
        UtxoEntry,
        UtxoEntries,
        signTransaction,
        Address,
        NetworkType,
      } = kaspaWasm;

      // Fetch UTXOs
      const utxosRaw = await this.getUtxos();
      if (!utxosRaw || utxosRaw.length === 0) {
        return { success: false, error: 'No UTXOs available - wallet needs funds' };
      }

      console.log('[KaspaWASM] UTXOs:', utxosRaw.length);

      // Calculate total input
      let totalInput = 0n;
      for (const utxo of utxosRaw) {
        totalInput += BigInt(utxo.utxoEntry?.amount || 0);
      }
      console.log('[KaspaWASM] Total input:', totalInput, 'sompi');

      // Fee calculation (simple: 1000 sompi per input, minimum 1000)
      const fee = BigInt(Math.max(1000, utxosRaw.length * 1000));
      const changeAmount = totalInput - fee;

      if (changeAmount < 294n) {
        return { success: false, error: `Insufficient funds. Have ${totalInput} sompi, need at least ${fee + 294n}` };
      }

      // Build transaction inputs
      const inputs: any[] = [];
      const utxoEntries: any[] = [];

      for (const utxo of utxosRaw) {
        const outpoint = new TransactionOutpoint(
          utxo.outpoint.transactionId,
          utxo.outpoint.index
        );
        
        const input = new TransactionInput(
          outpoint,
          new Uint8Array(0), // Empty signature script (will be filled by signing)
          BigInt(0), // sequence
          1 // sigOpCount for P2PK
        );
        inputs.push(input);

        // Create UTXO entry for signing context
        const scriptPubKey = new ScriptPublicKey(
          utxo.utxoEntry.scriptPublicKey.version,
          utxo.utxoEntry.scriptPublicKey.scriptPublicKey
        );
        
        const utxoEntry = new UtxoEntry(
          BigInt(utxo.utxoEntry.amount),
          scriptPubKey,
          BigInt(utxo.utxoEntry.blockDaaScore || 0),
          utxo.utxoEntry.isCoinbase || false
        );
        utxoEntries.push(utxoEntry);
      }

      // Build change output (back to self)
      const myAddress = new Address(this.address);
      const changeScriptPubKey = myAddress.toScriptPublicKey();
      
      const changeOutput = new TransactionOutput(
        changeAmount,
        changeScriptPubKey
      );

      // Encode payload to hex
      const payloadBytes = new TextEncoder().encode(payload);
      const payloadHex = Array.from(payloadBytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      // Create transaction
      const tx = new Transaction(
        0, // version
        inputs,
        [changeOutput],
        BigInt(0), // lockTime
        new Uint8Array(20), // subnetworkId (native = all zeros)
        BigInt(0), // gas
        payloadHex // payload
      );

      console.log('[KaspaWASM] Transaction built, signing...');

      // Sign the transaction using the SDK
      const utxoEntriesObj = new UtxoEntries(utxoEntries);
      const signedTx = signTransaction(tx, [this.keypair], true);

      console.log('[KaspaWASM] Transaction signed, submitting...');
      console.log('[KaspaWASM] Signed TX:', signedTx.toJSON());

      // Submit via REST API
      const response = await fetch(`${KASPA_API}/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transaction: signedTx.toJSON() })
      });

      const result = await response.json();
      console.log('[KaspaWASM] API response:', result);

      if (response.ok && result.transactionId) {
        return { success: true, txId: result.transactionId };
      } else {
        return { 
          success: false, 
          error: `Transaction rejected: ${result.detail || result.error || JSON.stringify(result)}` 
        };
      }
    } catch (e: any) {
      console.error('[KaspaWASM] Transaction failed:', e);
      return { success: false, error: e.message || 'Transaction failed' };
    }
  }

  disconnect(): void {
    this.mnemonic = '';
    this.privateKeyHex = '';
    this.address = '';
    this.publicKeyHex = '';
    this.connected = false;
    this.xPrv = null;
    this.keypair = null;
  }
}

// Singleton instance
let walletInstance: KaspaWalletWasm | null = null;

export function getWasmWallet(): KaspaWalletWasm {
  if (!walletInstance) {
    walletInstance = new KaspaWalletWasm();
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
 * Validate a mnemonic
 */
export function validateMnemonic(mnemonic: string): boolean {
  const normalized = mnemonic.trim().toLowerCase().replace(/\s+/g, ' ');
  const words = normalized.split(' ');
  if (words.length !== 12 && words.length !== 24) return false;
  return bip39.validateMnemonic(normalized, wordlist);
}
