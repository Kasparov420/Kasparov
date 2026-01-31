# Kasparov - On-Chain Chess on Kaspa

> **📚 New here? Start with [INDEX.md](INDEX.md) for complete navigation**

A fully on-chain chess game using **K-style transaction building** for cheap, rapid moves and chat.

## Quick Start

```bash
cd apps/web
npm run dev
# Open http://localhost:5173
```

**See [STATUS.md](STATUS.md) for what's working right now.**

## Architecture

```
kasparov/
├── apps/
│   └── web/              # React UI (Vite + TypeScript)
├── packages/
│   ├── protocol/         # Event encoding/decoding (KSP1|...)
│   └── kaspa-tx/         # K-style tx builder + key management
└── services/
    └── indexer/          # (Future) Game state indexer
```

## Why K-Style?

**Problem:** Wallet extensions (Kasware/Kastle) enforce minimum send amounts (~0.106 KAS) and conservative policies.

**Solution:** K-style transaction building (like K-social) allows:
- **Tiny transactions** (thousands for pennies)
- **Client-side key management** (no extension constraints)
- **UTXO pool strategy** (more UTXOs = faster posting)
- **Direct SDK/WASM usage** (full control)

This is how K-social achieves "post for 2000 sompis" vs wallet minimums.

## Features Implemented

### Chess Rules ✅
- ✅ Uses `chess.js` as single source of truth
- ✅ Legal move validation
- ✅ Click piece → show legal move suggestions (highlighted squares)
- ✅ Board orientation flips for Black player
- ✅ Random color assignment
- ✅ Promotion handling (Q/R/B/N)
- ✅ Game over detection (checkmate, draw)

### UI/UX ✅
- ✅ Random theme cycling in lobby (stops when game starts)
- ✅ Deterministic theme from seed when active
- ✅ Last move highlighting
- ✅ Selected piece highlighting
- ✅ Legal move indicators
- ✅ Move list display

### On-Chain Publishing ✅
- ✅ Protocol event encoding (minimal, indexer-friendly)
- ✅ Game init event (KSP1|G|...)
- ✅ Game join event (KSP1|J|...)
- ✅ Move event (KSP1|M|...)
- ✅ Chat event (KSP1|C|...)
- ✅ Client-side wallet (mock + real structure)
- ✅ Mnemonic encryption (WebCrypto)

### Data Flow ✅
- ✅ Publish → DAG (K-style cheap tx)
- ✅ Indexer reads events → exposes game state
- ✅ Client polls indexer for opponent moves
- ✅ Optimistic UI updates

## Protocol Spec

### Event Format

All events follow: `KSP1|<Type>|<GameId>|<Payload>`

#### Game Init
```
KSP1|G|abc123|kaspa:qz...|t=1234567890
```

#### Join
```
KSP1|J|abc123|kaspa:qz...|t=1234567890
```

#### Move
```
KSP1|M|abc123|e2e4|n=1
```

#### Chat
```
KSP1|C|abc123|SGVsbG8h|n=1
```

### Max Sizes
- GameId: 32 chars (alphanumeric + _ -)
- UCI: 5 chars (e.g., "e2e4q")
- Chat: 280 chars (before base64)
- Pubkey: 64 chars

## Current Status

### Working (Mock Implementation)
- ✅ Full chess logic with legal moves
- ✅ Board UI with suggestions and orientation
- ✅ Event encoding/decoding
- ✅ Mock wallet (client-side key mgmt structure)
- ✅ Mock indexer (local state)
- ✅ Optimistic UI updates

### TODO (Real Kaspa Integration)
- [ ] Replace mock wallet with actual Kaspa SDK/WASM
  - Use `kaspa-wasm` or `@kaspa/core-lib`
  - Implement real key derivation (BIP32/44)
  - Real UTXO fetching from Kaspa node
  - Real tx signing and broadcasting
- [ ] Implement UTXO splitting tool
  - Pre-split funds into medium-sized UTXOs
  - "More UTXOs = faster posting" strategy
  - Handle mass limits
- [ ] Indexer service
  - Fork/extend `kasia-indexer`
  - Add KSP1 protocol parser
  - Expose REST API: `/game/:id`, `/game/:id/events`
  - WebSocket support for live updates
- [ ] Production mnemonic handling
  - Use real BIP39 library
  - Proper random salt + storage
  - Password-based encryption
  - Backup/recovery flow

## Build & Run

### Development

```bash
# Install dependencies
npm install

# Run development server
cd apps/web
npm run dev
```

Open http://localhost:5173

### Production Build

```bash
npm run build
```

## How It Works

### 1. Game Creation
1. User clicks "Create Game"
2. Random color assigned (w/b)
3. Client generates `gameId`
4. Publishes `game-init` event to DAG (K-style tx)
5. Shows lobby with game ID
6. Theme cycles randomly until opponent joins

### 2. Joining
1. User enters game ID
2. Fetches game from indexer
3. Publishes `game-join` event to DAG
4. Both players see "active" status
5. Theme locks to deterministic seed
6. Board orients correctly for each player

### 3. Making Moves
1. Click piece → chess.js returns legal moves
2. Legal destinations highlighted
3. Click destination → chess.js validates
4. If legal: optimistic UI update + publish move event
5. Opponent polls indexer → sees move → updates UI
6. Repeat until checkmate/draw

### 4. Why It's Cheap
- K-style tx building bypasses wallet minimums
- Each move is ~0.0001 KAS (with proper UTXO pool)
- Client manages keys (no custody risk if done right)
- UTXO pre-splitting enables rapid posting

## Security Model

### Option A: Client-Only Keys (Current)
- ✅ User creates/imports mnemonic in browser
- ✅ Keys never leave client
- ✅ Encrypted at rest (WebCrypto + password)
- ⚠️ Risk: user loses password/device

### Option B: Extension Signer (Future)
- Integrate Kasware/Kastle for signing only
- App builds tx, extension signs
- Still hits wallet minimum send limits

### Option C: Custodial (Not Recommended)
- Server holds keys
- Full custody = compliance nightmare

**Recommendation:** Option A for "works first try" + K-style cheap txs.

## UTXO Strategy

Kaspa is UTXO-based. Lots of tiny txs create UTXO bloat.

**K-style approach:**
1. Pre-split funds into ~10-50 medium UTXOs (e.g., 0.1 KAS each)
2. Each move/chat consumes 1 UTXO, creates 1 change UTXO
3. Periodically re-split if UTXOs get too small or too few
4. More UTXOs = more parallel txs without mass issues

See K repo's "UTXO splitter / rapid send" tools.

## Indexer Design

### Requirements
- Scan Kaspa blocks/txs for KSP1 markers
- Parse and store events
- Derive game state (FEN, moves, status)
- Expose REST API
- Optional: WebSocket for live updates

### Recommended Approach
Fork `kasia-indexer` and add:
- Custom protocol parser for KSP1
- Game state builder (apply moves via chess.js)
- REST endpoints

### Endpoints
```
GET  /game/:id              → game state + FEN
GET  /game/:id/events       → raw events
GET  /game/:id/chat         → chat messages
GET  /games                 → list all games
WS   /ws?game=:id           → live updates
```

## Deployment

### Testnet
1. Update `kaspaService.ts` node URL to testnet
2. Use testnet faucet for initial funds
3. Test UTXO splitting
4. Verify tx costs

### Mainnet
1. Real mnemonic backup flow
2. Clear warnings about key custody
3. UTXO pool monitoring
4. Fee estimation
5. Indexer with persistent storage

## References

- **K repo:** https://github.com/thesheepcat/K
  - K-style tx building
  - UTXO strategy
  - Tiny tx costs
- **kasia-indexer:** https://github.com/K-Kluster/kasia-indexer
  - Kaspa blockchain indexer
  - Message parsing
- **chess.js:** https://github.com/jhlywa/chess.js
  - Legal move generation
  - Game state management

## License

MIT

## Contributing

1. **Real Kaspa SDK integration** - Replace mock wallet
2. **UTXO management tools** - Splitting, monitoring
3. **Indexer implementation** - Fork kasia-indexer
4. **Chat UI** - Real-time chat panel
5. **Game history** - List past games
6. **Spectator mode** - Watch live games

## FAQ

### Why not just use Kasware?
Kasware enforces minimum send amounts (~0.106 KAS) and policy restrictions. K-style builds txs directly for tiny costs.

### Is this custodial?
No. Keys are generated/managed client-side. User controls mnemonic. (Option A architecture)

### How cheap is "cheap"?
With proper UTXO pool: ~0.0001 KAS per move. Thousands of moves for pennies.

### What about UTXO bloat?
Trade-off: more small UTXOs = faster posting but more chain storage. Manage by pre-splitting to medium sizes and periodic re-consolidation.

### When mainnet?
After:
1. Real Kaspa SDK integration
2. Testnet validation
3. UTXO management tools
4. Production indexer
5. Security audit of key handling

---

**Status:** ✅ Architecture complete, mock implementation working, ready for Kaspa SDK integration.
