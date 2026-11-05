// Passcode-protected client pitches at /p/<slug>.
// Pages and images live in private/pitches/<slug>/, which vercel.json keeps off the public site,
// so the only way in is through this file. Passcodes are stored as scrypt hashes in
// private/pitches/pitches.json; set or change one with: node tools/pitch-passcode.mjs <slug> <passcode>
import { readFile, stat, open } from 'node:fs/promises';
import { scryptSync, timingSafeEqual, createHmac } from 'node:crypto';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'private', 'pitches');
const DAYS = 30;
const TYPES = { '.mp4': 'video/mp4', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.pdf': 'application/pdf' };
// Vercel caps a function response at 4.5MB, so video goes out in ranges of this size.
// Browsers ask for video in ranges anyway and fetch the next piece as it plays.
const CHUNK = 3 * 1024 * 1024;
const PRIVATE = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow, noarchive', 'Referrer-Policy': 'no-referrer' };

export const hashPasscode = (code, salt) => scryptSync(normalise(code), salt, 32).toString('hex');
const normalise = (code) => String(code || '').trim().toLowerCase().replace(/\s+/g, '');

async function config(slug) {
  if (!/^[a-z0-9-]{1,60}$/.test(slug || '')) return null;
  const all = JSON.parse(await readFile(join(ROOT, 'pitches.json'), 'utf8'));
  return all[slug] || null;
}

// The cookie is "<expiry>.<hmac>". The key comes from PITCH_SECRET if it's set, otherwise from the
// stored hash, so changing a passcode also signs everyone out of that pitch.
const key = (slug, cfg) => process.env.PITCH_SECRET ? `${process.env.PITCH_SECRET}:${slug}` : `${cfg.hash}:${slug}`;
const sign = (slug, cfg, exp) => createHmac('sha256', key(slug, cfg)).update(`${slug}.${exp}`).digest('hex');
const cookieName = (slug) => `pitch_${slug.replace(/-/g, '_')}`;

function readCookie(req, name) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > -1 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return '';
}

function signedIn(req, slug, cfg) {
  const [exp, mac] = readCookie(req, cookieName(slug)).split('.');
  if (!exp || !mac || Number(exp) < Date.now()) return false;
  const want = Buffer.from(sign(slug, cfg, exp), 'hex');
  const got = Buffer.from(mac, 'hex');
  return got.length === want.length && timingSafeEqual(got, want);
}

function gate(slug, title, error) {
  return `<!doctype html>
<html lang="en-GB"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow, noarchive">
<title>${title}</title>
<script>try{var t=localStorage.getItem('pitch-theme');if(t)document.documentElement.dataset.theme=t}catch(e){}</script>
<style>
:root{--paper:#F5F2EC;--ink:#1C1B20;--soft:#6A665F;--line:#D8D2C6;--blue:#2E9CFF;--field:#FFFFFF;--logo:url('/assets/s4digital-logo.png')}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--paper:#141417;--ink:#F2EFE9;--soft:#A39E95;--line:#34322F;--field:#1E1D21;--logo:url('/assets/s4digital-logo-white.png')}}
:root[data-theme="dark"]{--paper:#141417;--ink:#F2EFE9;--soft:#A39E95;--line:#34322F;--field:#1E1D21;--logo:url('/assets/s4digital-logo-white.png')}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px 16px;background:var(--paper);color:var(--ink);font:18px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
form{width:100%;max-width:360px;text-align:center}
.logo{width:180px;height:42px;margin:0 auto 40px;background:var(--logo) center/contain no-repeat}
h1{font:400 32px/1.2 Georgia,"Times New Roman",serif;margin:0 0 10px}
p{margin:0 0 28px;color:var(--soft)}
input{width:100%;font:500 28px/1 inherit;letter-spacing:.4em;text-align:center;padding:15px;border:1px solid var(--line);border-radius:10px;background:var(--field);color:var(--ink)}
input:focus{outline:2px solid var(--blue);outline-offset:1px}
button{margin-top:12px;width:100%;padding:15px;border:0;border-radius:999px;background:var(--blue);color:#fff;font:600 18px/1 inherit;cursor:pointer}
.err{min-height:26px;margin-top:12px;color:#D9363E;font-size:16px}
</style></head>
<body><form method="post" action="/p/${slug}">
<div class="logo" role="img" aria-label="s4digital"></div>
<h1>${title}</h1>
<p>Enter the 4-digit PIN Earl sent you.</p>
<input name="passcode" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="off" aria-label="PIN" required autofocus>
<button type="submit">Open</button>
<div class="err" role="alert">${error ? 'That PIN isn’t right. Try again.' : ''}</div>
</form></body></html>`;
}

const html = (status, body, headers = {}) => ({ status, headers: { 'Content-Type': 'text/html; charset=utf-8', ...PRIVATE, ...headers }, body });
const notFound = async () => html(404, await readFile(join(ROOT, '..', '..', '404.html')).catch(() => '<h1>Not found</h1>'));

async function videoRange(path, size, range) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(range || '');
  let start = m && m[1] ? Number(m[1]) : 0;
  let end = m && m[2] ? Number(m[2]) : size - 1;
  if (m && !m[1] && m[2]) { start = Math.max(0, size - Number(m[2])); end = size - 1; } // "bytes=-500" means the last 500
  if (start >= size || start > end) return { status: 416, headers: { ...PRIVATE, 'Content-Range': `bytes */${size}` }, body: '' };
  end = Math.min(end, size - 1, start + CHUNK - 1);
  const body = Buffer.alloc(end - start + 1);
  const fh = await open(path);
  try { await fh.read(body, 0, body.length, start); } finally { await fh.close(); }
  return { status: 206, headers: { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${start}-${end}/${size}`, 'Cache-Control': 'private, max-age=86400', 'X-Robots-Tag': 'noindex' }, body };
}

// method: 'GET' | 'POST'; file: optional media filename; passcode: the posted form field.
export async function handlePitch({ slug, file, method, passcode, req, secure }) {
  const cfg = await config(slug).catch(() => null);
  if (!cfg) return notFound();

  if (method === 'POST') {
    const ok = cfg.hash && timingSafeEqual(Buffer.from(hashPasscode(passcode, cfg.salt), 'hex'), Buffer.from(cfg.hash, 'hex'));
    if (!ok) {
      await new Promise((r) => setTimeout(r, 1500)); // slows down guessing
      return html(401, gate(slug, cfg.title, true));
    }
    const exp = Date.now() + DAYS * 864e5;
    const cookie = `${cookieName(slug)}=${exp}.${sign(slug, cfg, exp)}; Path=/p/${slug}; Max-Age=${DAYS * 86400}; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
    return { status: 303, headers: { Location: `/p/${slug}`, 'Set-Cookie': cookie, ...PRIVATE }, body: '' };
  }

  if (!signedIn(req, slug, cfg)) return file ? { status: 401, headers: PRIVATE, body: '' } : html(200, gate(slug, cfg.title, false));

  if (file) {
    if (!/^[a-z0-9._-]+$/i.test(file) || !TYPES[extname(file).toLowerCase()]) return { status: 404, headers: PRIVATE, body: '' };
    const path = join(ROOT, slug, 'media', file);
    let info;
    try { info = await stat(path); } catch { return { status: 404, headers: PRIVATE, body: '' }; }
    if (extname(file).toLowerCase() === '.mp4') return videoRange(path, info.size, req.headers.range);
    // PDFs download rather than open in a tab. Keep them under 4MB: Vercel caps a function response at 4.5MB.
    const download = extname(file).toLowerCase() === '.pdf' ? { 'Content-Disposition': `attachment; filename="${file}"` } : {};
    return { status: 200, headers: { 'Content-Type': TYPES[extname(file).toLowerCase()], 'Cache-Control': 'private, max-age=86400', 'X-Robots-Tag': 'noindex', ...download }, body: await readFile(path) };
  }

  return html(200, await readFile(join(ROOT, slug, 'index.html'), 'utf8'));
}
