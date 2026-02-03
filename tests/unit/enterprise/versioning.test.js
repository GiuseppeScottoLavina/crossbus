/**
 * @fileoverview Tests for enterprise versioning module.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { MessageVersioning, globalVersioning } from '../../../src/enterprise/versioning.js';

describe('MessageVersioning', () => {
    let versioning;

    beforeEach(() => {
        versioning = new MessageVersioning();
    });

    describe('constructor', () => {
        it('should create with default version', () => {
            const v = new MessageVersioning();
            expect(v.getCurrentVersion('test')).toBe(1);
        });

        it('should accept custom default version', () => {
            const v = new MessageVersioning({ defaultVersion: 2 });
            expect(v.getCurrentVersion('test')).toBe(2);
        });
    });

    describe('setCurrentVersion/getCurrentVersion', () => {
        it('should set and get current version', () => {
            versioning.setCurrentVersion('user:updated', 3);
            expect(versioning.getCurrentVersion('user:updated')).toBe(3);
        });

        it('should return default for unknown type', () => {
            expect(versioning.getCurrentVersion('unknown')).toBe(1);
        });
    });

    describe('registerMigration()', () => {
        it('should register a migration', () => {
            versioning.registerMigration('user:updated', 1, 2, (old) => ({ ...old, v2: true }));
            const migrations = versioning.getMigrations();
            expect(migrations['user:updated']).toContain('1:2');
        });
    });

    describe('migrate()', () => {
        it('should migrate from v1 to v2', () => {
            versioning.registerMigration('user:updated', 1, 2, (old) => ({
                ...old,
                fullName: `${old.firstName} ${old.lastName}`
            }));

            const migrated = versioning.migrate('user:updated', {
                firstName: 'John',
                lastName: 'Doe'
            }, 1, 2);

            expect(migrated.fullName).toBe('John Doe');
        });

        it('should chain migrations', () => {
            versioning.registerMigration('event', 1, 2, (old) => ({ ...old, v2: true }));
            versioning.registerMigration('event', 2, 3, (old) => ({ ...old, v3: true }));

            const migrated = versioning.migrate('event', { data: 1 }, 1, 3);

            expect(migrated.v2).toBe(true);
            expect(migrated.v3).toBe(true);
        });

        it('should return payload unchanged if versions match', () => {
            const payload = { data: 1 };
            const migrated = versioning.migrate('test', payload, 2, 2);
            expect(migrated).toEqual(payload);
        });

        it('should throw if no migrations registered', () => {
            expect(() => versioning.migrate('unknown', {}, 1, 2)).toThrow('No migrations');
        });

        it('should throw if migration path missing', () => {
            versioning.registerMigration('event', 1, 2, (old) => old);
            expect(() => versioning.migrate('event', {}, 1, 3)).toThrow('No migration path');
        });
    });

    describe('needsMigration()', () => {
        it('should return true if version differs', () => {
            versioning.setCurrentVersion('test', 2);
            expect(versioning.needsMigration('test', 1)).toBe(true);
        });

        it('should return false if version matches', () => {
            versioning.setCurrentVersion('test', 2);
            expect(versioning.needsMigration('test', 2)).toBe(false);
        });
    });

    describe('createMessage()', () => {
        it('should create versioned message', () => {
            versioning.setCurrentVersion('test', 3);
            const msg = versioning.createMessage('test', { data: 1 });
            expect(msg._v).toBe(3);
            expect(msg.data).toBe(1);
        });

        it('should allow custom version', () => {
            const msg = versioning.createMessage('test', { data: 1 }, 5);
            expect(msg._v).toBe(5);
        });
    });

    describe('getVersion()', () => {
        it('should extract version from message', () => {
            expect(versioning.getVersion({ _v: 3, data: 1 })).toBe(3);
        });

        it('should return default for unversioned message', () => {
            expect(versioning.getVersion({ data: 1 })).toBe(1);
        });

        it('should handle null/undefined', () => {
            expect(versioning.getVersion(null)).toBe(1);
            expect(versioning.getVersion(undefined)).toBe(1);
        });
    });

    describe('createInboundHook()', () => {
        it('should return a hook function', () => {
            const hook = versioning.createInboundHook();
            expect(typeof hook).toBe('function');
        });

        it('should migrate incoming messages', () => {
            versioning.setCurrentVersion('user', 2);
            versioning.registerMigration('user', 1, 2, (old) => ({
                ...old,
                migrated: true
            }));

            const hook = versioning.createInboundHook();
            const result = hook({ _v: 1, data: 1 }, { handlerName: 'user' });

            expect(result._v).toBe(2);
            expect(result.migrated).toBe(true);
        });

        it('should pass through non-objects', () => {
            const hook = versioning.createInboundHook();
            expect(hook(null, {})).toBeNull();
            expect(hook('string', {})).toBe('string');
        });

        it('should handle migration errors gracefully', () => {
            versioning.setCurrentVersion('user', 2);
            versioning.registerMigration('user', 1, 2, () => {
                throw new Error('Migration failed');
            });

            const hook = versioning.createInboundHook();
            const payload = { _v: 1, data: 1 };
            const result = hook(payload, { handlerName: 'user' });

            // Should return original on error
            expect(result).toEqual(payload);
        });
    });

    describe('createOutboundHook()', () => {
        it('should return a hook function', () => {
            const hook = versioning.createOutboundHook();
            expect(typeof hook).toBe('function');
        });

        it('should add version to outgoing messages', () => {
            versioning.setCurrentVersion('user', 3);
            const hook = versioning.createOutboundHook();
            const result = hook({ data: 1 }, { handlerName: 'user' });
            expect(result._v).toBe(3);
        });

        it('should not overwrite existing version', () => {
            versioning.setCurrentVersion('user', 3);
            const hook = versioning.createOutboundHook();
            const result = hook({ _v: 1, data: 1 }, { handlerName: 'user' });
            expect(result._v).toBe(1);
        });

        it('should pass through non-objects', () => {
            const hook = versioning.createOutboundHook();
            expect(hook(null, {})).toBeNull();
        });
    });

    describe('getMigrations()', () => {
        it('should return all registered migrations', () => {
            versioning.registerMigration('a', 1, 2, (x) => x);
            versioning.registerMigration('a', 2, 3, (x) => x);
            versioning.registerMigration('b', 1, 2, (x) => x);

            const migs = versioning.getMigrations();
            expect(migs.a).toContain('1:2');
            expect(migs.a).toContain('2:3');
            expect(migs.b).toContain('1:2');
        });
    });

    describe('clear()', () => {
        it('should clear all migrations and versions', () => {
            versioning.registerMigration('test', 1, 2, (x) => x);
            versioning.setCurrentVersion('test', 2);
            versioning.clear();

            expect(versioning.getMigrations()).toEqual({});
            expect(versioning.getCurrentVersion('test')).toBe(1);
        });
    });
});

describe('globalVersioning', () => {
    it('should be a MessageVersioning instance', () => {
        expect(globalVersioning).toBeInstanceOf(MessageVersioning);
    });
});
