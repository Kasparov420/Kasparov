export type KaspaNetwork =
  | "kaspa_mainnet"
  | "kaspa_testnet_12"
  | "kaspa_testnet_11"
  | "kaspa_testnet_10"
  | "kaspa_devnet";

export type WalletSession = {
  kind: "kasware" | "kastle";
  address: string;
  publicKey?: string;
  network: KaspaNetwork;
};

export function detectWallets() {
  return {
    kasware: typeof (window as any).kasware !== "undefined",
    kastle: typeof (window as any).kastle !== "undefined",
  };
}

async function switchIfNeeded(provider: any, target: KaspaNetwork) {
  const cur = await provider.getNetwork?.();
  if (cur && cur === target) return;
  await provider.switchNetwork?.(target);
}

export async function connectKasware(network: KaspaNetwork): Promise<WalletSession> {
  const w = (window as any).kasware;
  if (!w) throw new Error("Kasware not installed");

  await switchIfNeeded(w, network);

  const accounts: string[] = await w.requestAccounts();
  if (!accounts?.length) throw new Error("Kasware: no accounts returned");

  const address = accounts[0];
  const publicKey = await w.getPublicKey?.();
  const net = (await w.getNetwork?.()) as KaspaNetwork;

  return { kind: "kasware", address, publicKey, network: net ?? network };
}

export async function connectKastle(network: KaspaNetwork): Promise<WalletSession> {
  const w = (window as any).kastle;
  if (!w) throw new Error("Kastle not installed");

  await switchIfNeeded(w, network);

  const accounts: string[] = await w.requestAccounts?.();
  if (!accounts?.length) throw new Error("Kastle: no accounts returned");

  const address = accounts[0];
  const publicKey = await w.getPublicKey?.();
  const net = (await w.getNetwork?.()) as KaspaNetwork;

  return { kind: "kastle", address, publicKey, network: net ?? network };
}

export async function sendMoveTx(
  session: WalletSession,
  move: { gameId: string; uci: string; fen: string }
) {
  const payload = JSON.stringify({
    v: 1,
    kind: "kasparov-move",
    gameId: move.gameId,
    uci: move.uci,
    fen: move.fen,
    ts: Date.now(),
  });

  // IMPORTANT:
  // Without smart contracts/vProgs, the chain cannot enforce legality or payouts.
  // This just logs moves as real L1 txs.

  const sompiDust = 1000; // keep minimal; wallet may enforce minimum output rules
  const priorityFee = 0;

  if (session.kind === "kasware") {
    const w = (window as any).kasware;
    // Kasware sendKaspa(toAddress, sompi, {priorityFee, payload})
    return await w.sendKaspa(session.address, sompiDust, { priorityFee, payload });
  }

  if (session.kind === "kastle") {
    const w = (window as any).kastle;
    if (!w.sendKaspa) throw new Error("Kastle: sendKaspa not found on provider");
    return await w.sendKaspa(session.address, sompiDust, { priorityFee, payload });
  }
}
