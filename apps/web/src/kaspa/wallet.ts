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
  
  // Default to public endpoint
  return 'wss://kaspa.aspectron.com/mainnet';
};

// Public fallback endpoints
const PUBLIC_WRPC_ENDPOINTS = [
  'wss://kaspa.aspectron.com/mainnet',
  'wss://kaspa-ng.aspectron.com/mainnet',
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

  /**
   * Initialize wallet from mnemonic (12 or 24 words)
   */
  async initFromMnemonic(mnemonic: string): Promise<void> {
    const normalizedMnemonic = mnemonic.trim().toLowerCase().replace(/\s+/g, ' ');
    const words = normalizedMnemonic.split(' ');
    
    if (words.length !== 12 && words.length !== 24) {
      throw new Error(`Mnemonic must be 12 or 24 words (got ${words.length})`);
    }
    
    if (!bip39.validateMnemonic(normalizedMnemonic, wordlist)) {
      throw new Error('Invalid mnemonic phrase - check spelling of each word');
    }

    try {
      // Derive seed from mnemonic
      const seed = await bip39.mnemonicToSeed(normalizedMnemonic);
      
      // Create HD key
      const hdKey = HDKey.fromMasterSeed(seed);
      
      // Derive Kaspa path: m/44'/111111'/0'/0/0
      const derived = hdKey.derive("m/44'/111111'/0'/0/0");
      
      if (!derived.privateKey || !derived.publicKey) {
        throw new Error('Key derivation failed');
      }
      
      this.privateKey = derived.privateKey;
      // Get compressed public key (33 bytes)
      this.publicKey = derived.publicKey;
      this.address = pubkeyToKaspaAddress(this.publicKey);
      this.connected = true;
      
      console.log('[Kaspa] Wallet initialized:', this.address);
    } catch (e: any) {
      console.error('[Kaspa] Derivation error:', e);
      throw new Error('Failed to derive wallet: ' + e.message);
    }
  }

  /**
   * Initialize wallet from private key (64-char hex)
   */
  async initFromPrivateKey(privateKeyHex: string): Promise<void> {
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
    
    if (!isPayloadSafe(payload)) {
      return { success: false, error: 'Payload too large (>150 bytes)' };
    }

    console.log('[Kaspa] Publishing event:', payload);
    console.log('[Kaspa] From address:', this.address);

    try {
      // Get UTXOs
      const utxos = await this.getUtxos();
      if (!utxos || utxos.length === 0) {
        return { success: false, error: 'No UTXOs available - wallet needs funds to send transactions' };
      }

      // Calculate balance
      let totalInput = 0n;
      for (const utxo of utxos) {
        totalInput += BigInt(utxo.utxoEntry?.amount || 0);
      }
      
      console.log('[Kaspa] Balance:', totalInput, 'sompi');
      console.log('[Kaspa] UTXOs:', utxos.length);

      // Minimum transaction fee (1000 sompi = 0.00001 KAS)
      const FEE = 1000n;
      // Minimum output value
      const MIN_OUTPUT = 294n;
      
      if (totalInput < FEE + MIN_OUTPUT) {
        return { success: false, error: `Insufficient funds. Need at least ${FEE + MIN_OUTPUT} sompi, have ${totalInput}` };
      }

      // Build and submit transaction
      const result = await this.buildAndSubmitTransaction(utxos, payload, totalInput, FEE);
      return result;
    } catch (e: any) {
      console.error('[Kaspa] Transaction failed:', e);
      return { success: false, error: e.message || 'Transaction failed' };
    }
  }

  /**
   * Build and submit a transaction via wRPC
   */
  private async buildAndSubmitTransaction(
    utxos: any[],
    opReturnData: string,
    totalInput: bigint,
    fee: bigint
  ): Promise<TxResult> {
    if (!this.privateKey || !this.publicKey) {
      return { success: false, error: 'Wallet not initialized' };
    }

    const endpoint = getWrpcEndpoint();
    console.log('[Kaspa] Connecting to wRPC:', endpoint);

    return new Promise((resolve) => {
      const ws = new WebSocket(endpoint);
      let resolved = false;
      
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          ws.close();
          resolve({ success: false, error: 'Connection timeout' });
        }
      }, 15000);

      ws.onopen = async () => {
        console.log('[Kaspa] wRPC connected');
        
        try {
          // Get the 32-byte x-coordinate of the public key for Schnorr
          const pubkey32 = this.publicKey!.length === 33 
            ? this.publicKey!.slice(1) 
            : this.publicKey!;
          
          // Build transaction inputs (initially without signatures)
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
          const outputs = [
            {
              amount: changeAmount.toString(),
              scriptPublicKey: {
                version: 0,
                scriptPublicKey: scriptPubKey
              }
            }
          ];

          // Convert OP_RETURN data to hex for payload
          const opReturnHex = this.toHex(new TextEncoder().encode(opReturnData));
          
          // Transaction structure
          const txVersion = 0;
          const subnetworkId = '0000000000000000000000000000000000000000';
          
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
              opReturnHex
            );
            
            console.log(`[Kaspa] SigHash for input ${i}:`, this.toHex(sigHash));
            
            // Sign with Schnorr (BIP-340 style)
            const signature = schnorr.sign(sigHash, this.privateKey!);
            
            // Build signature script: 0x41 (65 bytes) + sig (64) + sighash_type (1)
            // Or simpler: 0x40 (64 bytes) + sig
            const sigHex = this.toHex(signature);
            
            // Kaspa Schnorr script: <sig> <pubkey>
            // 0x40 = push 64 bytes (signature)
            // 0x20 = push 32 bytes (pubkey)
            const sigScript = '40' + sigHex + '20' + pubkeyHex;
            inputs[i].signatureScript = sigScript;
          }

          // Submit via wRPC
          const submitRequest = {
            id: 1,
            method: 'submitTransaction',
            params: {
              transaction: {
                version: txVersion,
                inputs: inputs,
                outputs: outputs,
                lockTime: '0',
                subnetworkId: subnetworkId,
                gas: '0',
                payload: opReturnHex
              },
              allowOrphan: false
            }
          };

          console.log('[Kaspa] Submitting transaction...', JSON.stringify(submitRequest, null, 2));
          ws.send(JSON.stringify(submitRequest));
        } catch (e: any) {
          clearTimeout(timeout);
          resolved = true;
          ws.close();
          resolve({ success: false, error: 'Transaction build error: ' + e.message });
        }
      };

      ws.onmessage = (event) => {
        try {
          const response = JSON.parse(event.data);
          console.log('[Kaspa] wRPC response:', response);
          
          if (response.result?.transactionId) {
            clearTimeout(timeout);
            resolved = true;
            ws.close();
            resolve({ success: true, txId: response.result.transactionId });
          } else if (response.error) {
            clearTimeout(timeout);
            resolved = true;
            ws.close();
            resolve({ success: false, error: response.error.message || 'Transaction rejected' });
          }
        } catch (e) {
          console.error('[Kaspa] Parse error:', e);
        }
      };

      ws.onerror = (e) => {
        console.error('[Kaspa] WebSocket error:', e);
        if (!resolved) {
          clearTimeout(timeout);
          resolved = true;
          resolve({ success: false, error: 'WebSocket connection failed' });
        }
      };

      ws.onclose = () => {
        if (!resolved) {
          clearTimeout(timeout);
          resolved = true;
          resolve({ success: false, error: 'Connection closed unexpectedly' });
        }
      };
    });
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
   * Compute Kaspa SigHash for transaction signing
   * Based on Kaspa's SigHashAll implementation
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
    // Kaspa uses a specific sighash algorithm based on BIP-340
    // We need to hash various components of the transaction
    
    const parts: Uint8Array[] = [];
    
    // 1. Version (2 bytes LE)
    parts.push(this.writeUint16LE(version));
    
    // 2. Hash of all previous outpoints
    const prevOutpointsData: number[] = [];
    for (const input of inputs) {
      // Transaction ID (32 bytes, reversed)
      const txIdBytes = this.fromHex(input.previousOutpoint.transactionId);
      for (let i = txIdBytes.length - 1; i >= 0; i--) {
        prevOutpointsData.push(txIdBytes[i]);
      }
      // Index (4 bytes LE)
      const idx = input.previousOutpoint.index;
      prevOutpointsData.push(idx & 0xff, (idx >> 8) & 0xff, (idx >> 16) & 0xff, (idx >> 24) & 0xff);
    }
    const prevOutpointsHash = blake2b(new Uint8Array(prevOutpointsData), { dkLen: 32 });
    parts.push(prevOutpointsHash);
    
    // 3. Hash of all sequences
    const sequencesData: number[] = [];
    for (const input of inputs) {
      const seq = input.sequence || 0;
      sequencesData.push(seq & 0xff, (seq >> 8) & 0xff, (seq >> 16) & 0xff, (seq >> 24) & 0xff, 0, 0, 0, 0);
    }
    const sequencesHash = blake2b(new Uint8Array(sequencesData), { dkLen: 32 });
    parts.push(sequencesHash);
    
    // 4. Hash of sigOpCounts
    const sigOpData: number[] = [];
    for (const input of inputs) {
      sigOpData.push(input.sigOpCount || 1);
    }
    const sigOpHash = blake2b(new Uint8Array(sigOpData), { dkLen: 32 });
    parts.push(sigOpHash);
    
    // 5. Hash of all outputs
    const outputsData: number[] = [];
    for (const output of outputs) {
      // Amount (8 bytes LE)
      const amount = BigInt(output.amount);
      for (let i = 0; i < 8; i++) {
        outputsData.push(Number((amount >> BigInt(i * 8)) & 0xffn));
      }
      // Script version (2 bytes LE)
      outputsData.push(output.scriptPublicKey.version & 0xff, 0);
      // Script length (varint - 1 byte for small scripts)
      const scriptBytes = this.fromHex(output.scriptPublicKey.scriptPublicKey);
      outputsData.push(scriptBytes.length);
      // Script bytes
      for (const b of scriptBytes) {
        outputsData.push(b);
      }
    }
    const outputsHash = blake2b(new Uint8Array(outputsData), { dkLen: 32 });
    parts.push(outputsHash);
    
    // 6. Lock time (8 bytes LE)
    parts.push(this.writeUint64LE(0n));
    
    // 7. Subnetwork ID (20 bytes)
    parts.push(this.fromHex(subnetworkId));
    
    // 8. Gas (8 bytes LE)
    parts.push(this.writeUint64LE(0n));
    
    // 9. Payload hash
    const payloadBytes = payload ? this.fromHex(payload) : new Uint8Array(0);
    const payloadHash = blake2b(payloadBytes, { dkLen: 32 });
    parts.push(payloadHash);
    
    // 10. Input being signed - outpoint
    const currentInput = inputs[inputIndex];
    const txIdBytes = this.fromHex(currentInput.previousOutpoint.transactionId);
    const txIdReversed = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      txIdReversed[i] = txIdBytes[31 - i];
    }
    parts.push(txIdReversed);
    
    // Input index (4 bytes LE)
    const idxBytes = new Uint8Array(4);
    const idx = currentInput.previousOutpoint.index;
    idxBytes[0] = idx & 0xff;
    idxBytes[1] = (idx >> 8) & 0xff;
    idxBytes[2] = (idx >> 16) & 0xff;
    idxBytes[3] = (idx >> 24) & 0xff;
    parts.push(idxBytes);
    
    // 11. UTXO script version (2 bytes LE)
    const utxoScriptVersion = utxo.utxoEntry?.scriptPublicKey?.version || 0;
    parts.push(this.writeUint16LE(utxoScriptVersion));
    
    // 12. UTXO script public key
    const utxoScript = this.fromHex(utxo.utxoEntry?.scriptPublicKey?.scriptPublicKey || '');
    parts.push(new Uint8Array([utxoScript.length]));
    parts.push(utxoScript);
    
    // 13. UTXO amount (8 bytes LE)
    const utxoAmount = BigInt(utxo.utxoEntry?.amount || 0);
    parts.push(this.writeUint64LE(utxoAmount));
    
    // 14. Sequence of this input (8 bytes LE)
    parts.push(this.writeUint64LE(BigInt(currentInput.sequence || 0)));
    
    // 15. SigOpCount of this input (1 byte)
    parts.push(new Uint8Array([currentInput.sigOpCount || 1]));
    
    // 16. SigHashType (1 byte) - SigHashAll = 0x01
    parts.push(new Uint8Array([0x01]));
    
    // Concatenate all parts
    const totalLength = parts.reduce((sum, p) => sum + p.length, 0);
    const combined = new Uint8Array(totalLength);
    let offset = 0;
    for (const part of parts) {
      combined.set(part, offset);
      offset += part.length;
    }
    
    // Final hash
    return blake2b(combined, { dkLen: 32 });
  }

  disconnect(): void {
    this.privateKey = null;
    this.publicKey = null;
    this.address = '';
    this.connected = false;
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
  return bip39.validateMnemonic(normalized, wordlist);
}

export function validatePrivateKey(key: string): boolean {
  let keyHex = key.trim().toLowerCase();
  if (keyHex.startsWith('0x')) {
    keyHex = keyHex.slice(2);
  }
  return /^[0-9a-f]{64}$/i.test(keyHex);
}
