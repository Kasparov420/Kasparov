# Kaspa Chess (Web) — runnable today

This repo is a **fully functioning chess website** (lobby -> join -> play -> resign/draw) with **server-side move validation**.

It does **not** implement trustless winner-takes-all staking on Kaspa L1 (that cannot be done today without either:
- an arbiter/federation signer, or
- future Kaspa programmability such as vProgs/covenants).

## Run locally / Codespaces

```bash
npm install
npm run dev
```

- Web: http://localhost:5173
- API: http://localhost:8787/api/health

In Codespaces, open forwarded port **5173** in the Ports tab.

## Next steps (Kaspa integration)

1) Replace `txid = offchain_*` with real Kaspa tx broadcast for each move:
   - build a transaction that includes `payload` (binary `KCHESS1` record)
   - submit via kaspad RPC
2) Add an indexer that reads tx payloads from your node and reconstructs games.
3) For real staking winner-takes-all:
   - you need either a 2-of-3 (arbiter/federation) escrow, or wait for programmability.
