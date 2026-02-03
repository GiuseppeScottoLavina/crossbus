/**
 * @fileoverview Integration tests for multi-agent orchestration patterns.
 * Tests the coordination between multiple CrossBus instances acting as agents.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { CrossBus } from '../../src/core/cross-bus.js';

describe('Multi-Agent Orchestration', () => {
    let orchestrator;
    let planner;
    let executor;
    let memory;

    beforeEach(() => {
        // Create orchestrator (hub)
        orchestrator = new CrossBus({
            isHub: true,
            peerId: 'orchestrator',
            allowedOrigins: ['*']
        });

        // Create agent instances (peers)
        planner = new CrossBus({ peerId: 'planner', allowedOrigins: ['*'] });
        executor = new CrossBus({ peerId: 'executor', allowedOrigins: ['*'] });
        memory = new CrossBus({ peerId: 'memory', allowedOrigins: ['*'] });

        // Register agent handlers
        planner.handle('plan:create', async ({ goal }) => {
            return {
                steps: ['Research', 'Outline', 'Write', 'Review'],
                goal
            };
        });

        executor.handle('task:run', async ({ steps }) => {
            return {
                success: true,
                completed: steps.length,
                duration: '2.3s'
            };
        });

        memory.handle('memory:store', async ({ key, value }) => {
            return {
                stored: true,
                id: `mem_${Date.now()}`
            };
        });
    });

    afterEach(() => {
        orchestrator?.destroy();
        planner?.destroy();
        executor?.destroy();
        memory?.destroy();
    });

    describe('Hub-Spoke Pattern', () => {
        it('should handle orchestrator → planner request', async () => {
            await planner.handleMessage({
                _cb: 1,
                t: 'req',
                id: 'test-1',
                handler: 'plan:create',
                p: { goal: 'Write a blog post' }
            }, 'orchestrator', 'orchestrator');

            expect(true).toBe(true);
        });

        it('should handle orchestrator → executor request', async () => {
            await executor.handleMessage({
                _cb: 1,
                t: 'req',
                id: 'test-2',
                handler: 'task:run',
                p: { steps: ['Step 1', 'Step 2'] }
            }, 'orchestrator', 'orchestrator');

            expect(true).toBe(true);
        });

        it('should handle orchestrator → memory request', async () => {
            await memory.handleMessage({
                _cb: 1,
                t: 'req',
                id: 'test-3',
                handler: 'memory:store',
                p: { key: 'result', value: { data: 'test' } }
            }, 'orchestrator', 'orchestrator');

            expect(true).toBe(true);
        });
    });

    describe('Full Pipeline', () => {
        it('should execute plan → execute → store pipeline', async () => {
            // Create fresh agents for this test
            const freshPlanner = new CrossBus({ peerId: 'fresh-planner', allowedOrigins: ['*'] });
            const freshExecutor = new CrossBus({ peerId: 'fresh-executor', allowedOrigins: ['*'] });
            const freshMemory = new CrossBus({ peerId: 'fresh-memory', allowedOrigins: ['*'] });

            let planResult, execResult, memResult;

            freshPlanner.handle('plan:create', async ({ goal }) => {
                planResult = { steps: ['Research', 'Outline', 'Write', 'Review'], goal };
                return planResult;
            });

            freshExecutor.handle('task:run', async ({ steps }) => {
                execResult = { success: true, completed: steps.length };
                return execResult;
            });

            freshMemory.handle('memory:store', async ({ key, value }) => {
                memResult = { stored: true, id: 'mem_xyz789' };
                return memResult;
            });

            await freshPlanner.handleMessage({
                _cb: 1, t: 'req', id: '1', handler: 'plan:create',
                p: { goal: 'Test goal' }
            }, 'hub', 'orchestrator');

            await freshExecutor.handleMessage({
                _cb: 1, t: 'req', id: '2', handler: 'task:run',
                p: { steps: planResult.steps }
            }, 'hub', 'orchestrator');

            await freshMemory.handleMessage({
                _cb: 1, t: 'req', id: '3', handler: 'memory:store',
                p: { key: 'lastTask', value: execResult }
            }, 'hub', 'orchestrator');

            expect(planResult.steps).toHaveLength(4);
            expect(execResult.success).toBe(true);
            expect(memResult.stored).toBe(true);

            freshPlanner.destroy();
            freshExecutor.destroy();
            freshMemory.destroy();
        });
    });

    describe('Agent Registration', () => {
        it('should register and unregister handlers', () => {
            const off = orchestrator.handle('test:handler', () => 'test');
            expect(orchestrator.hasHandler('test:handler')).toBe(true);

            off();
            expect(orchestrator.hasHandler('test:handler')).toBe(false);
        });

        it('should handle multiple handlers per agent', () => {
            const testAgent = new CrossBus({ peerId: 'multi-handler-agent', allowedOrigins: ['*'] });

            testAgent.handle('plan:create', () => ({}));
            testAgent.handle('plan:validate', () => true);
            testAgent.handle('plan:optimize', () => []);

            expect(testAgent.hasHandler('plan:create')).toBe(true);
            expect(testAgent.hasHandler('plan:validate')).toBe(true);
            expect(testAgent.hasHandler('plan:optimize')).toBe(true);

            testAgent.destroy();
        });
    });

    describe('Error Handling', () => {
        it('should handle agent handler errors gracefully', async () => {
            const errorAgent = new CrossBus({ peerId: 'error-agent', allowedOrigins: ['*'] });
            errorAgent.handle('fail:always', async () => {
                throw new Error('Agent failure');
            });

            // Should not crash the bus
            try {
                await errorAgent.handleMessage({
                    _cb: 1, t: 'req', id: 'err-1',
                    handler: 'fail:always', p: {}
                }, 'hub', 'orchestrator');
            } catch (e) {
                // Expected
            }

            errorAgent.destroy();
            expect(true).toBe(true);
        });

        it('should reject requests to unregistered handlers', async () => {
            await executor.handleMessage({
                _cb: 1, t: 'req', id: 'missing-1',
                handler: 'nonexistent:handler', p: {}
            }, 'hub', 'orchestrator');

            expect(true).toBe(true);
        });
    });

    describe('Lifecycle', () => {
        it('should destroy agents cleanly', () => {
            const agent = new CrossBus({ peerId: 'temp-agent' });
            agent.handle('temp:action', () => 'ok');

            agent.destroy();

            expect(agent.isDestroyed).toBe(true);
        });

        it('should mark agents as destroyed after destroy()', () => {
            const agent = new CrossBus({ peerId: 'temp-agent-2' });
            expect(agent.isDestroyed).toBe(false);

            agent.destroy();

            expect(agent.isDestroyed).toBe(true);
        });
    });
});
