// Tiny static file server with full HTTP Range support so videos stream and seek.
// Run with: node .serve.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const ROOT = __dirname;
const PORT = 8787;
const HOST = '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.txt': 'text/plain; charset=utf-8'
};

function serveFile(req, res, filePath, stat) {
  const ext = path.extname(filePath).toLowerCase();
  const ct = MIME[ext] || 'application/octet-stream';
  const total = stat.size;
  const range = req.headers.range;
  const headers = {
    'Content-Type': ct,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'public, max-age=3600'
  };

  if (range) {
    const m = range.match(/bytes=(\d*)-(\d*)/);
    if (m) {
      let start = m[1] ? parseInt(m[1], 10) : 0;
      let end   = m[2] ? parseInt(m[2], 10) : total - 1;
      if (isNaN(start) || start < 0) start = 0;
      if (isNaN(end) || end >= total) end = total - 1;
      if (start > end) { start = 0; end = total - 1; }
      const length = end - start + 1;
      headers['Content-Range']  = `bytes ${start}-${end}/${total}`;
      headers['Content-Length'] = length;
      res.writeHead(206, headers);
      const stream = fs.createReadStream(filePath, { start, end });
      stream.on('error', () => { try { res.end(); } catch (_) {} });
      stream.pipe(res);
      console.log(`206  ${req.url}  ${start}-${end}/${total}`);
      return;
    }
  }
  headers['Content-Length'] = total;
  res.writeHead(200, headers);
  const stream = fs.createReadStream(filePath);
  stream.on('error', () => { try { res.end(); } catch (_) {} });
  stream.pipe(res);
  console.log(`200  ${req.url}  (${total} bytes)`);
}

http.createServer((req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(url.parse(req.url).pathname || '/'); }
  catch { pathname = '/'; }
  if (pathname.endsWith('/')) pathname += 'index.html';

  const filePath = path.normalize(path.join(ROOT, pathname));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    return res.end('Forbidden');
  }

  fs.stat(filePath, (err, stat) => {
    if (!err && stat.isFile()) return serveFile(req, res, filePath, stat);
    if (!err && stat.isDirectory()) {
      const idx = path.join(filePath, 'index.html');
      return fs.stat(idx, (e, s) => {
        if (!e && s.isFile()) return serveFile(req, res, idx, s);
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404');
      });
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404');
  });
}).listen(PORT, HOST, () => {
  console.log(`Serving ${ROOT} at http://${HOST}:${PORT}/`);
});
