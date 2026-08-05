// Content store for the s4digital admin.
//
// Two drivers, chosen automatically:
//   local     — reads and writes JSON in /content and media in /assets/uploads.
//               This is what runs on your machine. It is also what runs on Vercel
//               if Supabase is not configured, in which case reads work and writes
//               fail with a clear message (Vercel's filesystem is read only).
//   supabase  — reads and writes JSON in a Supabase Storage bucket, and issues
//               signed upload URLs so the browser can send media straight to
//               Supabase without passing through a serverless function.
//
// To switch to Supabase set these environment variables:
//   SUPABASE_URL=https://xxxx.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY=...        (server only, never expose to the browser)
//   SUPABASE_BUCKET=s4digital            (optional, defaults to "s4digital")

import { readFile, writeFile, mkdir, readdir, stat, unlink } from 'node:fs/promises';
import { dirname, join, extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CONTENT_DIR = join(ROOT, 'content');
const UPLOAD_DIR = join(ROOT, 'assets', 'uploads');

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const BUCKET = process.env.SUPABASE_BUCKET || 's4digital';

export const driver = SUPABASE_URL && SUPABASE_KEY ? 'supabase' : 'local';

/** Only these documents can be read or written. Keeps the API from being a file browser. */
export const DOCUMENTS = ['work', 'posts'];

const sbHeaders = extra => ({
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  ...extra,
});

const sbObjectUrl = path => `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`;

/* ------------------------------------------------------------------ JSON */

export async function readDoc(name) {
  if (!DOCUMENTS.includes(name)) throw new Error(`Unknown document: ${name}`);

  if (driver === 'supabase') {
    const res = await fetch(`${sbObjectUrl(`content/${name}.json`)}?t=${Date.now()}`, { headers: sbHeaders() });
    if (res.ok) return res.json();
    if (res.status !== 400 && res.status !== 404) throw new Error(`Supabase read failed (${res.status})`);
    // Not in the bucket yet: fall through to the file shipped with the deploy so
    // the site still renders on the very first request after switching drivers.
  }

  const raw = await readFile(join(CONTENT_DIR, `${name}.json`), 'utf8');
  return JSON.parse(raw);
}

export async function writeDoc(name, data) {
  if (!DOCUMENTS.includes(name)) throw new Error(`Unknown document: ${name}`);
  const body = JSON.stringify(data, null, 2);

  if (driver === 'supabase') {
    const res = await fetch(sbObjectUrl(`content/${name}.json`), {
      method: 'POST',
      headers: sbHeaders({ 'Content-Type': 'application/json', 'x-upsert': 'true' }),
      body,
    });
    if (!res.ok) throw new Error(`Supabase write failed (${res.status}): ${await res.text()}`);
    return { ok: true, driver };
  }

  try {
    await mkdir(CONTENT_DIR, { recursive: true });
    await writeFile(join(CONTENT_DIR, `${name}.json`), body, 'utf8');
    return { ok: true, driver };
  } catch (err) {
    if (err.code === 'EROFS' || err.code === 'EACCES') {
      throw new Error(
        'Saving is not available on this deployment because the filesystem is read only. ' +
        'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to enable editing on the live site.'
      );
    }
    throw err;
  }
}

/* ----------------------------------------------------------------- MEDIA */

const SAFE = s => basename(String(s)).replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 120);

/** Where a new upload should go, and how the browser should send it. */
export async function createUpload({ filename, contentType }) {
  const stamp = new Date().toISOString().slice(0, 10);
  const name = `${stamp}-${Math.random().toString(36).slice(2, 8)}-${SAFE(filename)}`;

  if (driver === 'supabase') {
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/upload/sign/${BUCKET}/media/${name}`, {
      method: 'POST',
      headers: sbHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ expiresIn: 600 }),
    });
    if (!res.ok) throw new Error(`Could not sign upload (${res.status}): ${await res.text()}`);
    const { signedURL } = await res.json();
    return {
      mode: 'signed',                                   // browser PUTs the file itself
      uploadUrl: `${SUPABASE_URL}/storage/v1${signedURL}`,
      contentType,
      url: `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/media/${name}`,
    };
  }

  return { mode: 'inline', name, url: `/assets/uploads/${name}` };  // browser POSTs base64 back to us
}

/** Local driver only: write the bytes the browser sent. */
export async function saveUpload({ name, base64 }) {
  if (driver === 'supabase') throw new Error('Signed uploads go straight to Supabase.');
  await mkdir(UPLOAD_DIR, { recursive: true });
  const safe = SAFE(name);
  await writeFile(join(UPLOAD_DIR, safe), Buffer.from(base64, 'base64'));
  return { url: `/assets/uploads/${safe}` };
}

export async function listMedia() {
  if (driver === 'supabase') {
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${BUCKET}`, {
      method: 'POST',
      headers: sbHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ prefix: 'media', limit: 200, sortBy: { column: 'created_at', order: 'desc' } }),
    });
    if (!res.ok) return [];
    const rows = await res.json();
    return rows
      .filter(r => r.name)
      .map(r => ({
        name: r.name,
        url: `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/media/${r.name}`,
        size: (r.metadata && r.metadata.size) || 0,
        type: kindOf(r.name),
      }));
  }

  try {
    const names = await readdir(UPLOAD_DIR);
    const out = [];
    for (const n of names) {
      const info = await stat(join(UPLOAD_DIR, n));
      if (info.isFile()) out.push({ name: n, url: `/assets/uploads/${n}`, size: info.size, type: kindOf(n), mtime: info.mtimeMs });
    }
    return out.sort((a, b) => (b.mtime || 0) - (a.mtime || 0));
  } catch {
    return [];
  }
}

export async function deleteMedia(name) {
  const safe = SAFE(name);
  if (driver === 'supabase') {
    const res = await fetch(sbObjectUrl(`media/${safe}`), { method: 'DELETE', headers: sbHeaders() });
    if (!res.ok) throw new Error(`Could not delete (${res.status})`);
    return { ok: true };
  }
  await unlink(join(UPLOAD_DIR, safe));
  return { ok: true };
}

function kindOf(name) {
  const e = extname(name).toLowerCase();
  if (['.mp4', '.webm', '.mov'].includes(e)) return 'video';
  if (['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif', '.svg'].includes(e)) return 'image';
  return 'file';
}
