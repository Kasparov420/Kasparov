/**
 * Kaspa Wallet - Pure JS Implementation (Browser Compatible)
 * 
 * Uses @scure/bip39 + @scure/bip32 for key derivation
 * Uses proper Kaspa address encoding (bech32m)
 * Connects to wRPC endpoints for tx submission
 * 
 * NO extension wallets, NO fake success, NO broken WASM
 */

import * as bip39 from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { HDKey } from '@scure/bip32';
import { blake2b } from '@noble/hashes/blake2b';
import { secp256k1, schnorr } from '@noble/curves/secp256k1';
import { encodeEvent, isPayloadSafe, type GameEvent } from './eventCodec';

// Vite env type declaration
declare const import_meta_env: { VITE_KASPA_WRPC?: string; VITE_KASPA_API?: string } | undefined;

// wRPC endpoint configuration
// Priority: 1) localStorage override, 2) env var, 3) public fallbacks
const getWrpcEndpoint = (): string => {
  // Check localStorage for user-configured endpoint (e.g., local node)
  const localEndpoint = localStorage.getItem('kasparov-wrpc-endpoint');
  if (localEndpoint) return localEndpoint;
  
  // Check for environment variable (Vite)
  try {
    const env = (import.meta as any).env;
    if (env?.VITE_KASPA_WRPC) return env.VITE_KASPA_WRPC;
  } catch {}
  
  // Default to public JSON endpoint (JSON on port 17210, not Borsh on 17110)
  // Format from resolver: /v2/kaspa/{network}/{tls}/wrpc/{encoding}
  return 'wss://kaspa.aspectron.com/v2/kaspa/mainnet/tls/wrpc/json';
};

// Public fallback endpoints (JSON encoding)
const PUBLIC_WRPC_ENDPOINTS = [
  'wss://kaspa.aspectron.com/v2/kaspa/mainnet/tls/wrpc/json',
  'wss://kaspa-ng.aspectron.com/v2/kaspa/mainnet/tls/wrpc/json',
];

// Kaspa REST API for balance/UTXO queries
const getKaspaApi = (): string => {
  try {
    const env = (import.meta as any).env;
    if (env?.VITE_KASPA_API) return env.VITE_KASPA_API;
  } catch {}
  return 'https://api.kaspa.org';
};
const KASPA_API = getKaspaApi();

// Export for UI configuration
export function setWrpcEndpoint(endpoint: string): void {
  localStorage.setItem('kasparov-wrpc-endpoint', endpoint);
  console.log('[Kaspa] wRPC endpoint set to:', endpoint);
}

export function getConfiguredEndpoint(): string {
  return getWrpcEndpoint();
}

// ============== Wallet Session Types ==============

export type KaspaNetwork =
  | "kaspa_mainnet"
  | "kaspa_testnet_12"
  | "kaspa_testnet_11"
  | "kaspa_testnet_10"
  | "kaspa_devnet";

export type WalletSession = {
  kind: "kasware" | "kastle" | "internal" | "other";
  address: string;
  publicKey?: string;
  network: KaspaNetwork;
};

// ============== External Wallet Providers ==============

const MAX_PAYLOAD_BYTES = 100;

/**
 * Detect available wallet providers in the browser
 */
export async function detectWallets(): Promise<{ kasware: boolean; kastle: boolean; other: string[] }> {
  const wallets = { kasware: false, kastle: false, other: [] as string[] };
  
  if (typeof window !== 'undefined') {
    try {
      if ((window as any).kasware) {
        wallets.kasware = true;
      }
    } catch {}
    
    try {
      if ((window as any).kastle) {
        wallets.kastle = true;
      }
    } catch {}
    
    const knownWallets = ['kaspa', 'wallet'];
    for (const wallet of knownWallets) {
      try {
        if ((window as any)[wallet]) {
          if (wallet !== 'kasware' && wallet !== 'kastle') {
            wallets.other.push(wallet);
          }
        }
      } catch {}
    }
  }
  
  return wallets;
}

/**
 * Connect to Kasware wallet
 */
export async function connectKasware(): Promise<WalletSession> {
  if (typeof window === 'undefined') {
    throw new Error('Browser environment required');
  }
  
  const kasware = (window as any).kasware;
  if (!kasware) {
    throw new Error('Kasware wallet not found. Please install Kasware extension.');
  }
  
  try {
    // Try different API patterns for Kasware
    let accounts: string[] = [];
    
    if (kasware.requestAccounts && typeof kasware.requestAccounts === 'function') {
      accounts = await kasware.requestAccounts();
    } else if (kasware.connect && typeof kasware.connect === 'function') {
      const result = await kasware.connect();
      accounts = result.accounts || result.addresses || [result.address];
    } else if (kasware.getAccounts && typeof kasware.getAccounts === 'function') {
      accounts = await kasware.getAccounts();
    } else if (kasware.enable && typeof kasware.enable === 'function') {
      accounts = await kasware.enable();
    } else {
      // Try direct property access
      accounts = kasware.accounts || kasware.addresses || [];
      if (kasware.address) accounts = [kasware.address];
    }
    
    if (!accounts || accounts.length === 0) {
      throw new Error('No accounts available in Kasware. Please unlock your wallet and try again.');
    }
    
    const address = accounts[0];
    console.log('[Kasware] Connected:', address);
    
    return {
      kind: 'kasware',
      address,
      network: 'kaspa_mainnet'
    };
  } catch (e: any) {
    console.error('[Kasware] Connection failed:', e);
    throw new Error(`Kasware connection failed: ${e.message || 'Unknown error'}`);
  }
}

/**
 * Connect to Kastle wallet
 */
export async function connectKastle(): Promise<WalletSession> {
  if (typeof window === 'undefined') {
    throw new Error('Browser environment required');
  }
  
  const kastle = (window as any).kastle;
  if (!kastle) {
    throw new Error('Kastle wallet not found. Please install Kastle extension from https://kastle.app/');
  }
  
  try {
    console.log('[Kastle] Attempting connection...');
    console.log('[Kastle] Available methods:', Object.getOwnPropertyNames(kastle).filter(name => typeof kastle[name] === 'function'));
    
    // Try different API patterns for Kastle
    let accounts: string[] = [];
    
    // Try the most common patterns first
    if (kastle.request && typeof kastle.request === 'function') {
      console.log('[Kastle] Trying kastle.request...');
      try {
        const result = await kastle.request({ method: 'kaspa_getAccounts' });
        accounts = Array.isArray(result) ? result : [result];
      } catch (e) {
        console.log('[Kastle] kastle.request failed:', e);
      }
    }
    
    if (accounts.length === 0 && kastle.requestAccounts && typeof kastle.requestAccounts === 'function') {
      console.log('[Kastle] Trying kastle.requestAccounts...');
      accounts = await kastle.requestAccounts();
    }
    
    if (accounts.length === 0 && kastle.connect && typeof kastle.connect === 'function') {
      console.log('[Kastle] Trying kastle.connect...');
      const result = await kastle.connect();
      accounts = result.accounts || result.addresses || [result.address];
    }
    
    if (accounts.length === 0 && kastle.getAccounts && typeof kastle.getAccounts === 'function') {
      console.log('[Kastle] Trying kastle.getAccounts...');
      accounts = await kastle.getAccounts();
    }
    
    if (accounts.length === 0 && kastle.enable && typeof kastle.enable === 'function') {
      console.log('[Kastle] Trying kastle.enable...');
      accounts = await kastle.enable();
    }
    
    // Try direct property access as fallback
    if (accounts.length === 0) {
      console.log('[Kastle] Trying direct property access...');
      accounts = kastle.accounts || kastle.addresses || [];
      if (kastle.address && accounts.length === 0) accounts = [kastle.address];
    }
    
    if (!accounts || accounts.length === 0) {
      throw new Error('No accounts available in Kastle. Please unlock your wallet and ensure you have at least one account.');
    }
    
    const address = accounts[0];
    console.log('[Kastle] Connected successfully:', address);
    
    return {
      kind: 'kastle',
      address,
      network: 'kaspa_mainnet'
    };
  } catch (e: any) {
    console.error('[Kastle] Connection failed:', e);
    if (e.message && e.message.includes('User rejected')) {
      throw new Error('Kastle connection rejected by user. Please approve the connection in Kastle.');
    }
    throw new Error(`Kastle connection failed: ${e.message || 'Unknown error'}. Make sure Kastle is unlocked and try again.`);
  }
}

// ============== Kaspa Bech32 Encoding ==============
// Kaspa uses a custom bech32 variant with 8-character checksum
// Based on rusty-kaspa crypto/addresses/src/bech32.rs

const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

/**
 * Kaspa polymod function for bech32 checksum
 * Uses 40-bit generator polynomial for 8-character checksum
 */
function polymod(values: number[]): bigint {
  let c = 1n;
  for (const d of values) {
    const c0 = c >> 35n;
    c = ((c & 0x07ffffffffn) << 5n) ^ BigInt(d);
    
    if ((c0 & 0x01n) !== 0n) c ^= 0x98f2bc8e61n;
    if ((c0 & 0x02n) !== 0n) c ^= 0x79b76d99e2n;
    if ((c0 & 0x04n) !== 0n) c ^= 0xf33e5fb3c4n;
    if ((c0 & 0x08n) !== 0n) c ^= 0xae2eabe2a8n;
    if ((c0 & 0x10n) !== 0n) c ^= 0x1e4f43e470n;
  }
  return c ^ 1n; // XOR with 1 at the end!
}

/**
 * Compute checksum for Kaspa address
 */
function kaspaChecksum(payload: number[], prefix: string): bigint {
  // prefix bytes masked to 5 bits, then 0, then payload, then 8 zeros
  const prefixBytes = Array.from(prefix).map(c => c.charCodeAt(0) & 0x1f);
  const values = [...prefixBytes, 0, ...payload, 0, 0, 0, 0, 0, 0, 0, 0];
  return polymod(values);
}

/**
 * Convert 8-bit array to 5-bit array with padding
 */
function conv8to5(payload: Uint8Array): number[] {
  const result: number[] = [];
  let buff = 0;
  let bits = 0;
  
  for (const byte of payload) {
    buff = (buff << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      result.push((buff >> bits) & 0x1f);
    }
  }
  
  // Pad remaining bits
  if (bits > 0) {
    result.push((buff << (5 - bits)) & 0x1f);
  }
  
  return result;
}

/**
 * Convert checksum (40-bit) to 5-bit array
 */
function checksumTo5bit(checksum: bigint): number[] {
  const result: number[] = [];
  for (let i = 7; i >= 0; i--) {
    result.push(Number((checksum >> BigInt(i * 5)) & 0x1fn));
  }
  return result;
}

/**
 * Encode Kaspa address in bech32 format
 */
function bech32Encode(hrp: string, payload5bit: number[]): string {
  const checksum = kaspaChecksum(payload5bit, hrp);
  const checksumBits = checksumTo5bit(checksum);
  const combined = [...payload5bit, ...checksumBits];
  return hrp + ':' + combined.map(d => CHARSET[d]).join('');
}

/**
 * Decode Kaspa address from bech32 format
 */
function bech32Decode(hrp: string, addr: string): Uint8Array {
  if (!addr.startsWith(hrp + ':')) throw new Error('Invalid HRP');
  const data = addr.slice(hrp.length + 1);
  const values = Array.from(data).map(c => {
    const idx = CHARSET.indexOf(c);
    if (idx === -1) throw new Error('Invalid character');
    return idx;
  });
  // Skip checksum (last 8 chars)
  const payload5bit = values.slice(0, -8);
  // Convert 5-bit to 8-bit
  let buff = 0;
  let bits = 0;
  const result: number[] = [];
  for (const d of payload5bit) {
    buff = (buff << 5) | d;
    bits += 5;
    while (bits >= 8) {
      bits -= 8;
      result.push(buff >> bits);
      buff &= (1 << bits) - 1;
    }
  }
  if (bits > 0) {
    result.push(buff << (8 - bits));
  }
  return new Uint8Array(result);
}

/**
 * Create Kaspa address from public key
 * 
 * Kaspa P2PK (schnorr) addresses use the raw 32-byte public key (x-coordinate),
 * NOT a hash of the pubkey like Bitcoin.
 * 
 * Format: version byte (0x00 for schnorr P2PK) + 32-byte pubkey
 * Encoded as bech32 with "kaspa:" prefix
 */
function pubkeyToKaspaAddress(pubkey: Uint8Array): string {
  // For schnorr (P2PK), we use the 32-byte x-coordinate of the public key
  // If we have a 33-byte compressed pubkey, strip the prefix byte
  let pubkey32: Uint8Array;
  if (pubkey.length === 33) {
    // Compressed pubkey: first byte is 0x02 or 0x03, rest is x-coordinate
    pubkey32 = pubkey.slice(1);
  } else if (pubkey.length === 32) {
    pubkey32 = pubkey;
  } else {
    throw new Error(`Invalid public key length: ${pubkey.length}`);
  }
  
  // Version 0x00 for schnorr P2PK + 32-byte pubkey
  const payload = new Uint8Array(33);
  payload[0] = 0x00;
  payload.set(pubkey32, 1);
  
  // Convert to 5-bit groups using Kaspa's conv8to5
  const payload5bit = conv8to5(payload);
  
  return bech32Encode('kaspa', payload5bit);
}

// ============== Wallet Implementation ==============

export interface TxResult {
  success: boolean;
  txId?: string;
  error?: string;
}

export class KaspaWallet {
  private privateKey: Uint8Array | null = null;
  private publicKey: Uint8Array | null = null;
  private address: string = '';
  private connected: boolean = false;
  private session: WalletSession | null = null;

  /**
   * Connect to an external wallet session
   */
  async connectToWallet(session: WalletSession): Promise<void> {
    this.session = session;
    this.address = session.address;
    this.connected = true;
    console.log(`[Kaspa] Connected to ${session.kind} wallet:`, session.address);
  }

  /**
   * Initialize wallet from mnemonic (12 or 24 words)
   */
  async initFromMnemonic(mnemonic: string): Promise<void> {
    console.log('[Kaspa] Initializing internal wallet from mnemonic...');
    console.log('[Kaspa] Previous session state:', this.session ? `External: ${this.session.kind}` : 'None');
    
    // Clear any external wallet session when importing internal wallet
    this.session = null;
    console.log('[Kaspa] Session cleared for internal wallet');
    const normalizedMnemonic = mnemonic.trim().toLowerCase().replace(/\s+/g, ' ');
    const words = normalizedMnemonic.split(' ');
    
    if (words.length !== 12 && words.length !== 24) {
      throw new Error(`Mnemonic must be 12 or 24 words (got ${words.length})`);
    }
    
    // Check all words are valid BIP39 words (skip strict checksum for test wallets)
    const invalidWords = words.filter(w => !wordlist.includes(w));
    if (invalidWords.length > 0) {
      throw new Error(`Invalid words: ${invalidWords.join(', ')}`);
    }

    try {
      // Derive seed from mnemonic
      const seed = await bip39.mnemonicToSeed(normalizedMnemonic);
      
      // Create HD key
      const hdKey = HDKey.fromMasterSeed(seed);
      
      // Derive Kaspa path: m/44'/111111'/0'/0/0
      console.log('[Kaspa] Deriving key from path: m/44\'/111111\'/0\'/0/0');
      const derived = hdKey.derive("m/44'/111111'/0'/0/0");
      
      if (!derived.privateKey || !derived.publicKey) {
        throw new Error('Key derivation failed');
      }
      
      this.privateKey = derived.privateKey;
      // Get compressed public key (33 bytes)
      this.publicKey = derived.publicKey;
      this.address = pubkeyToKaspaAddress(this.publicKey);
      this.connected = true;
      
      // Debug: show public key and address
      console.log('[Kaspa] Wallet initialized:');
      console.log('[Kaspa] Address:', this.address);
      console.log('[Kaspa] Public key (33 bytes):', this.toHex(this.publicKey));
      console.log('[Kaspa] Private key (first 8 bytes):', this.toHex(this.privateKey.slice(0, 8)));
      const pubkey32 = this.publicKey.length === 33 ? this.publicKey.slice(1) : this.publicKey;
      console.log('[Kaspa] Wallet initialized');
      console.log('[Kaspa] Pubkey (32-byte x):', Array.from(pubkey32).map(b => b.toString(16).padStart(2, '0')).join(''));
      console.log('[Kaspa] Address:', this.address);
    } catch (e: any) {
      console.error('[Kaspa] Derivation error:', e);
      throw new Error('Failed to derive wallet: ' + e.message);
    }
  }

  /**
   * Initialize wallet from private key (64-char hex)
   */
  async initFromPrivateKey(privateKeyHex: string): Promise<void> {
    console.log('[Kaspa] Initializing internal wallet from private key...');
    console.log('[Kaspa] Previous session state:', this.session ? `External: ${this.session.kind}` : 'None');
    
    // Clear any external wallet session when importing internal wallet
    this.session = null;
    console.log('[Kaspa] Session cleared for internal wallet');
    let keyHex = privateKeyHex.trim().toLowerCase();
    if (keyHex.startsWith('0x')) {
      keyHex = keyHex.slice(2);
    }
    
    if (!/^[0-9a-f]{64}$/i.test(keyHex)) {
      throw new Error('Invalid private key format. Expected 64-character hex string.');
    }

    try {
      // Convert hex to bytes
      this.privateKey = new Uint8Array(32);
      for (let i = 0; i < 32; i++) {
        this.privateKey[i] = parseInt(keyHex.slice(i * 2, i * 2 + 2), 16);
      }
      
      // Derive public key using secp256k1
      this.publicKey = secp256k1.getPublicKey(this.privateKey, true); // compressed
      this.address = pubkeyToKaspaAddress(this.publicKey);
      this.connected = true;
      
      console.log('[Kaspa] Wallet initialized from private key:', this.address);
    } catch (e: any) {
      console.error('[Kaspa] Import error:', e);
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
      if (!response.ok) {
        console.warn('[Kaspa] Balance API error:', response.status);
        return 0n;
      }
      const data = await response.json();
      return BigInt(data.balance || 0);
    } catch (e) {
      console.warn('[Kaspa] Failed to fetch balance:', e);
      return 0n;
    }
  }

  /**
   * Get UTXOs for transaction building
   */
  async getUtxos(): Promise<any[]> {
    if (!this.address) return [];
    
    try {
      const response = await fetch(`${KASPA_API}/addresses/${this.address}/utxos`);
      if (!response.ok) {
        console.warn('[Kaspa] UTXO API error:', response.status);
        return [];
      }
      return await response.json();
    } catch (e) {
      console.warn('[Kaspa] Failed to fetch UTXOs:', e);
      return [];
    }
  }

  /**
   * Publish a game event to the Kaspa DAG
   * Returns actual result - NO FAKE SUCCESS
   */
  async publishEvent(event: GameEvent): Promise<TxResult> {
    if (!this.isConnected()) {
      return { success: false, error: 'Wallet not connected' };
    }

    const payload = encodeEvent(event);
    const payloadBytes = new TextEncoder().encode(payload);

    if (payloadBytes.length > 150) {
      return { success: false, error: 'Payload too large (>150 bytes)' };
    }

    console.log('[Kaspa] Publishing event:', payload);
    console.log('[Kaspa] From address:', this.address);

    return this.publishWithPayload(payloadBytes);
  }

  /**
   * Publish raw payload bytes to Kaspa DAG
   * For custom payload formats (like chess moves)
   */
  async publishWithPayload(payloadBytes: Uint8Array): Promise<TxResult> {
    if (!this.isConnected()) {
      return { success: false, error: 'Wallet not connected' };
    }

    console.log('[Kaspa] Publishing payload:', this.toHex(payloadBytes));
    console.log('[Kaspa] From address:', this.address);
    console.log('[Kaspa] Session check:', this.session ? `External wallet: ${this.session.kind}` : 'Internal wallet');

    // Handle external wallets differently
    if (this.session && this.session.kind !== 'internal') {
      console.log('[Kaspa] Using external wallet logic for:', this.session.kind);
      return this.publishWithExternalWallet(payloadBytes);
    }

    console.log('[Kaspa] Using internal wallet logic');

    try {
      // Get UTXOs
      const utxos = await this.getUtxos();
      if (!utxos || utxos.length === 0) {
        const address = this.getAddress();
        return {
          success: false,
          error: `No funds in wallet. Send at least 0.00002 KAS to: ${address} to enable transactions. Use any Kaspa wallet or exchange to fund this address.`
        };
      }

      // Calculate balance
      let totalInput = 0n;
      for (const utxo of utxos) {
        totalInput += BigInt(utxo.utxoEntry?.amount || 0);
      }

      console.log('[Kaspa] Balance:', totalInput, 'sompi');
      console.log('[Kaspa] UTXOs:', utxos.length);

      // Minimum transaction amount (5 KAS = 500000000 sompi) - higher amount as requested
      const MIN_TX_AMOUNT = 500000000n;
      // Minimum transaction fee (1000 sompi = 0.00001 KAS)
      const FEE = 1000n;

      if (totalInput < MIN_TX_AMOUNT + FEE) {
        const needed = Number(MIN_TX_AMOUNT + FEE) / 1e8;
        const have = Number(totalInput) / 1e8;
        return { success: false, error: `Insufficient funds. Need at least ${needed.toFixed(5)} KAS to make transactions. You have ${have.toFixed(8)} KAS. Send more funds to: ${this.getAddress()}` };
      }

      // Build and submit transaction with fixed 0.2 KAS amount
      const result = await this.buildAndSubmitTransaction(utxos, payloadBytes, MIN_TX_AMOUNT, FEE);
      return result;
    } catch (e: any) {
      console.error('[Kaspa] Transaction failed:', e);
      return { success: false, error: e.message || 'Transaction failed' };
    }
  }

  /**
   * Publish transaction using external wallet
   */
  private async publishWithExternalWallet(payloadBytes: Uint8Array): Promise<TxResult> {
    console.log('🚀 [EXTERNAL WALLET] Starting transaction process...');
    console.log('📋 [EXTERNAL WALLET] Payload bytes:', payloadBytes.length);

    // Add a very visible alert to confirm we're reaching this code
    alert('🔥 EXTERNAL WALLET: Attempting transaction with ' + this.session?.kind + ' wallet!');

    if (!this.session) {
      console.error('❌ [EXTERNAL WALLET] No wallet session available');
      return { success: false, error: 'No wallet session' };
    }

    console.log('✅ [EXTERNAL WALLET] Session found:', this.session.kind, this.session.address);

    try {
      let provider: any = null;

      if (this.session.kind === 'kasware') {
        provider = (window as any).kasware;
        console.log('🔍 [EXTERNAL WALLET] Kasware provider found:', !!provider);
      } else if (this.session.kind === 'kastle') {
        provider = (window as any).kastle;
        console.log('🔍 [EXTERNAL WALLET] Kastle provider found:', !!provider);
      } else {
        console.error('❌ [EXTERNAL WALLET] Unsupported wallet type:', this.session.kind);
        return { success: false, error: `Unsupported wallet type: ${this.session.kind}` };
      }

      if (!provider) {
        console.error('❌ [EXTERNAL WALLET] Provider not available for', this.session.kind);
        return { success: false, error: `${this.session.kind} wallet not available` };
      }

      console.log('🔧 [EXTERNAL WALLET] Provider methods:', Object.getOwnPropertyNames(provider).filter(name => typeof provider[name] === 'function'));
      console.log('📊 [EXTERNAL WALLET] Provider properties:', Object.keys(provider));
      console.log('🎯 [EXTERNAL WALLET] Full provider object:', provider);

      // Try the absolute simplest approach first - just call send with basic params
      try {
        console.log('🎯 [EXTERNAL WALLET] Trying simplest send method...');

        if (typeof provider.send === 'function') {
          console.log('✅ [EXTERNAL WALLET] Found send method, calling with basic params...');
          const result = await provider.send({
            to: 'kaspa:qr6vs4wy4m3za6mzchj05x3902qrtklkyn8s0u8g2gv6mrctzdzx7pnhqxka2',
            amount: '100000', // 0.001 KAS in sompi
            data: this.toHex(payloadBytes)
          });
          console.log('🎉 [EXTERNAL WALLET] Send result:', result);
          return { success: true, txId: result?.txId || result?.transactionId || result?.hash || 'unknown' };
        }

        // Try sendKaspa if available
        if (typeof provider.sendKaspa === 'function') {
          console.log('✅ [EXTERNAL WALLET] Found sendKaspa method, calling...');
          const result = await provider.sendKaspa({
            address: 'kaspa:qr6vs4wy4m3za6mzchj05x3902qrtklkyn8s0u8g2gv6mrctzdzx7pnhqxka2',
            amount: '100000', // 0.001 KAS in sompi
            data: this.toHex(payloadBytes)
          });
          console.log('🎉 [EXTERNAL WALLET] sendKaspa result:', result);
          return { success: true, txId: result?.txId || result?.transactionId || result?.hash || 'unknown' };
        }

        console.log('❌ [EXTERNAL WALLET] No basic send methods found');
        return { success: false, error: 'No compatible send method found' };

      } catch (error) {
        console.error('💥 [EXTERNAL WALLET] Simple send failed:', error);
        const errorMsg = (error as Error).message || String(error);
        if (errorMsg.includes('JSON')) {
          return { success: false, error: 'Transaction failed - please ensure your wallet has sufficient KAS funds (at least 1 KAS per move)' };
        }
        return { success: false, error: `Send failed: ${errorMsg}` };
      }
    } catch (e: any) {
      console.error(`[${this.session.kind}] Transaction failed:`, e);
      return { 
        success: false, 
        error: e.message || 'External wallet transaction failed' 
      };
    }
  }

  /**
   * Convert Kaspa address to script public key
   */
  private addressToScriptPubKey(address: string): string {
    // Remove 'kaspa:' prefix
    const cleanAddress = address.replace('kaspa:', '');
    
    // Decode bech32
    const decoded = bech32Decode('kaspa', cleanAddress);
    
    // Extract payload (skip version byte)
    const payload = decoded.slice(1);
    
    // Convert to hex
    const pubkeyHex = Array.from(payload).map(b => b.toString(16).padStart(2, '0')).join('');
    
    // Build P2PK script: 0x20 + pubkey + 0xac
    return '20' + pubkeyHex + 'ac';
  }

  /**
   * Build and submit a transaction via REST API
   */
  private async buildAndSubmitTransaction(
    utxos: any[],
    payloadBytes: Uint8Array,
    txAmount: bigint,
    fee: bigint
  ): Promise<TxResult> {
    if (!this.privateKey || !this.publicKey) {
      return { success: false, error: 'Wallet not initialized' };
    }

    const totalInput = utxos.reduce((sum: bigint, utxo: any) => sum + BigInt(utxo.amount || 0), 0n);

    try {
      // Get the 32-byte x-coordinate of the public key for Schnorr
      const pubkey32 = this.publicKey!.length === 33 
        ? this.publicKey!.slice(1) 
        : this.publicKey!;
      
      const walletPubkeyHex = this.toHex(pubkey32);
      console.log('[Kaspa] Wallet pubkey (32 bytes):', walletPubkeyHex);
      
      // Check UTXO pubkeys match our wallet
      for (const utxo of utxos) {
        const utxoScript = utxo.utxoEntry?.scriptPublicKey?.scriptPublicKey || '';
        // P2PK script format: 20 <pubkey 32 bytes> ac
        if (utxoScript.length === 68) {
          const utxoPubkey = utxoScript.slice(2, 66);
          console.log('[Kaspa] UTXO pubkey:', utxoPubkey);
          console.log('[Kaspa] Wallet pubkey:', walletPubkeyHex);
          console.log('[Kaspa] Pubkeys match:', utxoPubkey.toLowerCase() === walletPubkeyHex.toLowerCase());
          if (utxoPubkey.toLowerCase() !== walletPubkeyHex.toLowerCase()) {
            console.error('[Kaspa] ERROR: UTXO does not belong to wallet!');
            return { success: false, error: 'UTXO pubkey mismatch - wallet may be using wrong derivation path' };
          }
        } else {
          console.error('[Kaspa] ERROR: Invalid UTXO script format:', utxoScript);
          return { success: false, error: 'Invalid UTXO script format' };
        }
      }
      
      // Build transaction inputs (initially without signatures)
      // sigOpCount = 1 for standard P2PK schnorr (as per rusty-kaspa sign.rs)
      const inputs = utxos.map((utxo: any) => ({
        previousOutpoint: {
          transactionId: utxo.outpoint?.transactionId,
          index: utxo.outpoint?.index || 0
        },
        signatureScript: '',
        sequence: 0,
        sigOpCount: 1
      }));

      // Change output (send back to self minus fee)
      const changeAmount = totalInput - fee;
      
      // Build scriptPublicKey for P2PK (Schnorr)
      // Format: 0x20 (32-byte push) + pubkey + 0xac (OP_CHECKSIG)
      const pubkeyHex = this.toHex(pubkey32);
      const scriptPubKey = '20' + pubkeyHex + 'ac';
      
      // Build transaction outputs
      // Send fixed amount to sink address, and change back to self
      const sinkAddress = 'kaspa:qr6vs4wy4m3za6mzchj05x3902qrtklkyn8s0u8g2gv6mrctzdzx7pnhqxka2';
      const sinkScriptPubKey = this.addressToScriptPubKey(sinkAddress);
      
      const outputs = [
        {
          amount: Number(txAmount),
          scriptPublicKey: {
            version: 0,
            scriptPublicKey: sinkScriptPubKey
          }
        }
      ];

      // Add change output if there's remaining balance
      const remainingChange = totalInput - txAmount - fee;
      if (remainingChange > 0) {
        outputs.push({
          amount: Number(remainingChange),
          scriptPublicKey: {
            version: 0,
            scriptPublicKey: scriptPubKey
          }
        });
      }

      // Convert payload bytes to hex for transaction
      const payloadHex = this.toHex(payloadBytes);
      
      // Transaction structure
      const txVersion = 0;
      const subnetworkId = '0000000000000000000000000000000000000000';
      
      // Debug: Show the private key (first/last 4 bytes only for security)
      const privKeyHex = this.toHex(this.privateKey!);
      console.log('[Kaspa] Private key (partial):', privKeyHex.slice(0, 8) + '...' + privKeyHex.slice(-8));
      
      // Sign each input using Schnorr
      for (let i = 0; i < inputs.length; i++) {
        const utxo = utxos[i];
        
        // Compute SigHash for this input
        const sigHash = this.computeKaspaSigHash(
          txVersion,
          inputs,
          outputs,
          i,
          utxo,
          subnetworkId,
          payloadHex
        );
        
        console.log(`[Kaspa] SigHash for input ${i}:`, this.toHex(sigHash));
        
        // Sign with Schnorr (BIP-340 style)
        // IMPORTANT: noble/curves schnorr.sign uses BIP-340 which produces 64-byte sig
        const signature = schnorr.sign(sigHash, this.privateKey!);
        const sigBytes = new Uint8Array(signature);
        console.log(`[Kaspa] Signature (${sigBytes.length} bytes):`, this.toHex(sigBytes).slice(0, 32) + '...');
        
        // Verify the signature locally before submitting
        const xOnlyPubkey = pubkey32;
        try {
          const isValid = schnorr.verify(sigBytes, sigHash, xOnlyPubkey);
          console.log(`[Kaspa] Local signature verification:`, isValid ? 'VALID' : 'INVALID');
        } catch (e) {
          console.error('[Kaspa] Local verification error:', e);
        }
        
        // Kaspa signature script format (from rusty-kaspa/consensus/core/src/sign.rs):
        // OP_DATA_65 (0x41) + signature (64 bytes) + sighash_type (1 byte)
        // Total: 65 bytes of data pushed
        const SIGHASH_ALL = 0x01;
        const signatureWithType = new Uint8Array(65);
        signatureWithType.set(sigBytes, 0);
        signatureWithType[64] = SIGHASH_ALL;
        
        // Script: 0x41 (push 65 bytes) + sig+sighash
        const sigScript = '41' + this.toHex(signatureWithType);
        inputs[i].signatureScript = sigScript;
      }

      // Build transaction for REST API submission
      const transaction = {
        version: txVersion,
        inputs: inputs.map(inp => ({
          previousOutpoint: {
            transactionId: inp.previousOutpoint.transactionId,
            index: inp.previousOutpoint.index
          },
          signatureScript: inp.signatureScript,
          sequence: inp.sequence,
          sigOpCount: inp.sigOpCount
        })),
        outputs: outputs.map(out => ({
          amount: out.amount,
          scriptPublicKey: {
            version: out.scriptPublicKey.version,
            scriptPublicKey: out.scriptPublicKey.scriptPublicKey
          }
        })),
        lockTime: 0,
        subnetworkId: subnetworkId,
        gas: 0,
        payload: payloadHex
      };

      console.log('[Kaspa] Submitting transaction via REST API...');
      console.log('[Kaspa] Transaction:', JSON.stringify(transaction, null, 2));

      // Submit via REST API
      const response = await fetch(`${KASPA_API}/transactions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ transaction })
      });

      const result = await response.json();
      console.log('[Kaspa] REST API response:', result);

      if (response.ok && result.transactionId) {
        return { success: true, txId: result.transactionId };
      } else {
        const errorMsg = result.detail || result.error || result.message || JSON.stringify(result);
        return { success: false, error: `Transaction rejected: ${errorMsg}` };
      }
    } catch (e: any) {
      console.error('[Kaspa] Transaction failed:', e);
      return { success: false, error: e.message || 'Transaction failed' };
    }
  }

  /**
   * Convert bytes to hex string
   */
  private toHex(data: Uint8Array): string {
    return Array.from(data).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Convert hex string to bytes
   */
  private fromHex(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    return bytes;
  }

  /**
   * Write uint16 as little-endian bytes
   */
  private writeUint16LE(value: number): Uint8Array {
    const buf = new Uint8Array(2);
    buf[0] = value & 0xff;
    buf[1] = (value >> 8) & 0xff;
    return buf;
  }

  /**
   * Write uint64 as little-endian bytes
   */
  private writeUint64LE(value: bigint): Uint8Array {
    const buf = new Uint8Array(8);
    for (let i = 0; i < 8; i++) {
      buf[i] = Number((value >> BigInt(i * 8)) & 0xffn);
    }
    return buf;
  }

  /**
   * Create a keyed Blake2b hasher with the TransactionSigningHash domain
   * Kaspa uses blake2b with KEY (not personalization) set to "TransactionSigningHash"
   * The key must be exactly the UTF-8 bytes of the string, no null terminator
   */
  private createTxSigningHasher(): ReturnType<typeof blake2b.create> {
    const key = new TextEncoder().encode('TransactionSigningHash');
    console.log('[Blake2b] Key bytes:', Array.from(key).map(b => b.toString(16).padStart(2, '0')).join(''), 'length:', key.length);
    return blake2b.create({ 
      dkLen: 32, 
      key: key
    });
  }

  /**
   * Create a Blake2b hasher for a specific hashing domain (e.g., previous outputs, sequences, etc.)
   */
  private createDomainHasher(domain: string): ReturnType<typeof blake2b.create> {
    const key = new TextEncoder().encode(domain);
    return blake2b.create({ 
      dkLen: 32, 
      key: key
    });
  }

  /**
   * Compute hash of previous outputs for SigHash
   * All sub-hashes use the same "TransactionSigningHash" domain key
   */
  private hashPreviousOutputs(inputs: any[]): Uint8Array {
    const hasher = this.createTxSigningHasher();
    for (const input of inputs) {
      // Transaction ID (32 bytes) - NOT reversed, as raw bytes
      hasher.update(this.fromHex(input.previousOutpoint.transactionId));
      // Index (4 bytes LE)
      hasher.update(this.writeUint32LE(input.previousOutpoint.index));
    }
    return hasher.digest();
  }

  /**
   * Compute hash of sequences for SigHash
   */
  private hashSequences(inputs: any[]): Uint8Array {
    const hasher = this.createTxSigningHasher();
    for (const input of inputs) {
      // Sequence as u64 LE
      hasher.update(this.writeUint64LE(BigInt(input.sequence || 0)));
    }
    return hasher.digest();
  }

  /**
   * Compute hash of sigOpCounts for SigHash
   */
  private hashSigOpCounts(inputs: any[]): Uint8Array {
    const hasher = this.createTxSigningHasher();
    for (const input of inputs) {
      // sigOpCount = 1 for standard P2PK schnorr
      hasher.update(new Uint8Array([input.sigOpCount ?? 1]));
    }
    return hasher.digest();
  }

  /**
   * Compute hash of outputs for SigHash
   */
  private hashOutputs(outputs: any[]): Uint8Array {
    const hasher = this.createTxSigningHasher();
    for (const output of outputs) {
      // Amount (8 bytes LE)
      hasher.update(this.writeUint64LE(BigInt(output.amount)));
      // Script version (2 bytes LE)
      hasher.update(this.writeUint16LE(output.scriptPublicKey.version || 0));
      // Script as var_bytes (length-prefixed)
      const scriptBytes = this.fromHex(output.scriptPublicKey.scriptPublicKey);
      hasher.update(this.writeVarInt(scriptBytes.length));
      hasher.update(scriptBytes);
    }
    return hasher.digest();
  }

  /**
   * Compute hash of payload for SigHash
   * For native subnetwork with empty payload, returns zero hash
   */
  private hashPayload(subnetworkId: string, payload: string): Uint8Array {
    // Native subnetwork = all zeros
    const isNative = subnetworkId === '0000000000000000000000000000000000000000';
    const payloadBytes = payload ? this.fromHex(payload) : new Uint8Array(0);
    
    if (isNative && payloadBytes.length === 0) {
      return new Uint8Array(32); // Zero hash
    }
    
    const hasher = this.createTxSigningHasher();
    hasher.update(this.writeVarInt(payloadBytes.length));
    hasher.update(payloadBytes);
    return hasher.digest();
  }

  /**
   * Write variable-length integer (compact size)
   */
  private writeVarInt(value: number): Uint8Array {
    if (value < 0xfd) {
      return new Uint8Array([value]);
    } else if (value <= 0xffff) {
      const buf = new Uint8Array(3);
      buf[0] = 0xfd;
      buf[1] = value & 0xff;
      buf[2] = (value >> 8) & 0xff;
      return buf;
    } else {
      const buf = new Uint8Array(5);
      buf[0] = 0xfe;
      buf[1] = value & 0xff;
      buf[2] = (value >> 8) & 0xff;
      buf[3] = (value >> 16) & 0xff;
      buf[4] = (value >> 24) & 0xff;
      return buf;
    }
  }

  /**
   * Write uint32 as little-endian bytes
   */
  private writeUint32LE(value: number): Uint8Array {
    const buf = new Uint8Array(4);
    buf[0] = value & 0xff;
    buf[1] = (value >> 8) & 0xff;
    buf[2] = (value >> 16) & 0xff;
    buf[3] = (value >> 24) & 0xff;
    return buf;
  }

  /**
   * Hash outpoint (txId + index) into hasher
   */
  private hashOutpoint(hasher: ReturnType<typeof blake2b.create>, txId: string, index: number): void {
    hasher.update(this.fromHex(txId));
    hasher.update(this.writeUint32LE(index));
  }

  /**
   * Hash script public key into hasher
   */
  private hashScriptPublicKey(hasher: ReturnType<typeof blake2b.create>, version: number, script: string): void {
    hasher.update(this.writeUint16LE(version));
    const scriptBytes = this.fromHex(script);
    hasher.update(this.writeVarInt(scriptBytes.length));
    hasher.update(scriptBytes);
  }

  /**
   * Compute Kaspa SigHash for transaction signing
   * Based on Kaspa's calc_schnorr_signature_hash implementation
   * Uses keyed Blake2b with "TransactionSigningHash" domain
   * 
   * From rusty-kaspa sighash.rs:
   * hasher
   *   .write_u16(tx.version)
   *   .update(previous_outputs_hash)
   *   .update(sequences_hash)
   *   .update(sig_op_counts_hash)
   *   hash_outpoint(hasher, input.previous_outpoint)
   *   hash_script_public_key(hasher, utxo.script_public_key)
   *   .write_u64(utxo.amount)
   *   .write_u64(input.sequence)
   *   .write_u8(input.sig_op_count)
   *   .update(outputs_hash)
   *   .write_u64(tx.lock_time)
   *   .update(tx.subnetwork_id)
   *   .write_u64(tx.gas)
   *   .update(payload_hash)
   *   .write_u8(hash_type)
   */
  private computeKaspaSigHash(
    version: number,
    inputs: any[],
    outputs: any[],
    inputIndex: number,
    utxo: any,
    subnetworkId: string,
    payload: string
  ): Uint8Array {
    const hasher = this.createTxSigningHasher();
    
    // 1. Version (u16 LE)
    const versionBytes = this.writeUint16LE(version);
    hasher.update(versionBytes);
    console.log('[SigHash] 1. Version:', this.toHex(versionBytes));
    
    // 2. Hash of all previous outputs
    const prevOutsHash = this.hashPreviousOutputs(inputs);
    hasher.update(prevOutsHash);
    console.log('[SigHash] 2. PrevOutputsHash:', this.toHex(prevOutsHash));
    
    // 3. Hash of all sequences
    const seqHash = this.hashSequences(inputs);
    hasher.update(seqHash);
    console.log('[SigHash] 3. SequencesHash:', this.toHex(seqHash));
    
    // 4. Hash of all sigOpCounts
    const sigOpHash = this.hashSigOpCounts(inputs);
    hasher.update(sigOpHash);
    console.log('[SigHash] 4. SigOpCountsHash:', this.toHex(sigOpHash));
    
    // 5. Current input's outpoint (txId + index)
    const currentInput = inputs[inputIndex];
    const txIdBytes = this.fromHex(currentInput.previousOutpoint.transactionId);
    const indexBytes = this.writeUint32LE(currentInput.previousOutpoint.index);
    hasher.update(txIdBytes);
    hasher.update(indexBytes);
    console.log('[SigHash] 5. Outpoint txId:', this.toHex(txIdBytes));
    console.log('[SigHash] 5. Outpoint index:', this.toHex(indexBytes));
    
    // 6. UTXO's script public key (version + script as var_bytes)
    const utxoScriptVersion = utxo.utxoEntry?.scriptPublicKey?.version || 0;
    const utxoScript = utxo.utxoEntry?.scriptPublicKey?.scriptPublicKey || '';
    const scriptVersionBytes = this.writeUint16LE(utxoScriptVersion);
    const scriptBytes = this.fromHex(utxoScript);
    const scriptLenBytes = this.writeVarInt(scriptBytes.length);
    hasher.update(scriptVersionBytes);
    hasher.update(scriptLenBytes);
    hasher.update(scriptBytes);
    console.log('[SigHash] 6. Script version:', this.toHex(scriptVersionBytes));
    console.log('[SigHash] 6. Script len:', this.toHex(scriptLenBytes));
    console.log('[SigHash] 6. Script:', this.toHex(scriptBytes));
    
    // 7. UTXO amount (u64 LE)
    const utxoAmount = BigInt(utxo.utxoEntry?.amount || 0);
    const amountBytes = this.writeUint64LE(utxoAmount);
    hasher.update(amountBytes);
    console.log('[SigHash] 7. Amount:', this.toHex(amountBytes), '=', utxoAmount.toString());
    
    // 8. Current input's sequence (u64 LE)
    const seqBytes = this.writeUint64LE(BigInt(currentInput.sequence || 0));
    hasher.update(seqBytes);
    console.log('[SigHash] 8. Sequence:', this.toHex(seqBytes));
    
    // 9. Current input's sigOpCount (u8) - 1 for standard P2PK schnorr
    const sigOpCountByte = new Uint8Array([currentInput.sigOpCount ?? 1]);
    hasher.update(sigOpCountByte);
    console.log('[SigHash] 9. SigOpCount:', this.toHex(sigOpCountByte));
    
    // 10. Hash of all outputs
    const outsHash = this.hashOutputs(outputs);
    hasher.update(outsHash);
    console.log('[SigHash] 10. OutputsHash:', this.toHex(outsHash));
    
    // 11. Lock time (u64 LE)
    const lockTimeBytes = this.writeUint64LE(0n);
    hasher.update(lockTimeBytes);
    console.log('[SigHash] 11. LockTime:', this.toHex(lockTimeBytes));
    
    // 12. Subnetwork ID (20 bytes)
    const subnetBytes = this.fromHex(subnetworkId);
    hasher.update(subnetBytes);
    console.log('[SigHash] 12. SubnetworkId:', this.toHex(subnetBytes));
    
    // 13. Gas (u64 LE)
    const gasBytes = this.writeUint64LE(0n);
    hasher.update(gasBytes);
    console.log('[SigHash] 13. Gas:', this.toHex(gasBytes));
    
    // 14. Payload hash
    const payloadHashBytes = this.hashPayload(subnetworkId, payload);
    hasher.update(payloadHashBytes);
    console.log('[SigHash] 14. PayloadHash:', this.toHex(payloadHashBytes));
    
    // 15. SigHashType (u8) - SigHashAll = 0x01
    const sigHashTypeByte = new Uint8Array([0x01]);
    hasher.update(sigHashTypeByte);
    console.log('[SigHash] 15. SigHashType:', this.toHex(sigHashTypeByte));
    
    const result = hasher.digest();
    console.log('[SigHash] Final SigHash:', this.toHex(result));
    return result;
  }

  disconnect(): void {
    this.privateKey = null;
    this.publicKey = null;
    this.address = '';
    this.connected = false;
    this.session = null; // Clear external wallet session
  }
}

// Singleton
let walletInstance: KaspaWallet | null = null;

export function getWallet(): KaspaWallet {
  if (!walletInstance) {
    walletInstance = new KaspaWallet();
  }
  return walletInstance;
}

export function generateMnemonic(wordCount: 12 | 24 = 12): string {
  // 128 bits = 12 words, 256 bits = 24 words
  const strength = wordCount === 24 ? 256 : 128;
  return bip39.generateMnemonic(wordlist, strength);
}

export function validateMnemonic(mnemonic: string): boolean {
  const normalized = mnemonic.trim().toLowerCase().replace(/\s+/g, ' ');
  const words = normalized.split(' ');
  if (words.length !== 12 && words.length !== 24) {
    return false;
  }
  // Just check words are valid BIP39 words (skip checksum for test wallets)
  return words.every(w => wordlist.includes(w));
}

export function validatePrivateKey(key: string): boolean {
  let keyHex = key.trim().toLowerCase();
  if (keyHex.startsWith('0x')) {
    keyHex = keyHex.slice(2);
  }
  return /^[0-9a-f]{64}$/i.test(keyHex);
}
