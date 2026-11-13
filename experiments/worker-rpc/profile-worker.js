// Diagnostic endpoint: unminified frozen runtime keeps private method names visible.
import { CrossBus, MessageChannelTransport } from '../../benchmarks/worker-rpc/baseline/crossbus.js';
self.onmessage = ({data: {port, hooks}}) => {
    const bus = CrossBus.createSecure({peerId: 'service', allowedOrigins: ['channel']});
    bus.addTransport(MessageChannelTransport.fromPort(port), {peerId: 'client', origin: 'channel'});
    let calls = 0;
    bus.handle('echo', value => { calls++; return value; });
    bus.handle('stats', () => calls);
    if (hooks) {
        bus.addInboundHook(async value => value);
        bus.addOutboundHook(async value => value);
    }
    self.postMessage({ready: true});
};
