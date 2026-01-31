/**
 * Kaspa integration layer
 * Handles wallet management and on-chain publishing
 */

import kaspa from '@kaspa/core-lib';
import * as bip39 from 'bip39';

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

const KASPA_API_BASE = "https://api.kaspa.org";

/**
 * Real Kaspa Wallet implementation using @kaspa/core-lib
 */
export class KaspaWallet {
  private address: any;
  private mnemonic: string;
  private privateKey: any; // kaspa.PrivateKey
  private hdPublicKey: any;
  private addressString: string = "";

  constructor(mnemonic: string) {
    if (!bip39.validateMnemonic(mnemonic)) {
      throw new Error('Invalid mnemonic phrase');
    }
    this.mnemonic = mnemonic;
  }

  async initialize() {
    if (typeof kaspa.initRuntime === 'function') {
      await kaspa.initRuntime();
    }

    const seed = bip39.mnemonicToSeedSync(this.mnemonic);
    // Correct BIP32 path for Kaspa: m/44'/111111'/0'
    const hdPrivateKey = new kaspa.HDPrivateKey(seed);
    const derived = hdPrivateKey.derive("m/44'/111111'/0'/0/0");
    this.privateKey = derived.privateKey;
    this.address = this.privateKey.toAddress('kaspa');
    this.addressString = this.address.toString();
    
    console.log('Wallet initialized:', this.addressString);
  }

  getAddress(): string {
    return this.addressString;
  }

  async getInfo(): Promise<WalletInfo> {
    try {
      const response = await fetch(`${KASPA_API_BASE}/addresses/${this.addressString}/utxos`);
      if (!response.ok) throw new Error("Failed to fetch UTXOs");
      
      const utxos = await response.json();
      const balance = utxos.reduce((acc: bigint, utxo: any) => {
        return acc + BigInt(utxo.utxoEntry.amount);
      }, 0n);

      return {
        address: this.addressString,
        balance,
        utxoCount: utxos.length,
      };
    } catch (e) {
      console.warn("Assuming 0 balance due to error:", e);
      return {
        address: this.addressString,
        balance: 0n,
        utxoCount: 0,
      };
    }
  }

  async publishInternal(data: string, recipient?: string, amount = 1000n): Promise<PublishResult> {
    try {
        // Fetch UTXOs
        const utxoRes = await fetch(`${KASPA_API_BASE}/addresses/${this.addressString}/utxos`);
        if (!utxoRes.ok) throw new Error("Could not fetch UTXOs");
        const apiUtxos = await utxoRes.json();
        
        if (apiUtxos.length === 0) {
            throw new Error("Insufficient funds (No UTXOs). Please fund your wallet.");
        }

        // Convert API UTXOs to library UTXOs
        const utxos = apiUtxos.map((u: any) => new kaspa.Transaction.UnspentOutput({
            txId: u.outpoint.transactionId,
            outputIndex: u.outpoint.index,
            address: this.addressString,
            script: u.utxoEntry.scriptPublicKey.scriptPublicKey,
            satoshis: u.utxoEntry.amount
        }));

        const tx = new kaspa.Transaction()
            .from(utxos);

        if (recipient) {
             tx.to(recipient, Number(amount));
        }

        // Embed data (OpReturn)
        if (data) {
             tx.addData(data);
        }
        
        tx.change(this.addressString)
          .sign(this.privateKey);

        const serialized = tx.serialize();

        // Broadcast
        const broadcastRes = await fetch(`${KASPA_API_BASE}/transactions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rawTransaction: serialized })
        });

        if (!broadcastRes.ok) {
            const err = await broadcastRes.text();
            throw new Error(`Broadcast failed: ${err}`);
        }

        const result = await broadcastRes.json();
        return {
            success: true,
            txId: result.transactionId
        };

    } catch (error: any) {
        console.error("Transaction failed:", error);
        return {
            success: false,
            error: error.message
        };
    }
  }

  async publishEvent(event: any): Promise<PublishResult> {
    // Minimized payload
    const payload = JSON.stringify(event);
    console.log("Publishing real tx with payload:", payload);
    
    // Self-send small amount with data
    return this.publishInternal(payload, this.addressString, 1000n);
  }
}

/**
 * Kaspa service singleton
 */
class KaspaService {
  private wallet: KaspaWallet | null = null;
  private initialized = false;

  checkExistingWallet(): string | null {
    const stored = localStorage.getItem("kasparov-wallet-address");
    return stored;
  }

  generateNewMnemonic(): string {
    return bip39.generateMnemonic(128); 
  }

  async initialize(mnemonic: string): Promise<void> {
    if (!mnemonic) throw new Error("Mnemonic required");

    this.wallet = new KaspaWallet(mnemonic);
    await this.wallet.initialize(); 
    this.initialized = true;

    localStorage.setItem("kasparov-wallet-address", this.wallet.getAddress());
  }

  getWallet(): KaspaWallet | null {
    return this.wallet;
  }

  getAddress(): string | null {
    return this.wallet?.getAddress() || null;
  }

  // --- Game Methods ---

  async publishGameInit(gameId: string): Promise<PublishResult> {
    if (!this.wallet) return { success: false, error: "Wallet not initialized" };
    return this.wallet.publishEvent({ t: "init", g: gameId });
  }

  async publishGameJoin(gameId: string): Promise<PublishResult> {
    if (!this.wallet) return { success: false, error: "Wallet not initialized" };
    return this.wallet.publishEvent({ t: "join", g: gameId });
  }

  async publishMove(gameId: string, uci: string, ply: number): Promise<PublishResult> {
    if (!this.wallet) return { success: false, error: "Wallet not initialized" };
    return this.wallet.publishEvent({ t: "mv", g: gameId, m: uci, n: ply });
  }

  async publishChat(gameId: string, msg: string, seq: number): Promise<PublishResult> {
    if (!this.wallet) return { success: false, error: "Wallet not initialized" };
    return this.wallet.publishEvent({ t: "chat", g: gameId, m: msg, s: seq });
  }
}

export const kaspaService = new KaspaService();
export default kaspaService;
