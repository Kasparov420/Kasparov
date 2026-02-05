export type KaspaNetwork =
  | "kaspa_mainnet"
  | "kaspa_testnet_12"
  | "kaspa_testnet_11"
  | "kaspa_testnet_10"
  | "kaspa_devnet";

export type WalletSession = {
  kind: "kasware" | "kastle" | "internal";
  address: string;
  publicKey?: string;
  network: KaspaNetwork;
};

const MAX_PAYLOAD_BYTES = 100;

type ProviderProbe = {
  label: string
  exists: boolean
  keys: string[]
  funcs: string[]
  nested: Array<{ key: string; exists: boolean; keys: string[]; funcs: string[] }>
}

function listProviderMethods(p: any): string[] {
  if (!p) return []
  const keys = Reflect.ownKeys(p)
  const funcs: string[] = []
  for (const k of keys) {
    try {
      if (typeof (p as any)[k] === 'function') funcs.push(String(k))
    } catch {
      // ignore proxy getter errors
    }
  }
  return funcs
}

function probeProvider(label: string, p: any): ProviderProbe {
  if (!p) return { label, exists: false, keys: [], funcs: [], nested: [] }
  const keys = Reflect.ownKeys(p).map((k) => String(k))
  const funcs = listProviderMethods(p)
  const nestedKeys = ['kaspa', 'provider', 'wallet']
  const nested = nestedKeys.map((key) => {
    const child = p?.[key]
    const childKeys = child ? Reflect.ownKeys(child).map((k) => String(k)) : []
    const childFuncs = listProviderMethods(child)
    return { key, exists: !!child, keys: childKeys, funcs: childFuncs }
  })
  return { label, exists: true, keys, funcs, nested }
}

function pickProvider(candidate: any) {
  if (!candidate) return null
  if (typeof candidate === 'function') return null
  if (candidate.sendKaspa || candidate.requestAccounts || candidate.connect || candidate.getAccounts || candidate.enable || candidate.request) return candidate
  for (const key of ['kaspa', 'provider', 'wallet']) {
    const child = candidate?.[key]
    if (child && (child.sendKaspa || child.requestAccounts || child.connect || child.getAccounts || child.enable || child.request)) return child
  }
  return null
}

function getProvider(kind: "kasware" | "kastle") {
  const w = window as any;
  const candidates = kind === "kasware"
    ? [w.kasware, w.kaspa?.kasware, w.kaspaWallet, w.kaspa?.wallets?.kasware]
    : [
        w.kastle,
        w.kastleWallet,
        w.kaspa?.kastle,
        w.kaspa?.wallets?.kastle,
        w.kaspaWallet,
        w.kaspa?.wallet,
      ];

  for (const c of candidates) {
    const p = pickProvider(c)
    if (p) return p
  }
  return null
}

function normalizeAccounts(input: any): string[] {
  if (!input) return [];
  if (Array.isArray(input)) {
    if (typeof input[0] === "string") return input as string[];
    if (typeof input[0]?.address === "string") return input.map((a) => a.address);
  }
  if (typeof input.address === "string") return [input.address];
  if (Array.isArray(input.accounts)) return normalizeAccounts(input.accounts);
  if (Array.isArray(input.addresses)) return normalizeAccounts(input.addresses);
  if (typeof input.selectedAddress === "string") return [input.selectedAddress];
  if (typeof input.selectedAccount?.address === "string") return [input.selectedAccount.address];
  if (input.result) return normalizeAccounts(input.result);
  if (input.data) return normalizeAccounts(input.data);
  return [];
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function formatWalletError(e: any) {
  try {
    if (!e) return 'Unknown error'
    if (typeof e === 'string') return e
    if (e instanceof Error) return e.message
    return JSON.stringify(e, Object.getOwnPropertyNames(e))
  } catch {
    return String(e)
  }
}

function toBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function ensurePayloadBytes(payload: string) {
  const size = toBytes(payload).length;
  if (size > MAX_PAYLOAD_BYTES) {
    throw new Error(`payload too large (${size} bytes > ${MAX_PAYLOAD_BYTES})`);
  }
}

function buildMovePayload(gameId: string, uci: string, index: number) {
  const payload = `KC|g:${gameId}|m:${uci}|i:${index}`;
  ensurePayloadBytes(payload);
  return payload;
}

function buildChatPayloads(gameId: string, message: string) {
  const msgBytes = toBytes(message);
  const payloads: string[] = [];
  let offset = 0;
  let index = 0;

  while (offset < msgBytes.length) {
    const prefix = `KC|g:${gameId}|c:`;
    const suffixBase = `|i:${index}`;
    const maxBase64Len = MAX_PAYLOAD_BYTES - toBytes(prefix + suffixBase).length;
    if (maxBase64Len <= 0) throw new Error('payload cap too small for chat');

    let maxChunkBytes = Math.floor((maxBase64Len / 4) * 3);
    if (maxChunkBytes <= 0) throw new Error('payload cap too small for chat');

    let end = Math.min(msgBytes.length, offset + maxChunkBytes);
    let chunk = msgBytes.slice(offset, end);
    let base64 = bytesToBase64(chunk);
    let payload = `${prefix}${base64}${suffixBase}`;

    while (toBytes(payload).length > MAX_PAYLOAD_BYTES && end > offset) {
      end -= 1;
      chunk = msgBytes.slice(offset, end);
      base64 = bytesToBase64(chunk);
      payload = `${prefix}${base64}${suffixBase}`;
    }

    ensurePayloadBytes(payload);
    payloads.push(payload);
    offset = end;
    index += 1;
  }

  return payloads;
}

// Minimal tx amounts to fixed address
export const GAME_CREATE_ADDRESS = "kaspa:qr6vs4wy4m3za6mzchj05x3902qrtklkyn8s0u8g2gv6mrctzdzx7pnhqxka2";
export const GAME_CREATE_AMOUNT = 100000000; // 1 KAS
export const MOVE_TX_AMOUNT = 100000000; // 1 KAS
export const CHAT_TX_AMOUNT = 100000000; // 1 KAS

// Send with a single wallet API variant to avoid multiple signature prompts
async function sendWithWallet(provider: any, to: string, amount: number) {
  const amountSompi = Math.trunc(amount);
  const amountKas = (amountSompi / 1e8).toFixed(8);
  const arity = provider?.sendKaspa?.length ?? 0;
  const useObject = arity <= 1;

  console.log('Attempting send:', { to, amount: amountSompi, amountKas, arity, note: 'network fee goes to miners' });

  try {
    if (useObject) {
      return await provider.sendKaspa({ address: to, amount: amountSompi });
    }
    return await provider.sendKaspa(to, amountSompi);
  } catch (e: any) {
    console.error('sendKaspa failed', e?.message ?? e);
    throw e;
  }
}



export async function sendGameInitTx(session: WalletSession, gameId: string) {
  // Minimal transaction to fixed address
  const to = GAME_CREATE_ADDRESS;

  const provider = getProvider(session.kind);
  if (!provider?.sendKaspa) throw new Error(`${session.kind}: sendKaspa missing`);

  console.log('Game init: minimal tx', { to, amount: GAME_CREATE_AMOUNT });

  try {
    const ret = await sendWithWallet(provider, to, GAME_CREATE_AMOUNT);
    console.log('Game init tx result:', ret);
    return ret;
  } catch (e: any) {
    console.error("GAME INIT FAILED", e?.message, e);
    throw e;
  }
}

async function buildKaswareScript(provider: any, contentType: string, payload: string, payloadBytes: Uint8Array) {
  if (!provider?.buildScript) throw new Error('Kasware buildScript not available');
  const payloadText = String(payload ?? '')
  if (!payloadText) throw new Error('Kasware buildScript payload is empty')
  const arity = provider.buildScript.length ?? 0
  const attempts: Array<() => Promise<any>> = []

  attempts.push(
    () => provider.buildScript({ mimeType: contentType, data: payloadText }),
    () => provider.buildScript({ contentType: contentType, data: payloadText }),
    () => provider.buildScript({ type: contentType, data: payloadText })
  )

  if (arity <= 1) {
    attempts.push(
      () => provider.buildScript(payloadText),
      () => provider.buildScript(payloadBytes),
      () => provider.buildScript(payloadBytes.buffer)
    )
  } else {
    attempts.push(
      () => provider.buildScript(payloadText, contentType),
      () => provider.buildScript(payloadBytes, contentType),
      () => provider.buildScript(payloadBytes.buffer, contentType),
      () => provider.buildScript(payloadText),
      () => provider.buildScript(payloadBytes),
      () => provider.buildScript(payloadBytes.buffer)
    )
  }

  let lastError: any = null
  for (const attempt of attempts) {
    try {
      const result = await attempt()
      if (result) return result
    } catch (e) {
      lastError = e
    }
  }

  throw new Error(`Kasware buildScript failed: ${formatWalletError(lastError)}`)
}

function extractTxids(result: any): string[] {
  if (!result) return [];
  if (Array.isArray(result)) return result.filter((v) => typeof v === 'string');
  if (typeof result === 'string') return [result];
  const candidates = [
    result.commitTxId,
    result.commitTxid,
    result.commitTx,
    result.revealTxId,
    result.revealTxid,
    result.revealTx,
    result.txid,
    result.txId,
  ].filter((v) => typeof v === 'string');
  return candidates as string[];
}

async function submitKaswareCommitReveal(provider: any, script: any) {
  if (!provider?.submitCommitReveal) throw new Error('Kasware submitCommitReveal not available');
  try {
    return await provider.submitCommitReveal({ script });
  } catch {}
  return await provider.submitCommitReveal(script);
}

async function sendCommitRevealInscription(provider: any, payload: string): Promise<string[]> {
  ensurePayloadBytes(payload);
  console.log('Kasware API introspect:', {
    keys: Reflect.ownKeys(provider),
    buildScript: typeof provider.buildScript,
    buildScriptLen: provider.buildScript?.length,
    submitCommitReveal: typeof provider.submitCommitReveal,
    sendKaspaLen: provider.sendKaspa?.length,
  });
  if (typeof provider.buildScript !== 'function' || typeof provider.submitCommitReveal !== 'function') {
    throw new Error('commit/reveal inscription APIs not available')
  }
  const payloadBytes = toBytes(payload);
  const script = await buildKaswareScript(provider, 'text/plain', payload, payloadBytes);
  if (!script) throw new Error('Kasware buildScript returned empty script');
  const result = await submitKaswareCommitReveal(provider, script);
  const txids = extractTxids(result);
  if (!txids.length) throw new Error('No txid returned from Kasware commit/reveal');
  return txids;
}

async function sendKastleInscription(provider: any, network: KaspaNetwork, payload: string): Promise<string[]> {
  ensurePayloadBytes(payload)
  if (typeof provider.signAndBroadcastTx !== 'function') {
    throw new Error('Kastle signAndBroadcastTx not available')
  }

  const net = network === 'kaspa_mainnet'
    ? 'mainnet'
    : network === 'kaspa_testnet_10'
      ? 'testnet-10'
      : network === 'kaspa_testnet_11'
        ? 'testnet-11'
        : network === 'kaspa_testnet_12'
          ? 'testnet-12'
          : 'devnet'

  const variants: Array<() => Promise<any>> = [
    () => provider.signAndBroadcastTx(net, { payload }),
    () => provider.signAndBroadcastTx(net, { contentType: 'text/plain', data: payload }),
    () => provider.signAndBroadcastTx(net, { type: 'text', data: payload }),
    () => provider.signAndBroadcastTx(net, { data: payload }),
    () => provider.signAndBroadcastTx(net, payload),
  ]

  let lastError: any = null
  for (const attempt of variants) {
    try {
      const res = await attempt()
      const txids = extractTxids(res)
      if (txids.length) return txids
      if (typeof res === 'string') return [res]
      if (res?.txid) return [res.txid]
      if (res?.txId) return [res.txId]
    } catch (e) {
      lastError = e
    }
  }

  throw new Error(`Kastle signAndBroadcastTx failed: ${formatWalletError(lastError)}`)
}

export function detectWallets() {
  const kasware = !!getProvider("kasware");
  const kastle = !!getProvider("kastle");
  return {
    kasware,
    kastle,
  };
}

async function checkNetwork(provider: any, target: KaspaNetwork, walletName: string) {
  try {
    const cur = await provider.getNetwork?.();
    console.log(`${walletName} network:`, cur);
    
    if (cur && cur !== target) {
      throw new Error(`Please switch ${walletName} to ${target} manually`);
    }
  } catch (e: any) {
    console.warn(`Could not verify ${walletName} network:`, e);
    // Don't throw - let the transaction fail if network is wrong
  }
}

export async function connectKasware(network: KaspaNetwork): Promise<WalletSession> {
  const w = getProvider("kasware");
  if (!w) throw new Error("Kasware not installed");

  console.log('Kasware API:', {
    keys: Object.keys(w),
    buildScript: typeof w.buildScript,
    submitCommitReveal: typeof w.submitCommitReveal,
    sendKaspaLen: w.sendKaspa?.length
  });

  let accounts: string[] = [];

  if (w.requestAccounts) {
    accounts = await w.requestAccounts();
  } else if (w.enable) {
    const res = await w.enable();
    accounts = res?.accounts ?? [];
  } else if (w.connect) {
    await w.connect();
    accounts = w.accounts || [];
  } else if (w.getAccounts) {
    accounts = await w.getAccounts();
  }

  if (!accounts?.length) throw new Error("Kasware: no accounts");

  const address = accounts[0];
  const publicKey = await w.getPublicKey?.();
  const net = (await w.getNetwork?.()) as KaspaNetwork;

  await checkNetwork(w, network, 'Kasware');

  return { kind: "kasware", address, publicKey, network: net ?? network };
}

export async function connectKastle(network: KaspaNetwork): Promise<WalletSession> {
  const w = getProvider("kastle");
  const root = (window as any).kastle ?? (window as any).kastleWallet
  const probe = probeProvider('kastle', root)
  if (!w) {
    const detail = !probe.exists ? 'Kastle provider not injected' : `Kastle provider has no callable methods`;
    throw new Error(`Kastle: ${detail}. Check extension site access. Probe: ${JSON.stringify(probe)}`);
  }

  const kastleKeys = Reflect.ownKeys(w).map((k) => String(k));
  const kastleMethods = listProviderMethods(w);
  console.log('Kastle API:', {
    keys: kastleKeys,
    methods: kastleMethods,
    probe
  });

  try {
    const mapNetwork = (net: KaspaNetwork) => {
      if (net === 'kaspa_mainnet') return 'mainnet'
      if (net === 'kaspa_testnet_10') return 'testnet-10'
      if (net === 'kaspa_testnet_11') return 'testnet-11'
      if (net === 'kaspa_testnet_12') return 'testnet-12'
      return 'devnet'
    }

    if (typeof w.connect === 'function') {
      await w.connect(mapNetwork(network))
    }

    if (typeof w.getAccount === 'function') {
      const acct = await w.getAccount()
      const address = acct?.address || acct?.account?.address
      const publicKey = acct?.publicKey || acct?.account?.publicKey
      if (!address || typeof address !== 'string') {
        throw new Error('Kastle: getAccount returned no address')
      }
      return { kind: 'kastle', address, publicKey, network }
    }

    let accounts: string[] = []
    if (typeof w.requestAccounts === 'function') {
      accounts = normalizeAccounts(await w.requestAccounts())
    } else if (typeof w.enable === 'function') {
      accounts = normalizeAccounts(await w.enable())
    } else if (typeof w.getAccounts === 'function') {
      accounts = normalizeAccounts(await w.getAccounts())
    }

    if (!accounts?.length) {
      const methods = kastleMethods.length ? kastleMethods.join(', ') : 'none'
      throw new Error(`Kastle: Could not get accounts. Please unlock Kastle and approve the connection. Methods: ${methods}`)
    }

    const address = accounts[0]
    const publicKey = await w.getPublicKey?.().catch(() => undefined)
    const net = (await w.getNetwork?.().catch(() => network)) as KaspaNetwork

    await checkNetwork(w, network, 'Kastle')

    return { kind: "kastle", address, publicKey, network: net ?? network }
  } catch (e: any) {
    console.error('Kastle connection error:', e);
    throw new Error(`Kastle connection failed: ${formatWalletError(e)}`);
  }
}

export async function sendMoveTx(session: WalletSession, move: { gameId: string; uci: string; i?: number }) {
  const provider = getProvider(session.kind);
  if (!provider) throw new Error(`${session.kind}: provider missing`);
  if (session.kind !== 'kasware' && typeof provider.signAndBroadcastTx !== 'function') {
    throw new Error(`${session.kind}: inscriptions not supported`);
  }

  const index = Number.isFinite(move.i) ? Number(move.i) : 0;
  const payload = buildMovePayload(move.gameId, move.uci, index);

  try {
    const txids = session.kind === 'kastle'
      ? await sendKastleInscription(provider, session.network, payload)
      : await sendCommitRevealInscription(provider, payload);
    console.log('Move inscription txids:', txids);
    return txids;
  } catch (e: any) {
    console.error("MOVE FAILED", e?.message, e);
    throw e;
  }
}

export async function sendChatTx(session: WalletSession, gameId: string, message: string) {
  const provider = getProvider(session.kind);
  if (!provider) throw new Error(`${session.kind}: provider missing`);
  if (session.kind !== 'kasware' && typeof provider.signAndBroadcastTx !== 'function') {
    throw new Error(`${session.kind}: inscriptions not supported`);
  }

  const payloads = buildChatPayloads(gameId, message);
  const txids: string[] = [];

  for (const payload of payloads) {
    const result = session.kind === 'kastle'
      ? await sendKastleInscription(provider, session.network, payload)
      : await sendCommitRevealInscription(provider, payload);
    txids.push(...result);
  }

  console.log('Chat inscription txids:', txids);
  return txids;
}
