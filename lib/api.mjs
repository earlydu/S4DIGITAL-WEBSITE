// The admin and content APIs, written once and used by both the Vercel
// functions in /api and the local dev server in serve.mjs.

import {
  adminConfigured, checkPassword, makeToken, cookieHeader,
  isSignedIn, sanitiseHtml, slugify, excerptFrom,
} from './admin.mjs';
import {
  driver, DOCUMENTS, readDoc, writeDoc,
  createUpload, saveUpload, listMedia, deleteMedia,
} from './store.mjs';

const json = (status, body, headers) => ({ status, body, headers: headers || {} });

/* -------------------------------------------------------- public content */

export async function handleContent(file) {
  const name = String(file || '').replace(/\.json$/, '');
  if (!DOCUMENTS.includes(name)) return json(404, { error: 'Not found' });
  try {
    const doc = await readDoc(name);
    if (name === 'posts' && Array.isArray(doc.items)) {
      // Never serve drafts to the public.
      return json(200, { ...doc, items: doc.items.filter(p => p.status === 'published') });
    }
    return json(200, doc);
  } catch (err) {
    return json(500, { error: err.message });
  }
}

/* ------------------------------------------------------------------ admin */

export async function handleAdmin({ action, req, body, secure }) {
  if (!adminConfigured()) {
    return json(503, {
      error: 'The admin is not switched on yet. Set ADMIN_PASSWORD in your environment, then reload.',
    });
  }

  if (action === 'login') {
    if (!checkPassword(body && body.password)) return json(401, { error: 'That password is not right.' });
    return json(200, { ok: true, driver }, { 'Set-Cookie': cookieHeader(makeToken(), { secure }) });
  }

  if (action === 'logout') {
    return json(200, { ok: true }, { 'Set-Cookie': cookieHeader('', { secure }) });
  }

  if (action === 'me') {
    return json(200, { signedIn: isSignedIn(req), driver, canWrite: driver === 'supabase' || !process.env.VERCEL });
  }

  if (!isSignedIn(req)) return json(401, { error: 'Please sign in again.' });

  try {
    switch (action) {
      case 'get': {
        const name = String((body && body.doc) || '');
        if (!DOCUMENTS.includes(name)) return json(404, { error: 'Unknown document' });
        return json(200, await readDoc(name));
      }

      case 'save-post': {
        const doc = await readDoc('posts');
        const items = Array.isArray(doc.items) ? doc.items : [];
        const p = (body && body.post) || {};

        const slug = slugify(p.slug || p.title);
        if (!slug) return json(400, { error: 'A post needs a title.' });

        const body = sanitiseHtml(p.body);
        const clean = {
          slug,
          title: String(p.title || '').slice(0, 160),
          category: String(p.category || 'Notes').slice(0, 40),
          excerpt: String(p.excerpt || '').slice(0, 400) || excerptFrom(body),
          cover: p.cover ? String(p.cover).slice(0, 400) : '',
          coverAlt: String(p.coverAlt || '').slice(0, 200),
          body,
          status: p.status === 'published' ? 'published' : 'draft',
          date: /^\d{4}-\d{2}-\d{2}$/.test(p.date) ? p.date : new Date().toISOString().slice(0, 10),
          readingTime: Math.max(1, Math.round(String(p.body || '').replace(/<[^>]+>/g, ' ').split(/\s+/).length / 220)),
          author: String(p.author || 'Earl Duncan').slice(0, 80),
        };

        const original = p.originalSlug ? slugify(p.originalSlug) : slug;
        const at = items.findIndex(x => x.slug === original);
        if (at > -1) clean.legacyUrl = items[at].legacyUrl || undefined;
        if (at > -1) items[at] = { ...items[at], ...clean };
        else items.unshift(clean);

        await writeDoc('posts', { ...doc, items });
        return json(200, { ok: true, post: clean });
      }

      case 'delete-post': {
        const doc = await readDoc('posts');
        const slug = slugify((body && body.slug) || '');
        const items = (doc.items || []).filter(p => p.slug !== slug);
        await writeDoc('posts', { ...doc, items });
        return json(200, { ok: true });
      }

      case 'set-status': {
        const doc = await readDoc('posts');
        const slug = slugify((body && body.slug) || '');
        const status = body && body.status === 'published' ? 'published' : 'draft';
        const items = (doc.items || []).map(p => (p.slug === slug ? { ...p, status } : p));
        await writeDoc('posts', { ...doc, items });
        return json(200, { ok: true, status });
      }

      case 'save-work': {
        // Case studies are saved wholesale: the editor sends the full array back.
        const doc = await readDoc('work');
        const items = (body && body.items) || [];
        if (!Array.isArray(items)) return json(400, { error: 'Expected a list of case studies.' });
        await writeDoc('work', { ...doc, items });
        return json(200, { ok: true, count: items.length });
      }

      case 'upload-url':
        return json(200, await createUpload({
          filename: (body && body.filename) || 'file',
          contentType: (body && body.contentType) || 'application/octet-stream',
        }));

      case 'upload-inline':
        return json(200, await saveUpload({ name: body.name, base64: body.base64 }));

      case 'media':
        return json(200, { items: await listMedia() });

      case 'delete-media':
        return json(200, await deleteMedia((body && body.name) || ''));

      default:
        return json(400, { error: `Unknown action: ${action}` });
    }
  } catch (err) {
    return json(500, { error: err.message });
  }
}
