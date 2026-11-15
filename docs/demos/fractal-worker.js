// Module Worker for the worker-pool demo. Imported statically so the message
// listener exists before the page transfers the port.
import { CrossBus, MessageChannelTransport } from '../assets/crossbus.min.js';
import { buildPalette, renderTile } from './fractal.js';

const palette = buildPalette();

// #region worker
self.onmessage = ({ data }) => {
    if (data?.type !== 'crossbus:connect' || !data.port) return;
    const bus = CrossBus.createSecure({ peerId: data.name, allowedOrigins: ['channel'] });
    // autoTransfer moves each tile's pixel buffer back instead of copying it.
    const transport = MessageChannelTransport.fromPort(data.port, {
        wireFormat: data.wireFormat,
        autoTransfer: true
    });
    bus.addTransport(transport, { peerId: 'main', origin: 'channel' });

    bus.handle('tile', tile => renderTile(tile, palette));
    bus.signal('worker:ready', { cores: navigator.hardwareConcurrency });
};
// #endregion
