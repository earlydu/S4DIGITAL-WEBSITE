// Session handling and HTML sanitising for the s4digital admin.
//
// Auth is deliberately simple: one password, one cookie, no user accounts.
// It fails closed. If ADMIN_PASSWORD is not set, nothing can be edited.

import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';

const COOKIE = 's4_admin';
const TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

const secret = () =>
  process.env.ADMIN_SECRET || process.env.ADMIN_PASSWORD || '';

export const adminConfigured = () => Boolean(process.env.ADMIN_PASSWORD);

const sign = value => createHmac('sha256', secret()).update(value).digest('hex');

const safeEqual = (a, b) => {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
};

export function checkPassword(candidate) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  return safeEqual(candidate || '', expected);
}

export function makeToken() {
  const exp = String(Date.now() + TTL_MS);
  const nonce = randomBytes(8).toString('hex');
  return `${exp}.${nonce}.${sign(`${exp}.${nonce}`)}`;
}

export function tokenValid(token) {
  if (!token || !adminConfigured()) return false;
  const parts = String(token).split('.');
  if (parts.length !== 3) return false;
  const [exp, nonce, mac] = parts;
  if (!safeEqual(mac, sign(`${exp}.${nonce}`))) return false;
  return Number(exp) > Date.now();
}

export function cookieHeader(token, { secure = true } = {}) {
  const bits = [
    `${COOKIE}=${token || ''}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    token ? `Max-Age=${Math.floor(TTL_MS / 1000)}` : 'Max-Age=0',
  ];
  if (secure) bits.push('Secure');
  return bits.join('; ');
}

export function readCookie(header) {
  if (!header) return '';
  const hit = String(header)
    .split(';')
    .map(s => s.trim())
    .find(s => s.startsWith(`${COOKIE}=`));
  return hit ? hit.slice(COOKIE.length + 1) : '';
}

export const isSignedIn = req => tokenValid(readCookie(req.headers.cookie));

/* --------------------------------------------------------------- sanitise */

const ALLOWED = {
  p: [], br: [], strong: [], b: [], em: [], i: [], u: [],
  h2: [], h3: [], h4: [], blockquote: [], ul: [], ol: [], li: [], hr: [],
  a: ['href', 'title', 'target', 'rel'],
  img: ['src', 'alt', 'width', 'height', 'loading'],
  figure: ['class'], figcaption: [],
  video: ['src', 'poster', 'controls', 'playsinline', 'preload', 'muted', 'loop'],
  iframe: ['src', 'title', 'allow', 'allowfullscreen', 'loading'],
  div: ['class'], span: ['class'],
};

const SAFE_IFRAME = /^https:\/\/(www\.)?(youtube-nocookie\.com|youtube\.com|player\.vimeo\.com)\//i;

/** Strips anything not on the allowlist. Editor output is never trusted. */
export function sanitiseHtml(dirty) {
  let html = String(dirty || '');

  html = html.replace(/<!--[\s\S]*?-->/g, '');
  html = html.replace(/<(script|style|object|embed|form|input|button|link|meta)[\s\S]*?>[\s\S]*?<\/\1>/gi, '');
  html = html.replace(/<(script|style|object|embed|form|input|button|link|meta)[^>]*\/?>/gi, '');

  html = html.replace(/<\/?([a-zA-Z0-9]+)((?:\s+[^>]*)?)\/?>/g, (match, rawTag, rawAttrs) => {
    const tag = rawTag.toLowerCase();
    if (!Object.prototype.hasOwnProperty.call(ALLOWED, tag)) return '';
    if (match.startsWith('</')) return `</${tag}>`;

    const allowed = ALLOWED[tag];
    const kept = [];
    const attrRe = /([a-zA-Z-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
    let m;
    while ((m = attrRe.exec(rawAttrs || '')) !== null) {
      const name = m[1].toLowerCase();
      const value = m[3] ?? m[4] ?? m[5] ?? '';
      if (!allowed.includes(name)) continue;
      if (name.startsWith('on')) continue;

      if (name === 'href' || name === 'src') {
        const v = value.trim();
        const ok =
          /^https?:\/\//i.test(v) || v.startsWith('/') || v.startsWith('#') || /^mailto:/i.test(v);
        if (!ok) continue;
        if (tag === 'iframe' && !SAFE_IFRAME.test(v)) continue;
      }
      kept.push(`${name}="${value.replace(/"/g, '&quot;')}"`);
    }

    if (tag === 'a' && kept.some(a => a.startsWith('target='))) kept.push('rel="noopener"');
    if (tag === 'img' && !kept.some(a => a.startsWith('loading='))) kept.push('loading="lazy"');

    const selfClosing = tag === 'br' || tag === 'img' || tag === 'hr';
    return `<${tag}${kept.length ? ' ' + kept.join(' ') : ''}${selfClosing ? ' /' : ''}>`;
  });

  // Media whose source was rejected leaves an empty shell behind. Drop it.
  html = html.replace(/<iframe(?![^>]*\bsrc=)[^>]*><\/iframe>/gi, '');
  html = html.replace(/<video(?![^>]*\bsrc=)[^>]*><\/video>/gi, '');
  html = html.replace(/<img(?![^>]*\bsrc=)[^>]*\/?>/gi, '');

  return html;
}

export const slugify = s =>
  String(s || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

/** First ~30 words of the body, used when no excerpt is written. */
export const excerptFrom = html =>
  String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 32)
    .join(' ');
