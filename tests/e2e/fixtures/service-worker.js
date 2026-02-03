// ServiceWorker for testing
self.addEventListener('install', () => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener('message', (event) => {
    // Echo message back to client
    event.source.postMessage({
        type: 'echo',
        originalData: event.data
    });
});
