/**
 * @fileoverview TDD tests for CausalOrderer.
 * CausalOrderer buffers out-of-order messages and delivers them causally.
 */

import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { CausalOrderer } from '../../src/ordering/causal-orderer.js';
import { VectorClock } from '../../src/ordering/vector-clock.js';

describe('CausalOrderer', () => {
    let orderer;
    let deliveredMessages;
    let onDeliver;

    beforeEach(() => {
        deliveredMessages = [];
        onDeliver = (msg) => deliveredMessages.push(msg);
        orderer = new CausalOrderer('node-1', { onDeliver });
    });

    describe('constructor', () => {
        it('should create orderer with own ID', () => {
            expect(orderer.ownId).toBe('node-1');
        });

        it('should start with empty buffer', () => {
            expect(orderer.bufferSize).toBe(0);
        });
    });

    describe('receive() - in-order delivery', () => {
        it('should deliver first message from peer immediately', () => {
            const clock = new VectorClock('node-2', { 'node-2': 1 });
            const msg = { data: 'hello', clock: clock.toJSON() };

            orderer.receive('node-2', msg);

            expect(deliveredMessages).toHaveLength(1);
            expect(deliveredMessages[0].data).toBe('hello');
        });

        it('should deliver consecutive messages in order', () => {
            // Message 1 from node-2
            const clock1 = new VectorClock('node-2', { 'node-2': 1 });
            orderer.receive('node-2', { seq: 1, clock: clock1.toJSON() });

            // Message 2 from node-2
            const clock2 = new VectorClock('node-2', { 'node-2': 2 });
            orderer.receive('node-2', { seq: 2, clock: clock2.toJSON() });

            expect(deliveredMessages).toHaveLength(2);
            expect(deliveredMessages[0].seq).toBe(1);
            expect(deliveredMessages[1].seq).toBe(2);
        });
    });

    describe('receive() - buffering out-of-order', () => {
        it('should buffer message when deps missing', () => {
            // Skip message 1, send message 2 first
            const clock2 = new VectorClock('node-2', { 'node-2': 2 });
            orderer.receive('node-2', { seq: 2, clock: clock2.toJSON() });

            expect(deliveredMessages).toHaveLength(0);
            expect(orderer.bufferSize).toBe(1);
        });

        it('should deliver buffered message when deps arrive', () => {
            // Send message 2 first (out of order)
            const clock2 = new VectorClock('node-2', { 'node-2': 2 });
            orderer.receive('node-2', { seq: 2, clock: clock2.toJSON() });

            expect(deliveredMessages).toHaveLength(0);

            // Send message 1 (the missing dep)
            const clock1 = new VectorClock('node-2', { 'node-2': 1 });
            orderer.receive('node-2', { seq: 1, clock: clock1.toJSON() });

            // Both should be delivered now
            expect(deliveredMessages).toHaveLength(2);
            expect(deliveredMessages[0].seq).toBe(1);
            expect(deliveredMessages[1].seq).toBe(2);
        });

        it('should handle multiple buffered messages', () => {
            // Send 3, 4, 5 before 1, 2
            for (let i = 3; i <= 5; i++) {
                const clock = new VectorClock('node-2', { 'node-2': i });
                orderer.receive('node-2', { seq: i, clock: clock.toJSON() });
            }
            expect(deliveredMessages).toHaveLength(0);
            expect(orderer.bufferSize).toBe(3);

            // Send 1, 2 to unblock
            for (let i = 1; i <= 2; i++) {
                const clock = new VectorClock('node-2', { 'node-2': i });
                orderer.receive('node-2', { seq: i, clock: clock.toJSON() });
            }

            expect(deliveredMessages).toHaveLength(5);
            expect(deliveredMessages.map(m => m.seq)).toEqual([1, 2, 3, 4, 5]);
        });
    });

    describe('receive() - multi-peer causal deps', () => {
        it('should block on missing deps from other peers', () => {
            // node-2 sends message that depends on node-3's message 1
            const clock = new VectorClock('node-2', { 'node-2': 1, 'node-3': 1 });
            orderer.receive('node-2', { data: 'depends-on-3', clock: clock.toJSON() });

            // Should be buffered because we haven't seen node-3:1
            expect(deliveredMessages).toHaveLength(0);
            expect(orderer.bufferSize).toBe(1);
        });

        it('should deliver when cross-peer deps satisfied', () => {
            // node-2's message depends on node-3:1
            const clock2 = new VectorClock('node-2', { 'node-2': 1, 'node-3': 1 });
            orderer.receive('node-2', { from: 'node-2', clock: clock2.toJSON() });

            expect(deliveredMessages).toHaveLength(0);

            // Now node-3:1 arrives
            const clock3 = new VectorClock('node-3', { 'node-3': 1 });
            orderer.receive('node-3', { from: 'node-3', clock: clock3.toJSON() });

            // Both should be delivered
            expect(deliveredMessages).toHaveLength(2);
        });
    });

    describe('buffer management', () => {
        it('should respect maxBufferSize', () => {
            const smallOrderer = new CausalOrderer('node-1', {
                onDeliver,
                maxBufferSize: 3
            });

            // Fill buffer with out-of-order messages
            for (let i = 2; i <= 5; i++) {
                const clock = new VectorClock('node-2', { 'node-2': i });
                smallOrderer.receive('node-2', { seq: i, clock: clock.toJSON() });
            }

            expect(smallOrderer.bufferSize).toBe(3); // Capped at max
        });

        it('should emit buffer:overflow event when limit reached', () => {
            const overflowHandler = mock();
            const smallOrderer = new CausalOrderer('node-1', {
                onDeliver,
                maxBufferSize: 2,
                onBufferOverflow: overflowHandler
            });

            // Fill beyond limit
            for (let i = 2; i <= 4; i++) {
                const clock = new VectorClock('node-2', { 'node-2': i });
                smallOrderer.receive('node-2', { seq: i, clock: clock.toJSON() });
            }

            expect(overflowHandler).toHaveBeenCalled();
        });
    });

    describe('getVectorClock()', () => {
        it('should return current clock state', () => {
            const clock1 = new VectorClock('node-2', { 'node-2': 1 });
            orderer.receive('node-2', { clock: clock1.toJSON() });

            const currentClock = orderer.getVectorClock();
            expect(currentClock.get('node-2')).toBe(1);
        });

        it('should update clock after delivery', () => {
            for (let i = 1; i <= 3; i++) {
                const clock = new VectorClock('node-2', { 'node-2': i });
                orderer.receive('node-2', { seq: i, clock: clock.toJSON() });
            }

            const currentClock = orderer.getVectorClock();
            expect(currentClock.get('node-2')).toBe(3);
        });
    });

    describe('tick()', () => {
        it('should increment own clock for sending', () => {
            const sendClock = orderer.tick();
            expect(sendClock.get('node-1')).toBe(1);

            const sendClock2 = orderer.tick();
            expect(sendClock2.get('node-1')).toBe(2);
        });
    });

    describe('clear()', () => {
        it('should clear buffer', () => {
            const clock = new VectorClock('node-2', { 'node-2': 2 });
            orderer.receive('node-2', { clock: clock.toJSON() });

            expect(orderer.bufferSize).toBe(1);

            orderer.clear();

            expect(orderer.bufferSize).toBe(0);
        });
    });
});
