import { CrossBus } from 'crossbus';
const { PostMessageTransport } = await import('crossbus');

const { peerOrigin: widgetOrigin } = await fetch('/config.json').then(response => response.json());
const hub = CrossBus.createSecure({
  peerId: 'hub', isHub: true, allowedOrigins: [widgetOrigin]
});
hub.handle('getData', ({ id }) => ({ id, status: 'ready' }));

const iframe = document.createElement('iframe');
// Attach the WindowProxy while the iframe is still about:blank, before starting
// its navigation. Only messages from the exact widget origin will be accepted.
document.body.append(iframe);
hub.addTransport(new PostMessageTransport(iframe.contentWindow, {
  targetOrigin: widgetOrigin, allowedOrigins: [widgetOrigin]
}), { peerId: 'widget' });
hub.once('widget:ready', async () => {
  await hub.signal('hub:ready');
}, { mode: 'sync' });
iframe.src = `${widgetOrigin}/widget.html`;

// On teardown, close every attached transport:
// hub.destroy();
