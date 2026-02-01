/**
 * Tight Event Codec for Kasparov Chess
 * 
 * Keep payloads < 150 bytes for safe relay
 * Use fixed ASCII prefixes, no JSON
 */

// Event prefixes
const PREFIX = 'KC'; // Kasparov Chess

export type GameEvent = 
  | { type: 'init'; gameId: string; pubkey: string }
  | { type: 'join'; gameId: string; pubkey: string }
  | { type: 'move'; gameId: string; ply: number; uci: string }
  | { type: 'chat'; gameId: string; seq: number; msg: string }
  | { type: 'resign'; gameId: string; pubkey: string }
  | { type: 'draw'; gameId: string; pubkey: string };

/**
 * Encode event to compact payload string
 * Format: KC|<type>|<gameId>|<data...>
 * 
 * Examples:
 *   GI|abc123|kaspa:qr...  (game init)
 *   GJ|abc123|kaspa:qr...  (game join)
 *   GM|abc123|1|e2e4       (move)
 *   GC|abc123|0|SGVsbG8=   (chat, base64)
 */
export function encodeEvent(event: GameEvent): string {
  switch (event.type) {
    case 'init':
      return `${PREFIX}|GI|${event.gameId}|${shortenPubkey(event.pubkey)}`;
    case 'join':
      return `${PREFIX}|GJ|${event.gameId}|${shortenPubkey(event.pubkey)}`;
    case 'move':
      return `${PREFIX}|GM|${event.gameId}|${event.ply}|${event.uci}`;
    case 'chat': {
      const msgB64 = btoa(event.msg).slice(0, 60); // Limit base64 length
      return `${PREFIX}|GC|${event.gameId}|${event.seq}|${msgB64}`;
    }
    case 'resign':
      return `${PREFIX}|GR|${event.gameId}|${shortenPubkey(event.pubkey)}`;
    case 'draw':
      return `${PREFIX}|GD|${event.gameId}|${shortenPubkey(event.pubkey)}`;
  }
}

/**
 * Decode payload string to event
 */
export function decodeEvent(payload: string): GameEvent | null {
  try {
    const parts = payload.split('|');
    if (parts[0] !== PREFIX || parts.length < 3) return null;
    
    const type = parts[1];
    const gameId = parts[2];
    
    switch (type) {
      case 'GI':
        return { type: 'init', gameId, pubkey: parts[3] || '' };
      case 'GJ':
        return { type: 'join', gameId, pubkey: parts[3] || '' };
      case 'GM':
        return { type: 'move', gameId, ply: parseInt(parts[3], 10), uci: parts[4] || '' };
      case 'GC': {
        const msgB64 = parts[4] || '';
        const msg = atob(msgB64);
        return { type: 'chat', gameId, seq: parseInt(parts[3], 10), msg };
      }
      case 'GR':
        return { type: 'resign', gameId, pubkey: parts[3] || '' };
      case 'GD':
        return { type: 'draw', gameId, pubkey: parts[3] || '' };
      default:
        return null;
    }
  } catch {
    return null;
  }
}

/**
 * Shorten pubkey/address for payload (last 12 chars)
 */
function shortenPubkey(pubkey: string): string {
  // Keep last 12 chars of address for identification
  return pubkey.slice(-12);
}

/**
 * Check if payload is within safe size limit
 */
export function isPayloadSafe(payload: string): boolean {
  return new TextEncoder().encode(payload).length <= 150;
}
