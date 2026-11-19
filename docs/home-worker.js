// Module Worker behind the live strip on the home page. Imported statically so
// the message listener exists before the page transfers the port.
import { CrossBus, MessageChannelTransport } from './assets/crossbus.min.js';

// #region worker
const bus = CrossBus.createSecure({
    peerId: 'worker',
    allowedOrigins: ['channel']
});

// Counts the primes below a limit, off the main thread.
bus.handle('primes', ({ below }) => {
    if (!Number.isSafeInteger(below) || below < 2 || below > 1e7) {
        throw new RangeError('below must be from 2 to 10,000,000');
    }
    const composite = new Uint8Array(below);
    let count = 0;
    for (let n = 2; n < below; n++) {
        if (composite[n]) continue;
        count++;
        for (let m = n * n; m < below; m += n) composite[m] = 1;
    }
    return { count };
});

self.onmessage = ({ data }) => {
    const port = MessageChannelTransport.fromPort(data.port);
    bus.addTransport(port, { peerId: 'page', origin: 'channel' });
    bus.signal('worker:ready');
};
// #endregion
