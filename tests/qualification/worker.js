import { CrossBus, MessageChannelTransport, StreamManager } from '/dist/crossbus.min.js';
self.onmessage = ({ data: { rpc, stream } }) => {
    const bus = CrossBus.createSecure({ peerId: 'worker', allowedOrigins: ['channel'] });
    bus.addTransport(MessageChannelTransport.fromPort(rpc, { autoTransfer: true }), {
        peerId: 'main',
        origin: 'channel'
    });
    bus.addInboundHook(async (v) => v);
    bus.addOutboundHook(async (v) => v);
    let calls = 0;
    bus.handle('echo', (v) => {
        calls++;
        return v;
    });
    bus.handle('stats', () => calls);
    const transport = MessageChannelTransport.fromPort(stream, { autoTransfer: true });
    const streams = new StreamManager((_peer, m) => transport.send(m));
    transport.onMessage((m) => streams.handleMessage(m, 'main'));
    streams.onStream('binary', async (reader) => {
        const value = await reader.collect();
        self.postMessage({ kind: 'stream', value }, [value.buffer]);
    });
    self.postMessage({ kind: 'ready' });
};
