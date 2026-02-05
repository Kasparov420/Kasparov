/**
 * Kasparov Chess Transaction Payload Protocol
 *
 * Binary payload format for embedding chess moves in Kaspa transactions
 * Follows K-Social/Kasia pattern: tx payload = app event
 */

export interface MovePayload {
  type: 'move' | 'resign' | 'draw_offer';
  gameId: string; // 16 bytes (UUID or random)
  ply: number;    // 2 bytes (uint16 big endian)
  uci: string;    // 4 bytes (UCI move, e.g., "e2e4", "g1f3")
  prevTxid: string; // 32 bytes (previous move txid, or zeros for first move)
}

export interface ParsedPayload extends MovePayload {
  raw: Uint8Array;
}

// Protocol constants
const MAGIC = new Uint8Array([0x4B, 0x43, 0x48, 0x53, 0x31, 0x00]); // "KCHS1\0"
const VERSION = 0x01;

// Payload types
const PAYLOAD_TYPES = {
  MOVE: 0x01,
  RESIGN: 0x02,
  DRAW_OFFER: 0x03,
} as const;

// Field sizes
const FIELD_SIZES = {
  MAGIC: 6,
  VERSION: 1,
  TYPE: 1,
  GAME_ID: 16,
  PLY: 2,
  MOVE: 4,
  PREV_TXID: 32,
} as const;

const TOTAL_SIZE = Object.values(FIELD_SIZES).reduce((a, b) => a + b, 0);

/**
 * Encode a move payload into binary format
 */
export function encodeMovePayload(payload: MovePayload): Uint8Array {
  const buffer = new Uint8Array(TOTAL_SIZE);
  let offset = 0;

  // MAGIC (6 bytes)
  buffer.set(MAGIC, offset);
  offset += FIELD_SIZES.MAGIC;

  // VERSION (1 byte)
  buffer[offset] = VERSION;
  offset += FIELD_SIZES.VERSION;

  // TYPE (1 byte)
  const typeByte = PAYLOAD_TYPES[payload.type.toUpperCase() as keyof typeof PAYLOAD_TYPES];
  if (!typeByte) throw new Error(`Unknown payload type: ${payload.type}`);
  buffer[offset] = typeByte;
  offset += FIELD_SIZES.TYPE;

  // GAME_ID (16 bytes) - convert string to bytes
  const gameIdBytes = gameIdToBytes(payload.gameId);
  buffer.set(gameIdBytes, offset);
  offset += FIELD_SIZES.GAME_ID;

  // PLY (2 bytes, big endian)
  const plyBytes = new Uint8Array(2);
  plyBytes[0] = (payload.ply >> 8) & 0xFF;
  plyBytes[1] = payload.ply & 0xFF;
  buffer.set(plyBytes, offset);
  offset += FIELD_SIZES.PLY;

  // MOVE (4 bytes) - UCI move as ASCII
  const moveBytes = uciToBytes(payload.uci);
  buffer.set(moveBytes, offset);
  offset += FIELD_SIZES.MOVE;

  // PREV_TXID (32 bytes) - convert hex string to bytes
  const prevTxidBytes = txidToBytes(payload.prevTxid);
  buffer.set(prevTxidBytes, offset);
  offset += FIELD_SIZES.PREV_TXID;

  return buffer;
}

/**
 * Decode a binary payload into MovePayload
 */
export function decodeMovePayload(buffer: Uint8Array): ParsedPayload | null {
  if (buffer.length !== TOTAL_SIZE) {
    return null;
  }

  let offset = 0;

  // Check MAGIC
  const magic = buffer.slice(offset, offset + FIELD_SIZES.MAGIC);
  if (!arraysEqual(magic, MAGIC)) {
    return null;
  }
  offset += FIELD_SIZES.MAGIC;

  // Check VERSION
  const version = buffer[offset];
  if (version !== VERSION) {
    return null;
  }
  offset += FIELD_SIZES.VERSION;

  // TYPE
  const typeByte = buffer[offset];
  const type = Object.entries(PAYLOAD_TYPES).find(([_, v]) => v === typeByte)?.[0].toLowerCase();
  if (!type) {
    return null;
  }
  offset += FIELD_SIZES.TYPE;

  // GAME_ID
  const gameIdBytes = buffer.slice(offset, offset + FIELD_SIZES.GAME_ID);
  const gameId = bytesToGameId(gameIdBytes);
  offset += FIELD_SIZES.GAME_ID;

  // PLY
  const ply = (buffer[offset] << 8) | buffer[offset + 1];
  offset += FIELD_SIZES.PLY;

  // MOVE
  const moveBytes = buffer.slice(offset, offset + FIELD_SIZES.MOVE);
  const uci = bytesToUci(moveBytes);
  offset += FIELD_SIZES.MOVE;

  // PREV_TXID
  const prevTxidBytes = buffer.slice(offset, offset + FIELD_SIZES.PREV_TXID);
  const prevTxid = bytesToTxid(prevTxidBytes);
  offset += FIELD_SIZES.PREV_TXID;

  return {
    type: type as MovePayload['type'],
    gameId,
    ply,
    uci,
    prevTxid,
    raw: buffer,
  };
}

/**
 * Convert game ID string to 16 bytes
 * For now, use the first 16 bytes of the string as bytes
 */
function gameIdToBytes(gameId: string): Uint8Array {
  const bytes = new Uint8Array(16);
  const encoder = new TextEncoder();
  const encoded = encoder.encode(gameId);
  bytes.set(encoded.slice(0, 16));
  return bytes;
}

/**
 * Convert 16 bytes back to game ID string
 */
function bytesToGameId(bytes: Uint8Array): string {
  const decoder = new TextDecoder('ascii');
  return decoder.decode(bytes).replace(/\0/g, '');
}

/**
 * Convert UCI move to 4 bytes (ASCII)
 */
function uciToBytes(uci: string): Uint8Array {
  const bytes = new Uint8Array(4);
  const encoder = new TextEncoder();
  const encoded = encoder.encode(uci);
  bytes.set(encoded.slice(0, 4));
  return bytes;
}

/**
 * Convert 4 bytes back to UCI string
 */
function bytesToUci(bytes: Uint8Array): string {
  const decoder = new TextDecoder('ascii');
  return decoder.decode(bytes).replace(/\0/g, '');
}

/**
 * Convert txid hex string to 32 bytes
 */
function txidToBytes(txid: string): Uint8Array {
  if (txid === '' || txid === '0'.repeat(64)) {
    return new Uint8Array(32); // All zeros for first move
  }
  return fromHex(txid);
}

/**
 * Convert 32 bytes back to txid hex string
 */
function bytesToTxid(bytes: Uint8Array): string {
  return toHex(bytes);
}

/**
 * Simple hash function for game IDs (djb2-like)
 */
function simpleHash(str: string): Uint8Array {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
  }

  // Convert to 32 bytes
  const result = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    result[i] = (hash >> (i * 8)) & 0xFF;
  }
  return result;
}

/**
 * Check if two Uint8Arrays are equal
 */
function arraysEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Convert hex string to Uint8Array
 */
function fromHex(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error('Invalid hex length');
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

/**
 * Convert Uint8Array to hex string
 */
function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Validate payload format
 */
export function isValidPayload(buffer: Uint8Array): boolean {
  return decodeMovePayload(buffer) !== null;
}

/**
 * Get payload hash for verification
 */
export function getPayloadHash(payload: Uint8Array): string {
  // Simple hash for now - could use blake2b
  return toHex(simpleHash(toHex(payload)).slice(0, 16));
}