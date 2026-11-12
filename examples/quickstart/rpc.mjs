import { CrossBus } from 'crossbus';
const { MessageChannelTransport } = await import('crossbus');

// Two endpoints connected by a real MessageChannel in this process.
// "channel" is this transport's origin label, not a website address.
const client = CrossBus.createSecure({ peerId: 'client', allowedOrigins: ['channel'] });
const service = CrossBus.createSecure({ peerId: 'service', allowedOrigins: ['channel'] });
const channel = new MessageChannelTransport();
client.addTransport(channel, { peerId: 'service', origin: 'channel' });
service.addTransport(MessageChannelTransport.fromPort(channel.remotePort), {
  peerId: 'client', origin: 'channel'
});
service.handle('sum', ({ a, b }) => a + b);

try {
  console.log(await client.request('service', 'sum', { a: 2, b: 3 })); // 5
} finally {
  client.destroy();
  service.destroy();
}
