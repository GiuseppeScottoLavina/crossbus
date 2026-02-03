/**
 * @fileoverview Tests for origin validator.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { OriginValidator, OriginValidatorPresets } from '../../src/security/origin-validator.js';

describe('OriginValidator', () => {
    describe('constructor', () => {
        it('should create validator with empty allowlist', () => {
            const validator = new OriginValidator();
            expect(validator.getAllowed()).toEqual([]);
        });

        it('should accept allowed origins in options', () => {
            const validator = new OriginValidator({
                allowed: ['https://example.com', 'https://trusted.com']
            });
            expect(validator.getAllowed()).toContain('https://example.com');
            expect(validator.getAllowed()).toContain('https://trusted.com');
        });
    });

    describe('isAllowed() - exact matches', () => {
        it('should allow exact match', () => {
            const validator = new OriginValidator({
                allowed: ['https://example.com']
            });
            expect(validator.isAllowed('https://example.com')).toBe(true);
        });

        it('should reject non-matching origin', () => {
            const validator = new OriginValidator({
                allowed: ['https://example.com']
            });
            expect(validator.isAllowed('https://evil.com')).toBe(false);
        });

        it('should be case-sensitive', () => {
            const validator = new OriginValidator({
                allowed: ['https://Example.com']
            });
            expect(validator.isAllowed('https://example.com')).toBe(false);
        });

        it('should handle multiple origins', () => {
            const validator = new OriginValidator({
                allowed: ['https://a.com', 'https://b.com', 'https://c.com']
            });
            expect(validator.isAllowed('https://a.com')).toBe(true);
            expect(validator.isAllowed('https://b.com')).toBe(true);
            expect(validator.isAllowed('https://c.com')).toBe(true);
            expect(validator.isAllowed('https://d.com')).toBe(false);
        });
    });

    describe('isAllowed() - wildcard patterns', () => {
        it('should match subdomain wildcard', () => {
            const validator = new OriginValidator({
                allowed: ['https://*.example.com']
            });
            expect(validator.isAllowed('https://widget.example.com')).toBe(true);
            expect(validator.isAllowed('https://api.example.com')).toBe(true);
            expect(validator.isAllowed('https://example.com')).toBe(false);
        });

        it('should match multi-level subdomain', () => {
            const validator = new OriginValidator({
                allowed: ['https://*.example.com']
            });
            expect(validator.isAllowed('https://a.b.example.com')).toBe(true);
        });

        it('should handle protocol wildcards', () => {
            const validator = new OriginValidator({
                allowed: ['chrome-extension://*']
            });
            expect(validator.isAllowed('chrome-extension://abc123')).toBe(true);
        });

        it('should handle global wildcard *', () => {
            const validator = new OriginValidator({
                allowed: ['*']
            });
            expect(validator.isAllowed('https://anything.com')).toBe(true);
            expect(validator.isAllowed('http://localhost:3000')).toBe(true);
        });
    });

    describe('isAllowed() - null origin', () => {
        it('should reject null origin by default', () => {
            const validator = new OriginValidator({
                allowed: ['https://example.com']
            });
            expect(validator.isAllowed('null')).toBe(false);
            expect(validator.isAllowed(null)).toBe(false);
        });

        it('should allow null origin if explicitly added', () => {
            const validator = new OriginValidator({
                allowed: ['null']
            });
            expect(validator.isAllowed('null')).toBe(true);
        });
    });

    describe('isAllowed() - same-origin mode', () => {
        it('should default to same-origin when no origins specified', () => {
            const validator = new OriginValidator();
            // Since we're in Node/Bun, selfOrigin is undefined
            // Any origin should be rejected
            expect(validator.isAllowed('https://example.com')).toBe(false);
        });
    });

    describe('allowAll mode', () => {
        it('should allow any origin', () => {
            const validator = new OriginValidator({ allowAll: true });
            expect(validator.isAllowed('https://anything.com')).toBe(true);
            expect(validator.isAllowed('http://localhost')).toBe(true);
            expect(validator.isAllowed('file://local')).toBe(true);
        });
    });

    describe('allow()', () => {
        it('should add origin to allowlist', () => {
            const validator = new OriginValidator();
            validator.allow('https://new.com');
            expect(validator.isAllowed('https://new.com')).toBe(true);
        });

        it('should be chainable', () => {
            const validator = new OriginValidator()
                .allow('https://a.com')
                .allow('https://b.com');
            expect(validator.isAllowed('https://a.com')).toBe(true);
            expect(validator.isAllowed('https://b.com')).toBe(true);
        });

        it('should throw for non-string origin', () => {
            const validator = new OriginValidator();
            expect(() => validator.allow(123)).toThrow(TypeError);
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
            expect(validator.disallow('https://nope.com')).toBe(false);
        });
    });

    describe('clear()', () => {
        it('should remove all allowed origins', () => {
            const validator = new OriginValidator({
                allowed: ['https://a.com', 'https://b.com']
            });
            validator.clear();
            expect(validator.getAllowed()).toEqual([]);
            expect(validator.isAllowed('https://a.com')).toBe(false);
        });
    });

    describe('OriginValidatorPresets', () => {
        it('sameOrigin should create empty validator', () => {
            const validator = OriginValidatorPresets.sameOrigin();
            expect(validator.getAllowed()).toEqual([]);
        });

        it('allowAll should allow everything', () => {
            const validator = OriginValidatorPresets.allowAll();
            expect(validator.isAllowed('https://anything.com')).toBe(true);
        });

        it('fromList should accept array of origins', () => {
            const validator = OriginValidatorPresets.fromList([
                'https://a.com',
                'https://b.com'
            ]);
            expect(validator.isAllowed('https://a.com')).toBe(true);
            expect(validator.isAllowed('https://b.com')).toBe(true);
        });
    });
});
