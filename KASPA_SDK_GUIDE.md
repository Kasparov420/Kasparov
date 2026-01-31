# Kaspa SDK Integration Guide

## 🎯 Goal: Replace Mock Wallet with Real Kaspa Transactions

This guide shows **exactly** how to integrate real Kaspa SDK to achieve K-style cheap transactions.

---

## 📦 Step 1: Install Kaspa SDK

```bash
cd /workspaces/Kasparov/packages/kaspa-tx

# Option A: kaspa-wasm (recommended)
npm install kaspa-wasm

# Option B: @kaspa/core-lib
npm install @kaspa/core-lib

# Additional dependencies
npm install bip39 bip32 # for mnemonic/key derivation
```

---

## 🔑 Step 2: Real Key Management

Replace `/packages/kaspa-tx/src/index.ts` mock methods with real implementations:

### Generate Mnemonic
```typescript
import * as bip39 from 'bip39';

static generateMnemonic(): string {
  // 12-word mnemonic (128 bits entropy)
  return bip39.generateMnemonic(128);
  
  // Or 24-word for extra security (256 bits)
  // return bip39.generateMnemonic(256);
}
```

### Derive Keys
```typescript
import { PrivateKey, Address } from 'kaspa-wasm';
import * as bip32 from 'bip32';
import * as bip39 from 'bip39';

private derivePrivateKey(mnemonic: string): string {
  // Convert mnemonic to seed
  const seed = bip39.mnemonicToSeedSync(mnemonic);
  
  // Derive key using BIP44 path for Kaspa
  // m/44'/111111'/0'/0/0
  // 111111 is Kaspa's coin type
  const root = bip32.fromSeed(seed);
  const child = root.derivePath("m/44'/111111'/0'/0/0");
  
  return child.privateKey!.toString('hex');
}

private deriveAddress(privateKey: string): string {
  // Use kaspa-wasm to get address from private key
  const key = new PrivateKey(privateKey);
  const publicKey = key.toPublicKey();
  const address = publicKey.toAddress('kaspa'); // mainnet
  // Use 'kaspatest' for testnet
  
  return address.toString();
}
```

---

## 💰 Step 3: Real UTXO Fetching

Replace `refreshUTXOPool()`:

```typescript
async refreshUTXOPool(): Promise<void> {
  try {
    // Use Kaspa public API
    const response = await fetch(
      `${this.nodeUrl}/addresses/${this.address}/utxos`
    );
    
    if (!response.ok) {
      throw new Error(`Failed to fetch UTXOs: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Map to our UTXO format
    this.utxoPool = data.entries.map((utxo: any) => ({
      txId: utxo.outpoint.transactionId,
      outputIndex: utxo.outpoint.index,
      amount: BigInt(utxo.utxoEntry.amount),
      scriptPublicKey: utxo.utxoEntry.scriptPublicKey,
    }));
    
    console.log(`Refreshed UTXO pool: ${this.utxoPool.length} UTXOs`);
  } catch (error) {
    console.error('Failed to refresh UTXO pool:', error);
    throw error;
  }
}
```

### Kaspa Node URLs
- **Mainnet:** `https://api.kaspa.org`
- **Testnet:** `https://api-tn10.kaspa.org` or `https://api-tn11.kaspa.org`

---

## 📝 Step 4: Real Transaction Building

Replace `buildTransaction()`:

```typescript
import { Transaction, TransactionInput, TransactionOutput } from 'kaspa-wasm';

private async buildTransaction(
  input: UTXO, 
  payload: Uint8Array
): Promise<Transaction> {
  
  // Calculate fee (kaspa uses "mass" for tx size)
  const estimatedMass = 1000; // Estimate, adjust based on tx
  const feeRate = 1000n; // sompis per mass unit
  const fee = BigInt(estimatedMass) * feeRate;
  
  // Calculate change
  const changeAmount = input.amount - fee;
  
  if (changeAmount < DUST_THRESHOLD) {
    throw new Error('Insufficient funds after fee');
  }
  
  // Create transaction
  const tx = new Transaction();
  
  // Add input
  tx.addInput(new TransactionInput({
    previousOutpoint: {
      transactionId: input.txId,
      index: input.outputIndex,
    },
    signatureScript: '', // Will be filled during signing
    sequence: 0,
  }));
  
  // Add change output (back to ourselves)
  tx.addOutput(new TransactionOutput({
    value: changeAmount,
    scriptPublicKey: this.getScriptPublicKey(),
  }));
  
  // Add data output (OP_RETURN with payload)
  tx.addOutput(new TransactionOutput({
    value: 0n,
    scriptPublicKey: this.createOpReturnScript(payload),
  }));
  
  return tx;
}

private createOpReturnScript(payload: Uint8Array): Uint8Array {
  // OP_RETURN (0x6a) + push data
  const script = new Uint8Array(payload.length + 2);
  script[0] = 0x6a; // OP_RETURN
  script[1] = payload.length; // Push length
  script.set(payload, 2);
  return script;
}
```

---

## ✍️ Step 5: Real Transaction Signing

Replace `signTransaction()`:

```typescript
import { PrivateKey, Transaction } from 'kaspa-wasm';

private signTransaction(tx: Transaction): Transaction {
  const privateKey = new PrivateKey(this.privateKey);
  
  // Sign all inputs
  for (let i = 0; i < tx.inputs.length; i++) {
    const signature = tx.signInput(i, privateKey);
    tx.inputs[i].signatureScript = signature;
  }
  
  return tx;
}
```

---

## 📡 Step 6: Real Broadcasting

Replace `broadcast()`:

```typescript
async broadcast(tx: Transaction): Promise<string> {
  try {
    // Serialize transaction
    const txHex = tx.serialize();
    
    // Broadcast to node
    const response = await fetch(`${this.nodeUrl}/submit-transaction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transaction: txHex }),
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Broadcast failed: ${error}`);
    }
    
    const data = await response.json();
    const txId = data.transactionId;
    
    console.log('Transaction broadcast successfully:', txId);
    return txId;
    
  } catch (error) {
    console.error('Failed to broadcast transaction:', error);
    throw error;
  }
}
```

---

## 🔧 Step 7: UTXO Splitting (K-Style Optimization)

Implement real UTXO splitting:

```typescript
async splitUTXOs(
  count: number = 10, 
  amountPerUtxo: bigint = 10_000_000n
): Promise<TxResult> {
  
  try {
    // Find a large UTXO to split
    const largeUtxo = this.utxoPool
      .filter(u => u.amount > amountPerUtxo * BigInt(count) + 100_000n)
      .sort((a, b) => Number(b.amount - a.amount))[0];
    
    if (!largeUtxo) {
      throw new Error('No UTXO large enough to split');
    }
    
    // Create transaction with multiple outputs
    const tx = new Transaction();
    
    // Add input (the large UTXO)
    tx.addInput(new TransactionInput({
      previousOutpoint: {
        transactionId: largeUtxo.txId,
        index: largeUtxo.outputIndex,
      },
      signatureScript: '',
      sequence: 0,
    }));
    
    // Estimate fee
    const estimatedMass = 1000 + (count * 100); // Rough estimate
    const fee = BigInt(estimatedMass) * 1000n;
    
    // Add multiple outputs to ourselves
    for (let i = 0; i < count; i++) {
      tx.addOutput(new TransactionOutput({
        value: amountPerUtxo,
        scriptPublicKey: this.getScriptPublicKey(),
      }));
    }
    
    // Add change output
    const totalSpent = amountPerUtxo * BigInt(count) + fee;
    const change = largeUtxo.amount - totalSpent;
    
    if (change > DUST_THRESHOLD) {
      tx.addOutput(new TransactionOutput({
        value: change,
        scriptPublicKey: this.getScriptPublicKey(),
      }));
    }
    
    // Sign and broadcast
    const signedTx = this.signTransaction(tx);
    const txId = await this.broadcast(signedTx);
    
    // Wait a bit and refresh UTXO pool
    setTimeout(() => this.refreshUTXOPool(), 2000);
    
    return { success: true, txId };
    
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
```

---

## 🧪 Step 8: Testing on Testnet

### Get Test Funds
1. Go to Kaspa testnet faucet: https://faucet.kaspanet.io/
2. Enter your address
3. Receive 100+ test KAS

### Update Node URL
```typescript
const nodeUrl = "https://api-tn11.kaspa.org";
```

### Test Flow
```typescript
// 1. Create wallet
const wallet = new KaspaWallet({ mnemonic }, testnetNodeUrl);

// 2. Refresh UTXOs
await wallet.refreshUTXOPool();
console.log('UTXOs:', wallet.getInfo());

// 3. Split for rapid posting
await wallet.splitUTXOs(20, 5_000_000n); // 20 UTXOs of 0.05 KAS each

// 4. Publish events
for (let i = 0; i < 10; i++) {
  await wallet.publishEvent({
    type: 'move',
    gameId: 'test123',
    uci: 'e2e4',
    plyNumber: i + 1,
  });
  console.log(`Published move ${i + 1}`);
}
```

---

## 💡 K-Style Best Practices

### 1. Pre-Split Before Gaming Session
```typescript
// At start of session
await wallet.splitUTXOs(50, 10_000_000n);
// Now you can make 50 rapid moves without UTXO issues
```

### 2. Monitor UTXO Pool
```typescript
async checkUTXOHealth(): Promise<{healthy: boolean, count: number}> {
  const count = this.utxoPool.length;
  const healthy = count >= 5;
  
  if (!healthy) {
    console.warn('Low UTXO count, consider splitting');
  }
  
  return { healthy, count };
}
```

### 3. Handle UTXO Exhaustion
```typescript
async publishMove(gameId: string, uci: string): Promise<TxResult> {
  // Check UTXO availability
  const { healthy } = await this.checkUTXOHealth();
  
  if (!healthy) {
    // Try to auto-split if we have funds
    console.log('Auto-splitting UTXOs...');
    await this.splitUTXOs(10);
    await this.refreshUTXOPool();
  }
  
  // Proceed with move
  return this.publishEvent({ type: 'move', gameId, uci, plyNumber: 1 });
}
```

---

## 🔒 Security Checklist

Before mainnet:
- [ ] Use real BIP39 library (not mock generation)
- [ ] Implement proper salt generation (crypto.getRandomValues)
- [ ] Store salt separately from encrypted mnemonic
- [ ] Add password strength requirements (min 12 chars)
- [ ] Implement backup/export flow
- [ ] Add "are you sure?" confirmations
- [ ] Clear warnings about key custody
- [ ] Option to use hardware wallet (future)
- [ ] Rate limiting on tx submissions
- [ ] Fee estimation before broadcasting

---

## 📊 Cost Analysis (Real Numbers)

### Transaction Anatomy
```
Inputs:  1 UTXO     (~200 bytes)
Outputs: 1 change   (~100 bytes)
         1 OP_RETURN (~50 bytes payload)
Total:   ~350 bytes = ~350 mass units
```

### Fee Calculation
```
Fee = mass × feeRate
    = 350 × 1000 sompis
    = 350,000 sompis
    = 0.0035 KAS
```

At $0.10/KAS: **$0.00035 per move**

### 100 Moves
- Total: 0.35 KAS
- Cost: $0.035

Compare to wallet minimum (0.106 KAS):
- 100 txs would be 10.6 KAS = $1.06
- **30x more expensive**

---

## 🚀 Quick Migration Path

### Phase 1: Swap Wallet Implementation
1. Install kaspa-wasm
2. Replace mock methods (above code)
3. Test on testnet
4. Verify tx costs

### Phase 2: Add UTXO Tools
1. Add split UI
2. Add UTXO monitor
3. Auto-split logic

### Phase 3: Production Polish
1. Real encryption
2. Backup flow
3. Error handling
4. Fee estimation

**Total time: 2-3 days for experienced dev**

---

## 📚 Additional Resources

- **Kaspa WASM docs:** https://github.com/kaspanet/rusty-kaspa
- **Kaspa API docs:** https://api.kaspa.org/docs
- **K social code:** https://github.com/thesheepcat/K (reference implementation)
- **BIP44 paths:** https://github.com/satoshilabs/slips/blob/master/slip-0044.md

---

## ✅ Verification Checklist

After integration, verify:
- [ ] Mnemonic generates valid Kaspa addresses
- [ ] UTXOs fetch correctly from API
- [ ] Transactions build with proper structure
- [ ] Signatures validate
- [ ] Transactions broadcast successfully
- [ ] TxIDs returned correctly
- [ ] Payload embedded in OP_RETURN
- [ ] Change outputs work correctly
- [ ] Fee calculation accurate
- [ ] UTXO splitting creates expected outputs

---

**Current Status:** Mock implementation complete, ready for kaspa-wasm integration  
**Next Step:** `npm install kaspa-wasm` and start replacing mock methods  
**Estimated Integration Time:** 2-3 days
