/**
 * Compute Worker
 * 
 * Worker thread for heavy computation. Communicates with main
 * thread via CrossBus PostMessageTransport.
 */

import { CrossBus, PostMessageTransport } from 'crossbus';

// Create bus in worker
const bus = new CrossBus({
    peerId: 'worker',
    allowedOrigins: ['*'],
});

// Connect to main thread
bus.addTransport(new PostMessageTransport(self), { peerId: 'main' });

console.log('[Worker] Ready');

// ============================================
// COMPUTE HANDLERS
// ============================================

/**
 * Sum handler - compute sum of numbers array
 */
bus.handle('compute:sum', ({ numbers }) => {
    console.log(`[Worker] Computing sum of ${numbers.length} numbers`);

    let sum = 0;
    for (let i = 0; i < numbers.length; i++) {
        sum += numbers[i];
    }

    return { sum };
});

/**
 * Sort handler - sort array with optional key and direction
 */
bus.handle('compute:sort', ({ data, ascending = true, key }) => {
    console.log(`[Worker] Sorting ${data.length} items`);

    const sorted = [...data].sort((a, b) => {
        const valA = key ? a[key] : a;
        const valB = key ? b[key] : b;
        return ascending ? valA - valB : valB - valA;
    });

    return { data: sorted };
});

/**
 * Process handler - process data with progress reporting
 */
bus.handle('compute:process', ({ data, reportProgress }) => {
    console.log(`[Worker] Processing ${data.length} items`);

    const chunkSize = Math.ceil(data.length / 10);
    const results = [];

    for (let i = 0; i < data.length; i += chunkSize) {
        const chunk = data.slice(i, i + chunkSize);

        // Process chunk (simulate work)
        const processed = chunk.map((item) => {
            // Simulate some computation
            return typeof item === 'number' ? Math.sqrt(item) : item;
        });

        results.push(...processed);

        // Report progress
        if (reportProgress) {
            const percent = Math.round(((i + chunk.length) / data.length) * 100);
            bus.signal('worker:progress', {
                percent,
                processed: i + chunk.length,
                total: data.length,
            });
        }
    }

    return { data: results };
});

/**
 * Crypto handler - compute hash of data
 */
bus.handle('compute:hash', async ({ data, algorithm = 'SHA-256' }) => {
    console.log(`[Worker] Computing ${algorithm} hash`);

    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(JSON.stringify(data));
    const hashBuffer = await crypto.subtle.digest(algorithm, dataBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

    return { hash: hashHex, algorithm };
});

/**
 * Matrix multiplication handler
 */
bus.handle('compute:matmul', ({ a, b }) => {
    console.log(`[Worker] Matrix multiplication ${a.length}x${a[0].length} * ${b.length}x${b[0].length}`);

    const rowsA = a.length;
    const colsA = a[0].length;
    const colsB = b[0].length;

    const result = Array(rowsA)
        .fill(null)
        .map(() => Array(colsB).fill(0));

    for (let i = 0; i < rowsA; i++) {
        for (let j = 0; j < colsB; j++) {
            for (let k = 0; k < colsA; k++) {
                result[i][j] += a[i][k] * b[k][j];
            }
        }
    }

    return { result };
});

// ============================================
// LIFECYCLE
// ============================================

bus.on('worker:shutdown', () => {
    console.log('[Worker] Shutting down');
    bus.destroy();
    self.close();
});

// Announce ready
bus.signal('worker:ready', { peerId: 'worker' });
