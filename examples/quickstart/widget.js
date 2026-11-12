import { CrossBus } from 'crossbus';
const { PostMessageTransport } = await import('crossbus');

const { peerOrigin: appOrigin } = await fetch('/config.json').then(response => response.json());
const widget = CrossBus.createSecure({ peerId: 'widget', allowedOrigins: [appOrigin] });
widget.addTransport(new PostMessageTransport(window.parent, {
  targetOrigin: appOrigin, allowedOrigins: [appOrigin]
}), { peerId: 'hub' });

// Register before announcing readiness. The parent answers only after its own
// transport is installed, independently of HTML load/module evaluation timing.
widget.once('hub:ready', async () => {
  const data = await widget.request('hub', 'getData', { id: 123 });
  document.querySelector('#result').textContent = JSON.stringify(data);
}, { mode: 'sync' });
await widget.signal('widget:ready');
