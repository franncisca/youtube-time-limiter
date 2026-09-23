/* A development-only static server; it never ships as the extension backend. */
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { root } = require('./paths.cjs');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
async function responseFor(rawURL) {
  const pathname = decodeURIComponent(new URL(rawURL, 'http://localhost').pathname);
  const route = pathname === '/' ? '/prototype/index.html' : pathname;
  if (!/^\/(prototype|src)\//.test(route)) return { status: 404, body: 'Not found' };
  const file = path.resolve(root, '.' + route);
  if (!['prototype', 'src'].some(dir => file.startsWith(path.join(root, dir) + path.sep))) return { status: 404, body: 'Not found' };
  const type = mime[path.extname(file)];
  if (!type) return { status: 404, body: 'Not found' };
  let body;
  try { body = await fs.readFile(file, 'utf8'); } catch { return { status: 404, body: 'Not found' }; }
  if (route === '/src/options/index.html') {
    body = body.replace('<script src="index.js"></script>', '<script src="/prototype/mock-runtime.js"></script><script src="index.js"></script>');
    body = body.replace('<body class="ytl-settings">', '<body class="ytl-settings"><p style="text-align:center;font:12px system-ui;color:#576951">PROTOTYPE · simulated local data · not your extension settings</p>');
  }
  return { status: 200, type, body };
}
function createServer() {
  return http.createServer(async (req, res) => {
    try {
      if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
      const result = await responseFor(req.url);
      res.writeHead(result.status, { 'Content-Type': result.type || 'text/plain', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      res.end(req.method === 'HEAD' ? undefined : result.body);
    } catch { res.writeHead(400); res.end('Bad request'); }
  });
}
module.exports = { createServer, responseFor };
if (require.main === module) {
  const port = Number(process.env.PORT || 8765);
  const server = createServer();
  server.on('error', error => { console.error(error.message); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log(`Prototype: http://127.0.0.1:${port} (Ctrl+C to stop)`));
}
