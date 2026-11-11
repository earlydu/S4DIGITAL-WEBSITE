// Minimal zero-dependency static server for the s4digital build (incl. PlanPulse).
// Run: node serve.mjs  →  http://localhost:4000   |  PlanPulse: http://localhost:4000/planpulse
import { createServer } from 'node:http';
import { stat, readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
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
    if (urlPath === '/sitemap.xml') {
      const { buildSitemap } = await import(new URL('./lib/sitemap.mjs', import.meta.url));
      res.writeHead(200, { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'no-store' });
      res.end(await buildSitemap());
      return;
    }
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
      '/work/carreducker': '/work/carreducker-shoemakers',
      '/work/catherine-marche': '/work/catherine-marche-jeweller',
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

    // Local parity with vercel.json: templates are only read by the server renderer.
    if (bare === '/templates' || bare.startsWith('/templates/') || bare === '/private' || bare.startsWith('/private/')) {
      res.writeHead(302, { Location: '/' });
      res.end();
      return;
    }

    // Local only: the deck editor (.tools/pitch-edit.js) reads, saves and publishes a pitch's index.html.
    const ed = bare.match(/^\/__pitch(?:\/([a-z0-9-]+)\/(source|save|publish)|-edit\.js)$/);
    if (ed) {
      const json = (status, body) => { res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)); };
      if (!ed[1]) {
        res.writeHead(200, { 'content-type': TYPES['.js'], 'cache-control': 'no-store' });
        res.end(await readFile(join(ROOT, '.tools', 'pitch-edit.js')));
        return;
      }
      const file = join(ROOT, 'private', 'pitches', ed[1], 'index.html');
      if (ed[2] === 'source') {
        res.writeHead(200, { 'content-type': TYPES['.html'], 'cache-control': 'no-store' });
        res.end(await readFile(file, 'utf8'));
        return;
      }
      if (req.method !== 'POST') return json(405, { ok: false, error: 'POST only' });
      if (ed[2] === 'save') {
        const chunks = [];
        for await (const c of req) chunks.push(c);
        const html = Buffer.concat(chunks).toString('utf8');
        if (!/^<!doctype html>/i.test(html) || !html.includes('id="deck"')) return json(400, { ok: false, error: 'That does not look like the deck' });
        await writeFile(file, html, 'utf8');
        return json(200, { ok: true });
      }
      // publish: rebuild the PDF from the running deck, then commit just this pitch and push.
      const run = (cmd, args, env) => new Promise((resolve, reject) => execFile(cmd, args, { cwd: ROOT, env: { ...process.env, ...env }, timeout: 600000 },
        (err, stdout, stderr) => err ? reject(new Error((stderr || stdout || err.message).trim().split('\n').slice(-3).join(' '))) : resolve(stdout)));
      try {
        const pdf = ((await readFile(file, 'utf8')).match(new RegExp(`/p/${ed[1]}/media/([^"]+\\.pdf)`)) || [])[1];
        const paths = [`private/pitches/${ed[1]}/index.html`];
        if (pdf) {
          await run('python', [join(ROOT, '.tools', 'pitch-pdf.py'), ed[1], pdf], { PITCH_COOKIE: req.headers.cookie || '' });
          paths.push(`private/pitches/${ed[1]}/media/${pdf}`);
        }
        if (!(await run('git', ['status', '--porcelain', '--', ...paths])).trim()) return json(200, { ok: true, note: 'Nothing new to publish' });
        const msg = join(ROOT, '.tools', 'pitch-commit.txt');
        await writeFile(msg, `${ed[1]} pitch: text edits from the deck editor\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\n`);
        await run('git', ['add', '--', ...paths]);
        await run('git', ['commit', '-F', msg, '--', ...paths]);
        await run('git', ['push']);
        return json(200, { ok: true });
      } catch (e) {
        return json(500, { ok: false, error: e.message });
      }
    }

    // Local parity with api/pitch.mjs: passcode-protected pitches at /p/<slug>
    const pitch = bare.match(/^\/p\/([^/]+)(?:\/media\/([^/]+))?$/);
    if (pitch) {
      const { handlePitch } = await import(new URL('./lib/pitch.mjs', import.meta.url));
      const raw = req.method === 'POST' ? await readBody(req) : '';
      const out = await handlePitch({
        slug: pitch[1],
        file: pitch[2] || '',
        method: req.method,
        passcode: new URLSearchParams(raw).get('passcode'),
        req,
        secure: false,             // localhost is http, so no Secure flag
      });
      // Local only: add the deck editor to a signed-in deck page.
      let body = out.body;
      if (!pitch[2] && typeof body === 'string' && body.includes('id="deck"')) body = body.replace('</body>', '<script src="/__pitch-edit.js"></script>\n</body>');
      res.writeHead(out.status, out.headers);
      res.end(body);
      return;
    }

    // Local parity with the server-rendered routes (api/blog.mjs and api/work.mjs on Vercel).
    // ESM caches the import, so restart the server after editing lib files.
    if (['/blog/feed.xml', '/feed.xml', '/rss.xml'].includes(bare)) {
      const { renderFeed } = await import(new URL('./lib/blogssr.mjs', import.meta.url));
      res.writeHead(200, { 'content-type': 'application/rss+xml; charset=utf-8', 'cache-control': 'no-store' });
      res.end(await renderFeed());
      return;
    }
    if (bare === '/blog' || /^\/blog\/[^/.]+$/.test(bare) || /^\/work\/[^/.]+$/.test(bare)) {
      const ssr = await import(new URL('./lib/blogssr.mjs', import.meta.url));
      const slug = bare.split('/')[2];
      const out = bare === '/blog' ? await ssr.renderBlogIndex(parsed.searchParams.get('page') ?? undefined)
        : bare.startsWith('/blog/') ? await ssr.renderPost(slug)
        : await ssr.renderCaseStudy(slug);
      res.writeHead(out.status, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', ...(out.status === 404 ? { 'x-robots-tag': 'noindex' } : {}) });
      res.end(out.html);
      return;
    }

    // Local parity with vercel.json rewrites
    if (bare === '/') urlPath = '/index.html';
    else if (bare === '/contact') urlPath = '/index.html';
    else if (bare === '/admin' || bare.startsWith('/admin/')) urlPath = '/admin.html';
    else if (bare === '/sales' || bare.startsWith('/sales/')) urlPath = '/sales.html';

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
    // Same as Vercel: the branded 404.html for anything that doesn't exist.
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    try { res.end(await readFile(join(ROOT, '404.html'))); } catch { res.end('<h1>Not found</h1>'); }
  }
});

server.listen(PORT, () => {
  console.log(`s4digital  → http://localhost:${PORT}`);
  console.log(`PlanPulse  → http://localhost:${PORT}/planpulse`);
});
