import { CrossBus } from 'crossbus';
const { PostMessageTransport } = await import('crossbus');

const widgetOrigin = 'https://widget.example.com';
const hub = CrossBus.createSecure({
  peerId: 'hub', isHub: true, allowedOrigins: [widgetOrigin]
});
hub.handle('getData', ({ id }) => ({ id, status: 'ready' }));

const iframe = document.createElement('iframe');
// Install the load callback before starting navigation. The widget installs its
// transport and ready handler before its load event can reach the parent.
iframe.addEventListener('load', async () => {
  hub.addTransport(new PostMessageTransport(iframe.contentWindow, {
    targetOrigin: widgetOrigin, allowedOrigins: [widgetOrigin]
  }), { peerId: 'widget' });
  await hub.signal('hub:ready');
}, { once: true });
iframe.src = `${widgetOrigin}/widget.html`;
document.body.append(iframe);

// On teardown, close every attached transport:
// hub.destroy();
