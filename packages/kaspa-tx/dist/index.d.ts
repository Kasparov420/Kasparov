/**
 * K-style Transaction Builder
 *
 * This module handles:
 * 1. Client-side key management (mnemonic generation/import)
 * 2. UTXO pool management (for cheap, rapid transactions)
 * 3. Transaction building with embedded payloads
 * 4. Broadcasting to Kaspa network
 *
 * CRITICAL: Keys never leave the browser. Mnemonic is encrypted at rest.
 */
import { type ProtocolEvent } from "@kasparov/protocol";
export interface WalletConfig {
    mnemonic: string;
    password?: string;
}
export interface UTXO {
    txId: string;
    outputIndex: number;
    amount: bigint;
    scriptPublicKey: string;
}
export interface TxResult {
    txId: string;
    success: boolean;
    error?: string;
}
/**
 * Kaspa Wallet Manager (client-side only)
 */
export declare class KaspaWallet {
    private mnemonic;
    private address;
    private privateKey;
    private utxoPool;
    private nodeUrl;
    constructor(config: WalletConfig, nodeUrl?: string);
    /**
     * Generate new mnemonic (client-side)
     */
    static generateMnemonic(): string;
    /**
     * Encrypt mnemonic for localStorage
     */
    static encryptMnemonic(mnemonic: string, password: string): Promise<string>;
    /**
     * Decrypt mnemonic from localStorage
     */
    static decryptMnemonic(encrypted: string, password: string): Promise<string>;
    getAddress(): string;
    /**
     * Fetch UTXOs for this address
     */
    refreshUTXOPool(): Promise<void>;
    /**
     * Split UTXOs into smaller chunks for rapid posting
     * (K-style: more UTXOs = faster posting)
     */
    splitUTXOs(count?: number, amountPerUtxo?: bigint): Promise<TxResult>;
    /**
     * Publish event to DAG (K-style cheap transaction)
     */
    publishEvent(event: ProtocolEvent): Promise<TxResult>;
    /**
     * Select a UTXO from pool (prefer medium-sized for stability)
     */
    private selectUTXO;
    /**
     * Build transaction with embedded payload
     */
    private buildTransaction;
    /**
     * Sign transaction
     */
    private signTransaction;
    /**
     * Broadcast transaction to network
     */
    private broadcast;
    private derivePrivateKey;
    private deriveAddress;
    private getScriptPublicKey;
    private embedPayload;
}
export default KaspaWallet;
