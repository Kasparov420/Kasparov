/**
 * Kasparov Protocol - On-chain event encoding/decoding
 *
 * Format: KSP1|<EventType>|<GameId>|<Payload>
 *
 * Event Types:
 * - G: Game Init (whitePub|timestamp)
 * - J: Join (blackPub|timestamp)
 * - M: Move (uci|plyNumber)
 * - C: Chat (base64(message)|seqNumber)
 */
const PROTOCOL_PREFIX = "KSP1";
const MAX_GAME_ID_LENGTH = 32;
const MAX_UCI_LENGTH = 5; // e.g., "e2e4q"
const MAX_CHAT_LENGTH = 280; // characters before base64
const MAX_PUBKEY_LENGTH = 64; // kaspa address/pubkey
class ValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = "ValidationError";
    }
}
function validateGameId(gameId) {
    if (!gameId || gameId.length > MAX_GAME_ID_LENGTH) {
        throw new ValidationError(`gameId must be 1-${MAX_GAME_ID_LENGTH} chars`);
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(gameId)) {
        throw new ValidationError("gameId must be alphanumeric with _ or -");
    }
}
function validatePubkey(pub) {
    if (!pub || pub.length > MAX_PUBKEY_LENGTH) {
        throw new ValidationError(`pubkey must be 1-${MAX_PUBKEY_LENGTH} chars`);
    }
}
function validateUci(uci) {
    if (!uci || uci.length > MAX_UCI_LENGTH) {
        throw new ValidationError(`UCI must be 1-${MAX_UCI_LENGTH} chars`);
    }
    // Basic UCI format: e2e4, e7e8q
    if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) {
        throw new ValidationError("Invalid UCI format");
    }
}
function validateChat(message) {
    if (!message || message.length > MAX_CHAT_LENGTH) {
        throw new ValidationError(`Chat must be 1-${MAX_CHAT_LENGTH} chars`);
    }
}
export function encodeEvent(event) {
    let payload;
    switch (event.type) {
        case "game-init":
            validateGameId(event.gameId);
            validatePubkey(event.whitePub);
            payload = `${PROTOCOL_PREFIX}|G|${event.gameId}|${event.whitePub}|t=${event.timestamp}`;
            break;
        case "game-join":
            validateGameId(event.gameId);
            validatePubkey(event.blackPub);
            payload = `${PROTOCOL_PREFIX}|J|${event.gameId}|${event.blackPub}|t=${event.timestamp}`;
            break;
        case "move":
            validateGameId(event.gameId);
            validateUci(event.uci);
            payload = `${PROTOCOL_PREFIX}|M|${event.gameId}|${event.uci}|n=${event.plyNumber}`;
            break;
        case "chat":
            validateGameId(event.gameId);
            validateChat(event.message);
            const encoded = btoa(event.message);
            payload = `${PROTOCOL_PREFIX}|C|${event.gameId}|${encoded}|n=${event.seqNumber}`;
            break;
        default:
            throw new ValidationError("Unknown event type");
    }
    return new TextEncoder().encode(payload);
}
export function decodeEvent(bytes) {
    const text = new TextDecoder().decode(bytes);
    const parts = text.split("|");
    if (parts[0] !== PROTOCOL_PREFIX) {
        throw new ValidationError("Invalid protocol prefix");
    }
    const eventType = parts[1];
    const gameId = parts[2];
    switch (eventType) {
        case "G": {
            const whitePub = parts[3];
            const tsMatch = parts[4]?.match(/^t=(\d+)$/);
            if (!tsMatch)
                throw new ValidationError("Invalid timestamp format");
            return {
                type: "game-init",
                gameId,
                whitePub,
                timestamp: parseInt(tsMatch[1], 10),
            };
        }
        case "J": {
            const blackPub = parts[3];
            const tsMatch = parts[4]?.match(/^t=(\d+)$/);
            if (!tsMatch)
                throw new ValidationError("Invalid timestamp format");
            return {
                type: "game-join",
                gameId,
                blackPub,
                timestamp: parseInt(tsMatch[1], 10),
            };
        }
        case "M": {
            const uci = parts[3];
            const nMatch = parts[4]?.match(/^n=(\d+)$/);
            if (!nMatch)
                throw new ValidationError("Invalid ply number format");
            return {
                type: "move",
                gameId,
                uci,
                plyNumber: parseInt(nMatch[1], 10),
            };
        }
        case "C": {
            const encoded = parts[3];
            const message = atob(encoded);
            const nMatch = parts[4]?.match(/^n=(\d+)$/);
            if (!nMatch)
                throw new ValidationError("Invalid seq number format");
            return {
                type: "chat",
                gameId,
                message,
                seqNumber: parseInt(nMatch[1], 10),
            };
        }
        default:
            throw new ValidationError("Unknown event type");
    }
}
export { ValidationError };
