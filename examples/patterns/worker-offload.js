/**
 * Worker Offload Pattern Example
 * 
 * Demonstrates offloading heavy computation to a Web Worker
 * while keeping the main thread responsive.
 * 
 * Files:
 * - worker-offload.js (this file - main thread)
 * - compute-worker.js (worker thread)
 */

// ============================================
// MAIN THREAD CODE
// ============================================

import { CrossBus, PostMessageTransport } from 'crossbus';

// Create bus on main thread
const bus = new CrossBus({
    peerId: 'main',
    allowedOrigins: ['*'],
});

// Create worker and connect
const worker = new Worker(new URL('./compute-worker.js', import.meta.url));

bus.addTransport(new PostMessageTransport(worker), { peerId: 'worker' });

console.log('[Main] Worker connected');

// ============================================
// API FUNCTIONS
// ============================================

/**
 * Compute sum of large array in worker
 */
export async function computeSum(numbers) {
    console.log(`[Main] Offloading sum of ${numbers.length} numbers to worker`);
    const start = performance.now();

    const result = await bus.request('worker', 'compute:sum', { numbers });

    const elapsed = performance.now() - start;
    console.log(`[Main] Worker completed in ${elapsed.toFixed(2)}ms`);

    return result.sum;
}

/**
 * Sort large array in worker
 */
export async function sortArray(data, options = {}) {
    console.log(`[Main] Offloading sort of ${data.length} items to worker`);

    return bus.request('worker', 'compute:sort', {
        data,
        ascending: options.ascending ?? true,
        key: options.key,
    });
}

/**
 * Process data in chunks with progress updates
 */
export async function processWithProgress(data, onProgress) {
    console.log(`[Main] Processing ${data.length} items with progress`);

    // Listen for progress updates
    const unsubscribe = bus.on('worker:progress', (event) => {
        onProgress?.(event.data);
    });

    try {
        const result = await bus.request('worker', 'compute:process', {
            data,
            reportProgress: true,
        });
        return result;
    } finally {
        unsubscribe();
    }
}

/**
 * Terminate worker and cleanup
 */
export function terminate() {
    bus.signal('worker:shutdown', {});
    setTimeout(() => {
        worker.terminate();
        bus.destroy();
    }, 100);
}

// ============================================
// USAGE EXAMPLE
// ============================================

async function demo() {
    // Generate large dataset
    const largeArray = Array(1_000_000)
        .fill(0)
        .map(() => Math.random() * 1000);

    // Compute sum (main thread stays responsive!)
    const sum = await computeSum(largeArray);
    console.log(`Sum: ${sum}`);

    // Sort with progress
    const sorted = await processWithProgress(largeArray, (progress) => {
        console.log(`Progress: ${progress.percent}%`);
    });
    console.log(`Sorted ${sorted.data.length} items`);

    // Cleanup
    terminate();
}

// Export worker creation for testing
export { bus, worker };
