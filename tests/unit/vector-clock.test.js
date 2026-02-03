/**
 * @fileoverview TDD tests for VectorClock.
 * Vector clocks enable causal ordering of distributed events.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { VectorClock } from '../../src/ordering/vector-clock.js';

describe('VectorClock', () => {
    describe('constructor', () => {
        it('should create empty clock', () => {
            const clock = new VectorClock('node-1');
            expect(clock.get('node-1')).toBe(0);
            expect(clock.ownId).toBe('node-1');
        });

        it('should initialize with provided values', () => {
            const clock = new VectorClock('node-1', { 'node-1': 5, 'node-2': 3 });
            expect(clock.get('node-1')).toBe(5);
            expect(clock.get('node-2')).toBe(3);
        });
    });

    describe('tick()', () => {
        it('should increment own counter', () => {
            const clock = new VectorClock('node-1');
            clock.tick();
            expect(clock.get('node-1')).toBe(1);
            clock.tick();
            expect(clock.get('node-1')).toBe(2);
        });

        it('should return new counter value', () => {
            const clock = new VectorClock('node-1');
            expect(clock.tick()).toBe(1);
            expect(clock.tick()).toBe(2);
        });
    });

    describe('update()', () => {
        it('should merge clocks taking max of each component', () => {
            const clock1 = new VectorClock('node-1', { 'node-1': 3, 'node-2': 2 });
            const clock2 = new VectorClock('node-2', { 'node-1': 1, 'node-2': 5, 'node-3': 4 });

            clock1.update(clock2);

            expect(clock1.get('node-1')).toBe(3); // max(3,1)
            expect(clock1.get('node-2')).toBe(5); // max(2,5)
            expect(clock1.get('node-3')).toBe(4); // new from clock2
        });

        it('should handle update with empty clock', () => {
            const clock1 = new VectorClock('node-1', { 'node-1': 3 });
            const clock2 = new VectorClock('node-2');

            clock1.update(clock2);
            expect(clock1.get('node-1')).toBe(3);
        });
    });

    describe('happenedBefore()', () => {
        it('should detect A happened-before B', () => {
            const clockA = new VectorClock('node-1', { 'node-1': 1, 'node-2': 0 });
            const clockB = new VectorClock('node-2', { 'node-1': 1, 'node-2': 1 });

            expect(clockA.happenedBefore(clockB)).toBe(true);
            expect(clockB.happenedBefore(clockA)).toBe(false);
        });

        it('should detect concurrent events', () => {
            const clockA = new VectorClock('node-1', { 'node-1': 2, 'node-2': 1 });
            const clockB = new VectorClock('node-2', { 'node-1': 1, 'node-2': 2 });

            expect(clockA.happenedBefore(clockB)).toBe(false);
            expect(clockB.happenedBefore(clockA)).toBe(false);
            expect(clockA.isConcurrentWith(clockB)).toBe(true);
        });

        it('should handle identical clocks', () => {
            const clockA = new VectorClock('node-1', { 'node-1': 2, 'node-2': 3 });
            const clockB = new VectorClock('node-2', { 'node-1': 2, 'node-2': 3 });

            expect(clockA.happenedBefore(clockB)).toBe(false);
            expect(clockA.isConcurrentWith(clockB)).toBe(false);
        });
    });

    describe('canDeliver()', () => {
        it('should allow delivery when deps satisfied', () => {
            // Local clock knows: node-2 has sent 3 messages
            const localClock = new VectorClock('node-1', { 'node-1': 5, 'node-2': 3 });

            // Incoming message from node-2 with seq 4, depends on node-2:3
            const msgClock = new VectorClock('node-2', { 'node-1': 2, 'node-2': 4 });
            const senderId = 'node-2';

            expect(localClock.canDeliver(msgClock, senderId)).toBe(true);
        });

        it('should block delivery when deps missing', () => {
            // Local clock knows: node-2 has sent 2 messages
            const localClock = new VectorClock('node-1', { 'node-1': 5, 'node-2': 2 });

            // Incoming message from node-2 with seq 4, depends on node-2:3 we haven't seen
            const msgClock = new VectorClock('node-2', { 'node-1': 2, 'node-2': 4 });
            const senderId = 'node-2';

            expect(localClock.canDeliver(msgClock, senderId)).toBe(false);
        });

        it('should allow first message from new peer', () => {
            const localClock = new VectorClock('node-1', { 'node-1': 5 });
            const msgClock = new VectorClock('node-2', { 'node-2': 1 });
            const senderId = 'node-2';

            expect(localClock.canDeliver(msgClock, senderId)).toBe(true);
        });
    });

    describe('serialization', () => {
        it('should serialize to JSON', () => {
            const clock = new VectorClock('node-1', { 'node-1': 3, 'node-2': 5 });
            const json = clock.toJSON();

            expect(json.ownId).toBe('node-1');
            expect(json.counters['node-1']).toBe(3);
            expect(json.counters['node-2']).toBe(5);
        });

        it('should deserialize from JSON', () => {
            const json = { ownId: 'node-1', counters: { 'node-1': 3, 'node-2': 5 } };
            const clock = VectorClock.fromJSON(json);

            expect(clock.ownId).toBe('node-1');
            expect(clock.get('node-1')).toBe(3);
            expect(clock.get('node-2')).toBe(5);
        });

        it('should clone correctly', () => {
            const clock = new VectorClock('node-1', { 'node-1': 3, 'node-2': 5 });
            const clone = clock.clone();

            clone.tick();
            expect(clone.get('node-1')).toBe(4);
            expect(clock.get('node-1')).toBe(3); // Original unchanged
        });
    });
});
