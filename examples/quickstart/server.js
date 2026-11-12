import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

// Serve only this example and the committed distribution. No bundler is needed.
export async function startQuickstart({ appPort = 8780, widgetPort = 8781 } = {}) {
  const origins = {};
  const servers = [];
  function createEndpoint(role) {
    const routes = new Map([
      ['/', [`./${role}.html`, 'text/html; charset=utf-8']],
      [`/${role}.html`, [`./${role}.html`, 'text/html; charset=utf-8']],
      [`/${role}.js`, [`./${role}.js`, 'text/javascript; charset=utf-8']],
      ['/crossbus.js', ['../../dist/crossbus.js', 'text/javascript; charset=utf-8']]
    ]);
    const server = createServer(async (request, response) => {
      try {
        const path = new URL(request.url, 'http://127.0.0.1').pathname;
        response.setHeader('Cache-Control', 'no-store');
        if (path === '/config.json') {
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ peerOrigin: origins[role === 'hub' ? 'widget' : 'app'] }));
          return;
        }
        const route = routes.get(path);
        if (!route) { response.writeHead(404); response.end('Not found'); return; }
        const data = await readFile(new URL(route[0], import.meta.url));
        response.setHeader('Content-Type', route[1]);
        response.end(data);
      } catch {
        response.writeHead(500); response.end('Could not load the example files');
      }
    });
    servers.push(server);
    return server;
  }
  const close = async () => {
    await Promise.all(servers.filter(server => server.listening).map(server => new Promise((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
      server.closeIdleConnections?.();
    })));
  };
  async function listen(server, port) {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', resolve);
    });
    return `http://127.0.0.1:${server.address().port}`;
  }
  try {
    origins.app = await listen(createEndpoint('hub'), appPort);
    origins.widget = await listen(createEndpoint('widget'), widgetPort);
    return { ...origins, close };
  } catch (error) { await close(); throw error; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const demo = await startQuickstart();
    console.log(`Open ${demo.app}/\nWidget origin: ${demo.widget}\nPress Ctrl+C to stop.`);
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
      demo.close().catch(error => { console.error(error.message); process.exitCode = 1; });
    });
  } catch (error) { console.error(`Could not start the demo: ${error.message}`); process.exitCode = 1; }
}
