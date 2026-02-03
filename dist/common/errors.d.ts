/**
 * Checks if an error is a CrossBusError.
 *
 * @param {*} err - Value to check.
 * @returns {boolean}
 */
export function isCrossBusError(err: any): boolean;
/**
 * Checks if an error is retryable.
 *
 * @param {Error} err - Error to check.
 * @returns {boolean}
 */
export function isRetryable(err: Error): boolean;
/**
 * Error codes for CrossBus.
 */
export type ErrorCode = string;
/**
 * @fileoverview Centralized error handling for CrossBus.
 * @module common/errors
 */
/**
 * Error codes for CrossBus.
 * @readonly
 * @enum {string}
 */
export const ErrorCode: Readonly<{
    HANDSHAKE_TIMEOUT: "ERR_HANDSHAKE_TIMEOUT";
    HANDSHAKE_REJECTED: "ERR_HANDSHAKE_REJECTED";
    ORIGIN_FORBIDDEN: "ERR_ORIGIN_FORBIDDEN";
    PEER_EXISTS: "ERR_PEER_EXISTS";
    PEER_NOT_FOUND: "ERR_PEER_NOT_FOUND";
    PEER_DISCONNECTED: "ERR_PEER_DISCONNECTED";
    RECONNECT_FAILED: "ERR_RECONNECT_FAILED";
    UNSUPPORTED: "ERR_UNSUPPORTED";
    NOT_CONNECTED: "ERR_NOT_CONNECTED";
    ACK_TIMEOUT: "ERR_ACK_TIMEOUT";
    RESPONSE_TIMEOUT: "ERR_RESPONSE_TIMEOUT";
    QUEUE_FULL: "ERR_QUEUE_FULL";
    INVALID_MESSAGE: "ERR_INVALID_MESSAGE";
    VERSION_MISMATCH: "ERR_VERSION_MISMATCH";
    CLONE_ERROR: "ERR_CLONE_ERROR";
    TRANSFER_ERROR: "ERR_TRANSFER_ERROR";
    MESSAGE_TOO_LARGE: "ERR_MESSAGE_TOO_LARGE";
    UNREACHABLE: "ERR_UNREACHABLE";
    TTL_EXCEEDED: "ERR_TTL_EXCEEDED";
    NO_ROUTE: "ERR_NO_ROUTE";
    NO_HANDLER: "ERR_NO_HANDLER";
    HANDLER_ERROR: "ERR_HANDLER_ERROR";
    HANDLER_TIMEOUT: "ERR_HANDLER_TIMEOUT";
    HANDLER_EXISTS: "ERR_HANDLER_EXISTS";
    SEND_FAILED: "ERR_SEND_FAILED";
    CHANNEL_FAILED: "ERR_CHANNEL_FAILED";
    CHANNEL_CLOSED: "ERR_CHANNEL_CLOSED";
    MAX_PEERS: "ERR_MAX_PEERS";
    MAX_PENDING: "ERR_MAX_PENDING";
    DESTROYED: "ERR_DESTROYED";
    CIRCUIT_OPEN: "ERR_CIRCUIT_OPEN";
    PAYLOAD_TOO_LARGE: "ERR_PAYLOAD_TOO_LARGE";
    RATE_LIMITED: "ERR_RATE_LIMITED";
    UNAUTHORIZED: "ERR_UNAUTHORIZED";
    INVALID_PAYLOAD: "ERR_INVALID_PAYLOAD";
}>;
/**
 * Custom error class for CrossBus.
 *
 * @extends Error
 *
 * @example
 * try {
 *   await bus.emit('msg', data, 'unknown-peer');
 * } catch (err) {
 *   if (err instanceof CrossBusError) {
 *     console.log(err.code);      // 'ERR_PEER_NOT_FOUND'
 *     console.log(err.message);   // 'Peer not found'
 *     console.log(err.details);   // { peerId: 'unknown-peer' }
 *     console.log(err.retryable); // false
 *   }
 * }
 */
export class CrossBusError extends Error {
    /**
     * Creates error from code with default message.
     *
     * @param {ErrorCode} code - Error code.
     * @param {Object} [details] - Error context.
     * @returns {CrossBusError}
     */
    static from(code: ErrorCode, details?: any): CrossBusError;
    /**
     * Creates error from another error.
     *
     * @param {ErrorCode} code - Error code.
     * @param {Error} cause - Original error.
     * @param {Object} [details] - Additional context.
     * @returns {CrossBusError}
     */
    static wrap(code: ErrorCode, cause: Error, details?: any): CrossBusError;
    /**
     * Creates a new CrossBusError.
     *
     * @param {ErrorCode} code - Error code.
     * @param {string} [message] - Custom message (uses default if omitted).
     * @param {Object} [options] - Additional options.
     * @param {Object} [options.details={}] - Error context.
     * @param {boolean} [options.retryable] - Override default retryable.
     * @param {Error} [options.cause] - Original error.
     */
    constructor(code: ErrorCode, message?: string, options?: {
        details?: any;
        retryable?: boolean | undefined;
        cause?: Error | undefined;
    });
    /**
     * Error code.
     * @type {ErrorCode}
     */
    code: ErrorCode;
    /**
     * Additional error context.
     * @type {Object}
     */
    details: any;
    /**
     * Whether the operation can be retried.
     * @type {boolean}
     */
    retryable: boolean;
    /**
     * Original error that caused this error.
     * @type {Error|undefined}
     */
    cause: Error | undefined;
    /**
     * Timestamp when error occurred.
     * @type {number}
     */
    timestamp: number;
    /**
     * Converts error to JSON-serializable object.
     * @returns {Object}
     */
    toJSON(): any;
}
