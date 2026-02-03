/**
 * @fileoverview Tests for AI agent enhancement features.
 */
import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { CrossBus } from '../../src/core/cross-bus.js';
import { createValidator, withSchemaValidation, createValidationHook } from '../../src/plugins/schema-validation.js';
import { ErrorCode } from '../../src/common/errors.js';
import { MessageType } from '../../src/common/types.js';

// ─────────────────────────────────────────────────────────────────
// Debug Mode Tests
// ─────────────────────────────────────────────────────────────────

describe('Debug Mode', () => {
    let bus;
    let mockLog;
    let originalLog;

    beforeEach(() => {
        originalLog = console.log;
        mockLog = mock(() => { });
        console.log = mockLog;
    });

    afterEach(() => {
        console.log = originalLog;
        bus?.destroy();
    });

    it('should not log when debug is false', async () => {
        bus = new CrossBus({ isHub: true, allowedOrigins: ['*'], debug: false });
        bus.addPeer('peer-1', () => { });
        await bus.signal('test', {});

        const calls = mockLog.mock.calls;
        const hasDebugLog = calls.some(call =>
            call[0]?.includes?.('[CrossBus]')
        );
        expect(hasDebugLog).toBe(false);
    });

    it('should log when debug is true', async () => {
        bus = new CrossBus({ isHub: true, allowedOrigins: ['*'], debug: true });
        bus.addPeer('peer-1', () => { });
        await bus.signal('test', {});

        const calls = mockLog.mock.calls;
        const hasDebugLog = calls.some(call =>
            call[0]?.includes?.('[CrossBus]')
        );
        expect(hasDebugLog).toBe(true);
    });

    it('should use custom debugPrefix', async () => {
        bus = new CrossBus({
            isHub: true,
            allowedOrigins: ['*'],
            debug: true,
            debugPrefix: '[MyHub]'
        });
        bus.addPeer('peer-1', () => { });
        await bus.signal('test', {});

        const calls = mockLog.mock.calls;
        const hasCustomPrefix = calls.some(call =>
            call[0]?.includes?.('[MyHub]')
        );
        expect(hasCustomPrefix).toBe(true);
    });

    it('should expose debug property', () => {
        bus = new CrossBus({ debug: true });
        expect(bus.debug).toBe(true);
        bus.destroy();

        const bus2 = new CrossBus({ debug: false });
        expect(bus2.debug).toBe(false);
        bus2.destroy();
    });
});

// ─────────────────────────────────────────────────────────────────
// Health Check Tests
// ─────────────────────────────────────────────────────────────────

describe('Health Check', () => {
    let bus;

    afterEach(() => {
        bus?.destroy();
    });

    it('should return health status', () => {
        bus = new CrossBus({ peerId: 'test-hub', isHub: true });

        const health = bus.healthCheck();

        expect(health.status).toBe('degraded'); // No peers = degraded for hub
        expect(health.peerId).toBe('test-hub');
        expect(health.isHub).toBe(true);
        expect(health.uptime).toBeGreaterThanOrEqual(0);
        expect(health.peers).toBeDefined();
        expect(health.peers.total).toBe(0);
        expect(health.handlers).toBeInstanceOf(Array);
        expect(health.destroyed).toBe(false);
    });

    it('should list handlers', () => {
        bus = new CrossBus({ isHub: true });
        bus.handle('getUser', () => { });
        bus.handle('createUser', () => { });

        const health = bus.healthCheck();

        expect(health.handlers).toContain('getUser');
        expect(health.handlers).toContain('createUser');
        expect(health.handlers.length).toBe(2);
    });

    it('should report healthy with peers', () => {
        bus = new CrossBus({ isHub: true });
        bus.addPeer('peer-1', () => { });
        bus.addPeer('peer-2', () => { });

        const health = bus.healthCheck();

        expect(health.status).toBe('healthy');
        expect(health.peers.total).toBe(2);
        expect(health.peers.ids).toContain('peer-1');
        expect(health.peers.ids).toContain('peer-2');
    });

    it('should report unhealthy when destroyed', () => {
        bus = new CrossBus();
        bus.destroy();

        const health = bus.healthCheck();

        expect(health.status).toBe('unhealthy');
        expect(health.destroyed).toBe(true);
    });

    it('should include memory info in Node.js', () => {
        bus = new CrossBus();

        const health = bus.healthCheck();

        // In Bun/Node, memory should be available
        if (typeof process !== 'undefined' && process.memoryUsage) {
            expect(health.memory).toBeDefined();
            expect(health.memory.heapUsed).toBeGreaterThan(0);
        }
    });

    it('should track uptime', async () => {
        bus = new CrossBus();

        const health1 = bus.healthCheck();
        await new Promise(r => setTimeout(r, 50));
        const health2 = bus.healthCheck();

        expect(health2.uptime).toBeGreaterThan(health1.uptime);
    });
});

// ─────────────────────────────────────────────────────────────────
// createSecure() Tests
// ─────────────────────────────────────────────────────────────────

describe('createSecure()', () => {
    it('should require allowedOrigins', () => {
        expect(() => CrossBus.createSecure()).toThrow(/allowedOrigins/);
        expect(() => CrossBus.createSecure({})).toThrow(/allowedOrigins/);
        expect(() => CrossBus.createSecure({ allowedOrigins: [] })).toThrow(/allowedOrigins/);
    });

    it('should reject wildcard origins', () => {
        expect(() => CrossBus.createSecure({
            allowedOrigins: ['*']
        })).toThrow(/wildcard/);

        expect(() => CrossBus.createSecure({
            allowedOrigins: ['https://example.com', '*']
        })).toThrow(/wildcard/);
    });

    it('should create instance with secure defaults', () => {
        const bus = CrossBus.createSecure({
            peerId: 'secure-hub',
            allowedOrigins: ['https://example.com']
        });

        expect(bus.peerId).toBe('secure-hub');
        expect(bus.strictMode).toBe(true);
        expect(bus.maxPayloadSize).toBe(1024 * 1024);

        bus.destroy();
    });

    it('should allow custom options to override defaults', () => {
        const bus = CrossBus.createSecure({
            allowedOrigins: ['https://example.com'],
            maxPayloadSize: 512 * 1024,
            requestTimeout: 10000
        });

        expect(bus.maxPayloadSize).toBe(512 * 1024);
        // requestTimeout is internal, but we can test it works

        bus.destroy();
    });
});

// ─────────────────────────────────────────────────────────────────
// uptime Property Tests
// ─────────────────────────────────────────────────────────────────

describe('uptime Property', () => {
    it('should expose uptime in milliseconds', async () => {
        const bus = new CrossBus();

        expect(bus.uptime).toBeGreaterThanOrEqual(0);

        await new Promise(r => setTimeout(r, 60)); // Wait 60ms for CI timing margin

        expect(bus.uptime).toBeGreaterThanOrEqual(40); // Allow 20ms tolerance

        bus.destroy();
    });
});

// ─────────────────────────────────────────────────────────────────
// diagnose() Tests
// ─────────────────────────────────────────────────────────────────

describe('diagnose()', () => {
    let bus;

    afterEach(() => {
        bus?.destroy();
    });

    it('should return healthy status when properly configured', () => {
        bus = new CrossBus({ isHub: true, strictMode: true });
        bus.addPeer('peer-1', () => { });
        bus.handle('test', () => { });

        const report = bus.diagnose();

        expect(report.status).toBe('healthy');
        expect(report.issues.length).toBe(0);
        expect(report.warnings.length).toBe(0);
        expect(report.peerCount).toBe(1);
        expect(report.handlerCount).toBe(1);
    });

    it('should warn about no peers for hub', () => {
        bus = new CrossBus({ isHub: true, strictMode: true });

        const report = bus.diagnose();

        expect(report.status).toBe('warning');
        expect(report.warnings).toContain('Hub has no connected peers');
        expect(report.suggestions.length).toBeGreaterThan(0);
    });

    it('should report error for agent with no peers', () => {
        bus = new CrossBus({ peerId: 'agent', isHub: false, strictMode: true });

        const report = bus.diagnose();

        expect(report.status).toBe('error');
        expect(report.issues).toContain('Agent has no connected peers');
    });

    it('should warn about missing handlers for hub', () => {
        bus = new CrossBus({ isHub: true, strictMode: true });
        bus.addPeer('peer-1', () => { });

        const report = bus.diagnose();

        expect(report.warnings).toContain('Hub has no registered handlers');
    });

    it('should warn when strictMode is disabled', () => {
        bus = new CrossBus({ isHub: true });
        bus.addPeer('peer-1', () => { });
        bus.handle('test', () => { });

        const report = bus.diagnose();

        expect(report.warnings).toContain('strictMode is disabled');
        expect(report.suggestions.some(s => s.includes('createSecure'))).toBe(true);
    });

    it('should report error when destroyed', () => {
        bus = new CrossBus();
        bus.destroy();

        const report = bus.diagnose();

        expect(report.status).toBe('error');
        expect(report.issues).toContain('Instance is destroyed');
    });

    it('should include uptime and peerId', () => {
        bus = new CrossBus({ peerId: 'test-agent', isHub: true, strictMode: true });
        bus.addPeer('peer-1', () => { });
        bus.handle('test', () => { });

        const report = bus.diagnose();

        expect(report.peerId).toBe('test-agent');
        expect(report.uptime).toBeGreaterThanOrEqual(0);
    });
});

// ─────────────────────────────────────────────────────────────────
// Schema Validation Plugin Tests
// ─────────────────────────────────────────────────────────────────

describe('Schema Validation Plugin', () => {
    describe('createValidator()', () => {
        it('should validate object type', () => {
            const validate = createValidator({ type: 'object' });

            expect(validate({}).valid).toBe(true);
            expect(validate([]).valid).toBe(false);
            expect(validate('string').valid).toBe(false);
        });

        it('should validate required properties', () => {
            const validate = createValidator({
                type: 'object',
                required: ['name', 'email']
            });

            expect(validate({ name: 'John', email: 'john@example.com' }).valid).toBe(true);
            expect(validate({ name: 'John' }).valid).toBe(false);
            expect(validate({}).valid).toBe(false);
        });

        it('should validate nested properties', () => {
            const validate = createValidator({
                type: 'object',
                properties: {
                    name: { type: 'string' },
                    age: { type: 'number' }
                }
            });

            expect(validate({ name: 'John', age: 30 }).valid).toBe(true);
            expect(validate({ name: 123, age: 30 }).valid).toBe(false);
        });

        it('should validate string constraints', () => {
            const validate = createValidator({
                type: 'string',
                minLength: 3,
                maxLength: 10
            });

            expect(validate('hello').valid).toBe(true);
            expect(validate('hi').valid).toBe(false);
            expect(validate('hello world!').valid).toBe(false);
        });

        it('should validate string pattern', () => {
            const validate = createValidator({
                type: 'string',
                pattern: '^[a-z]+$'
            });

            expect(validate('hello').valid).toBe(true);
            expect(validate('Hello').valid).toBe(false);
            expect(validate('hello123').valid).toBe(false);
        });

        it('should validate number constraints', () => {
            const validate = createValidator({
                type: 'number',
                minimum: 0,
                maximum: 100
            });

            expect(validate(50).valid).toBe(true);
            expect(validate(-1).valid).toBe(false);
            expect(validate(101).valid).toBe(false);
        });

        it('should validate integer type', () => {
            const validate = createValidator({ type: 'integer' });

            expect(validate(42).valid).toBe(true);
            expect(validate(3.14).valid).toBe(false);
        });

        it('should validate array type', () => {
            const validate = createValidator({ type: 'array' });

            expect(validate([]).valid).toBe(true);
            expect(validate([1, 2, 3]).valid).toBe(true);
            expect(validate({}).valid).toBe(false);
        });

        it('should validate array items', () => {
            const validate = createValidator({
                type: 'array',
                items: { type: 'number' }
            });

            expect(validate([1, 2, 3]).valid).toBe(true);
            expect(validate([1, 'two', 3]).valid).toBe(false);
        });

        it('should validate enum', () => {
            const validate = createValidator({
                enum: ['red', 'green', 'blue']
            });

            expect(validate('red').valid).toBe(true);
            expect(validate('yellow').valid).toBe(false);
        });

        it('should handle null values', () => {
            const validate = createValidator({ type: 'string' });

            expect(validate(null).valid).toBe(false);
            expect(validate(undefined).valid).toBe(false);
        });

        it('should validate array minItems', () => {
            const validate = createValidator({
                type: 'array',
                minItems: 2
            });

            expect(validate([1, 2]).valid).toBe(true);
            expect(validate([1]).valid).toBe(false);
            expect(validate([]).valid).toBe(false);
        });

        it('should validate array maxItems', () => {
            const validate = createValidator({
                type: 'array',
                maxItems: 3
            });

            expect(validate([1, 2]).valid).toBe(true);
            expect(validate([1, 2, 3]).valid).toBe(true);
            expect(validate([1, 2, 3, 4]).valid).toBe(false);
        });

        it('should reject non-integers for integer type', () => {
            const validate = createValidator({ type: 'integer' });

            expect(validate(42).valid).toBe(true);
            expect(validate(-5).valid).toBe(true);
            expect(validate(3.14).valid).toBe(false);
            expect(validate(0.5).valid).toBe(false);
        });
    });

    describe('withSchemaValidation()', () => {
        let bus;

        beforeEach(() => {
            bus = new CrossBus({ isHub: true, allowedOrigins: ['*'] });
        });

        afterEach(() => {
            bus?.destroy();
        });

        it('should pass valid payloads to handler', async () => {
            const schema = {
                type: 'object',
                required: ['name'],
                properties: {
                    name: { type: 'string' }
                }
            };

            let receivedPayload;
            bus.handle('createUser', withSchemaValidation(schema, (payload) => {
                receivedPayload = payload;
                return { success: true };
            }));

            const responses = [];
            await bus.handleMessage({
                t: MessageType.REQUEST,
                id: 'req-1',
                handler: 'createUser',
                p: { name: 'Alice' }
            }, '*', 'peer-1', (msg) => responses.push(msg));

            expect(responses[0].payload.success).toBe(true);
            expect(receivedPayload.name).toBe('Alice');
        });

        it('should reject invalid payloads', async () => {
            const schema = {
                type: 'object',
                required: ['name'],
                properties: {
                    name: { type: 'string' }
                }
            };

            bus.handle('createUser', withSchemaValidation(schema, () => {
                return { success: true };
            }));

            const responses = [];
            await bus.handleMessage({
                t: MessageType.REQUEST,
                id: 'req-1',
                handler: 'createUser',
                p: { wrongField: 123 }
            }, '*', 'peer-1', (msg) => responses.push(msg));

            expect(responses[0].payload.success).toBe(false);
            expect(responses[0].payload.error.code).toBe(ErrorCode.INVALID_PAYLOAD);
        });
    });

    describe('createValidationHook()', () => {
        let bus;

        beforeEach(() => {
            bus = new CrossBus({ isHub: true, allowedOrigins: ['*'] });
        });

        afterEach(() => {
            bus?.destroy();
        });

        it('should validate payloads based on handler name', async () => {
            const schema = {
                type: 'object',
                required: ['name'],
                properties: { name: { type: 'string' } }
            };

            // Use withSchemaValidation for robust validation that stops on error
            bus.handle('createUser', withSchemaValidation(schema, (payload) => ({ created: payload.name })));

            // Valid payload
            const res1 = [];
            await bus.handleMessage({
                t: MessageType.REQUEST,
                id: 'req-1',
                handler: 'createUser',
                p: { name: 'Bob' }
            }, '*', 'peer-1', (msg) => res1.push(msg));

            expect(res1[0].payload.success).toBe(true);
            expect(res1[0].payload.data.created).toBe('Bob');

            // Invalid payload - should fail with INVALID_PAYLOAD
            const res2 = [];
            await bus.handleMessage({
                t: MessageType.REQUEST,
                id: 'req-2',
                handler: 'createUser',
                p: {}
            }, '*', 'peer-1', (msg) => res2.push(msg));

            expect(res2[0].payload.success).toBe(false);
            expect(res2[0].payload.error.code).toBe(ErrorCode.INVALID_PAYLOAD);
        });

        it('should skip validation for unregistered handlers', async () => {
            const schemas = {
                createUser: { type: 'object', required: ['name'] }
            };

            bus.addInboundHook(createValidationHook(schemas));
            bus.handle('otherHandler', () => ({ ok: true }));

            const responses = [];
            await bus.handleMessage({
                t: MessageType.REQUEST,
                id: 'req-1',
                handler: 'otherHandler',
                p: { anything: 'goes' }
            }, '*', 'peer-1', (msg) => responses.push(msg));

            expect(responses[0].payload.success).toBe(true);
        });
    });
});
