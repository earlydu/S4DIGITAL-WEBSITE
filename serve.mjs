// Minimal zero-dependency static server for the s4digital build (incl. PlanPulse).
// Run: node serve.mjs  →  http://localhost:4000   |  PlanPulse: http://localhost:4000/planpulse
import { createServer } from 'node:http';
import { stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 4000;

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
};

const server = createServer(async (req, res) => {
  try {
    let urlPath = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname);
    if (urlPath === '/') urlPath = '/index.html';

    const safePath = normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
    let filePath = join(ROOT, safePath);
    if (!filePath.startsWith(ROOT)) { res.writeHead(403).end('Forbidden'); return; }

    // Clean URLs: /planpulse -> planpulse.html, /trade -> trade/index.html
    if (!extname(filePath)) {
      for (const c of [filePath + '.html', join(filePath, 'index.html')]) {
        try { const s = await stat(c); if (s.isFile()) { filePath = c; break; } } catch {}
      }
    }

    const type = TYPES[extname(filePath).toLowerCase()] || 'application/octet-stream';
    const info = await stat(filePath);

    const range = req.headers.range;
    if (range && /^bytes=/.test(range)) {
      const [s0, e0] = range.replace(/bytes=/, '').split('-');
      const start = parseInt(s0, 10) || 0;
      const end = e0 ? parseInt(e0, 10) : info.size - 1;
      if (start >= info.size || end >= info.size) {
        res.writeHead(416, { 'Content-Range': `bytes */${info.size}` }).end(); return;
      }
      res.writeHead(206, {
        'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${info.size}`,
        'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1, 'Cache-Control': 'no-cache',
      });
      createReadStream(filePath, { start, end }).pipe(res); return;
    }

    res.writeHead(200, { 'Content-Type': type, 'Content-Length': info.size, 'Cache-Control': 'no-cache' });
    createReadStream(filePath).pipe(res);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h1>404 — Not found</h1>');
  }
});

server.listen(PORT, () => {
  console.log(`s4digital  → http://localhost:${PORT}`);
  console.log(`PlanPulse  → http://localhost:${PORT}/planpulse`);
});
