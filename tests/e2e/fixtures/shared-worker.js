// SharedWorker for testing
const connections = [];

self.onconnect = (e) => {
    const port = e.ports[0];
    connections.push(port);

    port.onmessage = (event) => {
        // Broadcast to all connections
        connections.forEach(p => {
            if (p !== port) {
                p.postMessage(event.data);
            }
        });
    };

    port.start();
};
