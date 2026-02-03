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
    /** @type {Map<string, Map<string, MigrationFn>>} Type -> "from:to" -> migrator */
    #migrations = new Map();

    /** @type {Map<string, number>} Type -> current version */
    #currentVersions = new Map();

    /** @type {number} */
    #defaultVersion;

    /**
     * Creates a new versioning system.
     * @param {Object} [options={}] - Options
     * @param {number} [options.defaultVersion=1] - Default version for new messages
     */
    constructor(options = {}) {
        this.#defaultVersion = options.defaultVersion ?? 1;
    }

    /**
     * Registers a migration from one version to another.
     * @param {string} type - Message type (e.g., 'user:updated')
     * @param {number} fromVersion - Source version
     * @param {number} toVersion - Target version
     * @param {MigrationFn} migrateFn - Migration function
     */
    registerMigration(type, fromVersion, toVersion, migrateFn) {
        if (!this.#migrations.has(type)) {
            this.#migrations.set(type, new Map());
        }
        const typeMigrations = this.#migrations.get(type);
        if (typeMigrations) {
            typeMigrations.set(`${fromVersion}:${toVersion}`, migrateFn);
        }
    }

    /**
     * Sets the current version for a message type.
     * @param {string} type - Message type
     * @param {number} version - Current version
     */
    setCurrentVersion(type, version) {
        this.#currentVersions.set(type, version);
    }

    /**
     * Gets the current version for a message type.
     * @param {string} type - Message type
     * @returns {number}
     */
    getCurrentVersion(type) {
        return this.#currentVersions.get(type) ?? this.#defaultVersion;
    }

    /**
     * Migrates a payload from one version to another.
     * @param {string} type - Message type
     * @param {Object} payload - Payload to migrate
     * @param {number} fromVersion - Source version
     * @param {number} toVersion - Target version
     * @returns {Object} Migrated payload
     * @throws {Error} If no migration path exists
     */
    migrate(type, payload, fromVersion, toVersion) {
        if (fromVersion === toVersion) {
            return payload;
        }

        const migrations = this.#migrations.get(type);
        if (!migrations) {
            throw new Error(`No migrations registered for type: ${type}`);
        }

        // Find migration path
        let current = payload;
        let currentVersion = fromVersion;

        while (currentVersion !== toVersion) {
            const nextVersion = currentVersion < toVersion ? currentVersion + 1 : currentVersion - 1;
            const key = `${currentVersion}:${nextVersion}`;
            const migrateFn = migrations.get(key);

            if (!migrateFn) {
                throw new Error(`No migration path from v${currentVersion} to v${nextVersion} for type: ${type}`);
            }

            current = migrateFn(current);
            currentVersion = nextVersion;
        }

        return current;
    }

    /**
     * Checks if a message needs migration.
     * @param {string} type - Message type
     * @param {number} version - Message version
     * @returns {boolean}
     */
    needsMigration(type, version) {
        return version !== this.getCurrentVersion(type);
    }

    /**
     * Creates a versioned message.
     * @param {string} type - Message type
     * @param {Object} payload - Message payload
     * @param {number} [version] - Version (defaults to current)
     * @returns {VersionedMessage}
     */
    createMessage(type, payload, version) {
        return {
            _v: version ?? this.getCurrentVersion(type),
            ...payload
        };
    }

    /**
     * Extracts version from a message.
     * @param {Object} message - Message
     * @returns {number}
     */
    getVersion(message) {
        return message?._v ?? this.#defaultVersion;
    }

    /**
     * Creates a CrossBus hook for automatic version migration.
     * @returns {(payload: Object, context: Object) => Object}
     */
    createInboundHook() {
        return (payload, context) => {
            if (!payload || typeof payload !== 'object') {
                return payload;
            }

            const version = this.getVersion(payload);
            const type = context.handlerName || context.type;
            const currentVersion = this.getCurrentVersion(type);

            if (version !== currentVersion && this.#migrations.has(type)) {
                try {
                    const { _v, ...rest } = payload;
                    const migrated = this.migrate(type, rest, version, currentVersion);
                    return { _v: currentVersion, ...migrated };
                } catch (e) {
                    console.warn(`[Versioning] Migration failed for ${type}: ${e instanceof Error ? e.message : String(e)}`);
                    return payload;
                }
            }

            return payload;
        };
    }

    /**
     * Creates a CrossBus hook for automatic version stamping.
     * @returns {(payload: Object, context: Object) => Object}
     */
    createOutboundHook() {
        return (payload, context) => {
            if (!payload || typeof payload !== 'object') {
                return payload;
            }

            // Don't overwrite existing version
            if (payload._v !== undefined) {
                return payload;
            }

            const type = context.handlerName || context.type;
            const version = this.getCurrentVersion(type);

            return { _v: version, ...payload };
        };
    }

    /**
     * Gets all registered migrations.
     * @returns {Object}
     */
    getMigrations() {
        const result = {};
        for (const [type, migrations] of this.#migrations) {
            result[type] = Array.from(migrations.keys());
        }
        return result;
    }

    /**
     * Clears all migrations.
     */
    clear() {
        this.#migrations.clear();
        this.#currentVersions.clear();
    }
}

/**
 * Default global versioning instance.
 */
export const globalVersioning = new MessageVersioning();
