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
export type GameInitEvent = {
    type: "game-init";
    gameId: string;
    whitePub: string;
    timestamp: number;
};
export type GameJoinEvent = {
    type: "game-join";
    gameId: string;
    blackPub: string;
    timestamp: number;
};
export type MoveEvent = {
    type: "move";
    gameId: string;
    uci: string;
    plyNumber: number;
};
export type ChatEvent = {
    type: "chat";
    gameId: string;
    message: string;
    seqNumber: number;
};
export type ProtocolEvent = GameInitEvent | GameJoinEvent | MoveEvent | ChatEvent;
declare class ValidationError extends Error {
    constructor(message: string);
}
export declare function encodeEvent(event: ProtocolEvent): Uint8Array;
export declare function decodeEvent(bytes: Uint8Array): ProtocolEvent;
export { ValidationError };
