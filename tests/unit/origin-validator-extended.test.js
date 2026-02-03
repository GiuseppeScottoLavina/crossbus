/**
 * @fileoverview Extended tests for OriginValidator - coverage gaps.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { OriginValidator, OriginValidatorPresets } from '../../src/security/origin-validator.js';

describe('OriginValidator Extended', () => {
    describe('constructor', () => {
        it('should allow origins passed in constructor', () => {
            const validator = new OriginValidator({
                allowed: ['https://example.com', 'https://test.com']
            });

            expect(validator.isAllowed('https://example.com')).toBe(true);
            expect(validator.isAllowed('https://test.com')).toBe(true);
            expect(validator.isAllowed('https://unknown.com')).toBe(false);
        });

        it('should handle allowAll in constructor', () => {
            const validator = new OriginValidator({ allowAll: true });
            expect(validator.isAllowed('https://any-domain.com')).toBe(true);
        });

        it('should handle empty options', () => {
            const validator = new OriginValidator();
            // With no options, same-origin only
            expect(validator.getAllowed()).toEqual([]);
        });
    });

    describe('isAllowed', () => {
        it('should handle null origin', () => {
            const validator = new OriginValidator({ allowed: ['null'] });
            expect(validator.isAllowed('null')).toBe(true);
            expect(validator.isAllowed(null)).toBe(true);
        });

        it('should reject null origin when not in allowlist', () => {
            const validator = new OriginValidator({ allowed: ['https://example.com'] });
            expect(validator.isAllowed('null')).toBe(false);
            expect(validator.isAllowed(null)).toBe(false);
        });

        it('should use same-origin when no origins configured', () => {
            const validator = new OriginValidator();
            // selfOrigin in non-browser is undefined
            expect(validator.selfOrigin).toBeUndefined();
        });

        it('should check patterns after exact match fails', () => {
            const validator = new OriginValidator({
                allowed: ['https://*.example.com']
            });

            expect(validator.isAllowed('https://sub.example.com')).toBe(true);
            expect(validator.isAllowed('https://deep.sub.example.com')).toBe(true);
            expect(validator.isAllowed('https://notexample.com')).toBe(false);
        });
    });

    describe('allow()', () => {
        it('should add and chain', () => {
            const validator = new OriginValidator();
            const result = validator.allow('https://example.com');

            expect(result).toBe(validator);
            expect(validator.isAllowed('https://example.com')).toBe(true);
        });

        it('should set allowAll when * passed', () => {
            const validator = new OriginValidator();
            validator.allow('*');

            expect(validator.isAllowed('https://any.com')).toBe(true);
        });

        it('should throw on non-string origin', () => {
            const validator = new OriginValidator();
            expect(() => validator.allow(123)).toThrow(TypeError);
            expect(() => validator.allow(null)).toThrow(TypeError);
        });

        it('should add wildcard patterns', () => {
            const validator = new OriginValidator();
            validator.allow('https://*.test.com');

            expect(validator.isAllowed('https://foo.test.com')).toBe(true);
            expect(validator.isAllowed('https://bar.test.com')).toBe(true);
        });
    });

    describe('disallow()', () => {
        it('should remove exact origin', () => {
            const validator = new OriginValidator({
                allowed: ['https://example.com', 'https://other.com']
            });

            const removed = validator.disallow('https://example.com');

            expect(removed).toBe(true);
            expect(validator.isAllowed('https://example.com')).toBe(false);
            expect(validator.isAllowed('https://other.com')).toBe(true);
        });

        it('should return false for non-existent origin', () => {
            const validator = new OriginValidator();
            const removed = validator.disallow('https://never-added.com');
            expect(removed).toBe(false);
        });

        it('should return false for pattern (not removable)', () => {
            const validator = new OriginValidator({
                allowed: ['https://*.example.com']
            });

            // Patterns cannot be removed individually
            const removed = validator.disallow('https://*.example.com');
            expect(removed).toBe(false);
        });
    });

    describe('getAllowed()', () => {
        it('should return all exact origins', () => {
            const validator = new OriginValidator({
                allowed: ['https://a.com', 'https://b.com', 'https://*.c.com']
            });

            const allowed = validator.getAllowed();
            expect(allowed).toContain('https://a.com');
            expect(allowed).toContain('https://b.com');
            // Patterns not included
            expect(allowed).not.toContain('https://*.c.com');
        });
    });

    describe('clear()', () => {
        it('should remove all origins and patterns', () => {
            const validator = new OriginValidator({
                allowed: ['https://a.com', 'https://*.b.com']
            });

            validator.clear();

            expect(validator.getAllowed()).toEqual([]);
            expect(validator.isAllowed('https://a.com')).toBe(false);
            expect(validator.isAllowed('https://sub.b.com')).toBe(false);
        });
    });

    describe('selfOrigin', () => {
        it('should return current origin (undefined in non-browser)', () => {
            const validator = new OriginValidator();
            // In Bun test environment, globalThis.location is undefined
            expect(validator.selfOrigin).toBeUndefined();
        });
    });

    describe('pattern creation (ReDoS prevention)', () => {
        it('should escape special regex characters', () => {
            const validator = new OriginValidator();
            validator.allow('https://example.com:8080');

            // The colon should be escaped properly
            expect(validator.isAllowed('https://example.com:8080')).toBe(true);
        });

        it('should handle complex wildcard patterns', () => {
            const validator = new OriginValidator();
            validator.allow('https://*.api.example.com');

            expect(validator.isAllowed('https://v1.api.example.com')).toBe(true);
            expect(validator.isAllowed('https://v2.api.example.com')).toBe(true);
        });
    });
});

describe('OriginValidatorPresets', () => {
    describe('sameOrigin()', () => {
        it('should create validator with no allowed origins', () => {
            const validator = OriginValidatorPresets.sameOrigin();
            expect(validator.getAllowed()).toEqual([]);
        });
    });

    describe('allowAll()', () => {
        it('should create validator that allows all', () => {
            const validator = OriginValidatorPresets.allowAll();
            expect(validator.isAllowed('https://any-domain.whatever')).toBe(true);
        });
    });

    describe('fromList()', () => {
        it('should create validator from array of origins', () => {
            const validator = OriginValidatorPresets.fromList([
                'https://a.com',
                'https://b.com'
            ]);

            expect(validator.isAllowed('https://a.com')).toBe(true);
            expect(validator.isAllowed('https://b.com')).toBe(true);
            expect(validator.isAllowed('https://c.com')).toBe(false);
        });
    });
});
