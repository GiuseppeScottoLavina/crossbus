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

import { CrossBus } from 'crossbus';
const { MessageChannelTransport } = await import('crossbus');

// The worker is reached through a dedicated MessageChannel. Its fixed origin
// label is "channel"; the peer identity comes from this binding, not payloads.
// The demo sends arrays of up to one million numbers, so the 1 MiB default
// payload budget is raised deliberately. Size it for your own workloads.
const MAX_PAYLOAD = 64 * 1024 * 1024;

const bus = CrossBus.createSecure({
    peerId: 'main',
    allowedOrigins: ['channel'],
    maxPayloadSize: MAX_PAYLOAD,
});

// compute-worker.js uses ES module imports, so the Worker must be a module worker.
const worker = new Worker(new URL('./compute-worker.js', import.meta.url), { type: 'module' });
const channel = new MessageChannelTransport();
bus.addTransport(channel, { peerId: 'worker', origin: 'channel' });

// Wait for the worker's ready signal before issuing requests.
const ready = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Worker initialization timed out')), 5000);
    bus.once('worker:ready', () => {
        clearTimeout(timeout);
        console.log('[Main] Worker connected');
        resolve();
    }, { mode: 'sync' });
    worker.onerror = (event) => {
        clearTimeout(timeout);
        reject(new Error(event.message));
    };
});

// Hand the other end of the channel to the worker.
worker.postMessage({ port: channel.remotePort }, [channel.remotePort]);
channel.markRemoteTransferred();

// ============================================
// API FUNCTIONS
// ============================================

/**
 * Compute sum of large array in worker
 */
export async function computeSum(numbers) {
    console.log(`[Main] Offloading sum of ${numbers.length} numbers to worker`);
    await ready;
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
    await ready;

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
    await ready;

    // Listen for progress updates
    const subscription = bus.on('worker:progress', (event) => {
        onProgress?.(event.data.payload);
    });

    try {
        const result = await bus.request('worker', 'compute:process', {
            data,
            reportProgress: true,
        });
        return result;
    } finally {
        subscription.unsubscribe();
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
export { bus, worker, ready };
