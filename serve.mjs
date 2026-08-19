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

const readBody = req => new Promise(resolve => {
  let raw = '';
  req.on('data', c => { raw += c; });
  req.on('end', () => resolve(raw));
});

const server = createServer(async (req, res) => {
  try {
    const parsed = new URL(req.url, `http://${req.headers.host}`);
    let urlPath = decodeURIComponent(parsed.pathname);

    // Local parity with the Vercel functions: /api/content and /api/admin
    if (urlPath === '/api/content' && req.method === 'GET') {
      const { handleContent } = await import(new URL('./lib/api.mjs', import.meta.url));
      const out = await handleContent(parsed.searchParams.get('file'));
      res.writeHead(out.status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify(out.body));
      return;
    }

    if (urlPath === '/api/admin' && req.method === 'POST') {
      const { handleAdmin } = await import(new URL('./lib/api.mjs', import.meta.url));
      const raw = await readBody(req);
      let body = {};
      try { body = JSON.parse(raw || '{}'); } catch { body = {}; }
      const out = await handleAdmin({
        action: parsed.searchParams.get('action') || '',
        req,
        body,
        secure: false,             // localhost is http, so no Secure flag
      });
      res.writeHead(out.status, { 'content-type': 'application/json', 'cache-control': 'no-store', ...(out.headers || {}) });
      res.end(JSON.stringify(out.body));
      return;
    }

    // Local parity with the Vercel function: /api/crm
    if (urlPath === '/api/crm' && req.method === 'POST') {
      const { handleCrm } = await import(new URL('./lib/crm/api.mjs', import.meta.url));
      const raw = await readBody(req);
      let body = {};
      try { body = JSON.parse(raw || '{}'); } catch { body = {}; }
      const out = await handleCrm({
        action: parsed.searchParams.get('action') || '',
        req,
        body,
        secure: false,             // localhost is http, so no Secure flag
      });
      res.writeHead(out.status, {
        'content-type': 'application/json',
        'cache-control': 'no-store',
        'x-robots-tag': 'noindex, nofollow',
        ...(out.headers || {}),
      });
      res.end(JSON.stringify(out.body));
      return;
    }

    // Local parity with the Vercel function: POST /api/generate
    if (req.method === 'POST' && urlPath === '/api/generate') {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', async () => {
        try {
          const lib = await import(new URL('./lib/planpulse.mjs', import.meta.url));
          const key = process.env.ANTHROPIC_API_KEY;
          if (!key) { res.writeHead(503, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'Set ANTHROPIC_API_KEY in your shell to test generation locally.' })); return; }
          const b = JSON.parse(body || '{}');
          const model = lib.VALID_MODELS.includes(process.env.ANTHROPIC_MODEL) ? process.env.ANTHROPIC_MODEL : lib.DEFAULT_MODEL;
          const out = await lib.callAnthropic({ apiKey: key, model, system: lib.buildSystemPrompt(), user: lib.buildUserPrompt(b), maxTokens: lib.pickMaxTokens(b.durationLabel) });
          res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(out));
        } catch (e) { res.writeHead(e.status || 500, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: e.message || 'failed' })); }
      });
      return;
    }

    // Local parity with vercel.json redirects
    const REDIRECTS = {
      '/pricing': '/services',
      '/faq': '/services#faq',
      '/calculator': '/services',
      '/testimonials': '/work',
      '/projects': '/work',
      '/crm': '/sales',
    };
    const bare = urlPath.replace(/\/$/, '') || '/';
    if (bare.startsWith('/crm/')) {
      res.writeHead(308, { Location: bare.replace(/^\/crm/, '/sales') });
      res.end();
      return;
    }
    if (REDIRECTS[bare]) {
      res.writeHead(301, { Location: REDIRECTS[bare] });
      res.end();
      return;
    }

    // Local parity with vercel.json rewrites
    if (bare === '/') urlPath = '/index.html';
    else if (bare === '/contact') urlPath = '/index.html';
    else if (bare === '/admin' || bare.startsWith('/admin/')) urlPath = '/admin.html';
    else if (bare === '/sales' || bare.startsWith('/sales/')) urlPath = '/sales.html';
    // Slug routes only. A path with a file extension (/blog/blog.js) is a real asset.
    else if (/^\/work\/[^/.]+$/.test(bare)) urlPath = '/case-study.html';
    else if (/^\/blog\/[^/.]+$/.test(bare)) {
      // A legacy post has its own file. Anything else is rendered from the content store.
      try { await stat(join(ROOT, bare + '.html')); urlPath = bare + '.html'; }
      catch { urlPath = '/post.html'; }
    }

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
