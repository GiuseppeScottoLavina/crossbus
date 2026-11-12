import { CrossBus } from 'crossbus';
const { PostMessageTransport } = await import('crossbus');

const appOrigin = 'https://app.example.com';
const widget = CrossBus.createSecure({ peerId: 'widget', allowedOrigins: [appOrigin] });
widget.addTransport(new PostMessageTransport(window.parent, {
  targetOrigin: appOrigin, allowedOrigins: [appOrigin]
}), { peerId: 'hub' });

// Wait for the parent endpoint before sending the first request. Keep module
// evaluation non-blocking so the iframe's load event can reach the parent.
widget.once('hub:ready', async () => {
  const data = await widget.request('hub', 'getData', { id: 123 });
  document.querySelector('#result').textContent = JSON.stringify(data);
}, { mode: 'sync' });
