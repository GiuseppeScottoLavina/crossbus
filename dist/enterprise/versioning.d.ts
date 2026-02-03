/**
 * @fileoverview Message versioning for CrossBus.
 * Supports schema evolution with migration functions.
 * @module enterprise/versioning
 */
/**
 * @typedef {Object} VersionedMessage
 * @property {number} _v - Message version
 * @property {Object} payload - Message payload
 */
/**
 * @typedef {(oldPayload: Object) => Object} MigrationFn
 */
/**
 * Message versioning system for CrossBus.
 * Handles schema evolution with automatic migrations.
 *
 * @example
 * const versioning = new MessageVersioning();
 *
 * // Register migrations
 * versioning.registerMigration('user:updated', 1, 2, (old) => ({
 *   ...old,
 *   fullName: `${old.firstName} ${old.lastName}`
 * }));
 *
 * // Migrate a message
 * const migrated = versioning.migrate('user:updated', oldPayload, 1, 2);
 */
export class MessageVersioning {
    /**
     * Creates a new versioning system.
     * @param {Object} [options={}] - Options
     * @param {number} [options.defaultVersion=1] - Default version for new messages
     */
    constructor(options?: {
        defaultVersion?: number | undefined;
    });
    /**
     * Registers a migration from one version to another.
     * @param {string} type - Message type (e.g., 'user:updated')
     * @param {number} fromVersion - Source version
     * @param {number} toVersion - Target version
     * @param {MigrationFn} migrateFn - Migration function
     */
    registerMigration(type: string, fromVersion: number, toVersion: number, migrateFn: MigrationFn): void;
    /**
     * Sets the current version for a message type.
     * @param {string} type - Message type
     * @param {number} version - Current version
     */
    setCurrentVersion(type: string, version: number): void;
    /**
     * Gets the current version for a message type.
     * @param {string} type - Message type
     * @returns {number}
     */
    getCurrentVersion(type: string): number;
    /**
     * Migrates a payload from one version to another.
     * @param {string} type - Message type
     * @param {Object} payload - Payload to migrate
     * @param {number} fromVersion - Source version
     * @param {number} toVersion - Target version
     * @returns {Object} Migrated payload
     * @throws {Error} If no migration path exists
     */
    migrate(type: string, payload: any, fromVersion: number, toVersion: number): any;
    /**
     * Checks if a message needs migration.
     * @param {string} type - Message type
     * @param {number} version - Message version
     * @returns {boolean}
     */
    needsMigration(type: string, version: number): boolean;
    /**
     * Creates a versioned message.
     * @param {string} type - Message type
     * @param {Object} payload - Message payload
     * @param {number} [version] - Version (defaults to current)
     * @returns {VersionedMessage}
     */
    createMessage(type: string, payload: any, version?: number): VersionedMessage;
    /**
     * Extracts version from a message.
     * @param {Object} message - Message
     * @returns {number}
     */
    getVersion(message: any): number;
    /**
     * Creates a CrossBus hook for automatic version migration.
     * @returns {(payload: Object, context: Object) => Object}
     */
    createInboundHook(): (payload: any, context: any) => any;
    /**
     * Creates a CrossBus hook for automatic version stamping.
     * @returns {(payload: Object, context: Object) => Object}
     */
    createOutboundHook(): (payload: any, context: any) => any;
    /**
     * Gets all registered migrations.
     * @returns {Object}
     */
    getMigrations(): any;
    /**
     * Clears all migrations.
     */
    clear(): void;
    #private;
}
/**
 * Default global versioning instance.
 */
export const globalVersioning: MessageVersioning;
export type VersionedMessage = {
    /**
     * - Message version
     */
    _v: number;
    /**
     * - Message payload
     */
    payload: any;
};
export type MigrationFn = (oldPayload: any) => any;
