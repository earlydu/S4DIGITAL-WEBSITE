// Vercel serverless function: POST /api/crm?action=...
//
// The only way into the CRM's data. There is no GET, nothing is cached, and
// everything except status/login/bootstrap needs a valid session cookie.
// See lib/crm/api.mjs for the actions themselves.
import { handleCrm } from '../lib/crm/api.mjs';

export const config = { maxDuration: 60 };   // imports and transcription take a moment

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Same origin only. Nothing here is ever called cross-site.
  const ref = req.headers.origin || req.headers.referer || '';
  let host = '';
  try { host = ref ? new URL(ref).hostname : ''; } catch { host = ''; }
  const allowed = !host
    || host === 's4digi.com' || host.endsWith('.s4digi.com')
    || host === 'localhost' || host === '127.0.0.1';
  if (!allowed) { res.status(403).json({ error: 'Forbidden' }); return; }

  const action = (req.query && req.query.action) || '';
  let body = {};
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  } catch {
    res.status(400).json({ error: 'That request was not valid JSON.' });
    return;
  }

  const out = await handleCrm({ action, req, body, secure: true });
  for (const [k, v] of Object.entries(out.headers || {})) res.setHeader(k, v);
  res.status(out.status).json(out.body);
}
