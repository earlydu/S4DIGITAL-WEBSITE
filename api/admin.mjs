// Vercel serverless function: POST /api/admin?action=...
// Everything the admin at /admin does goes through here. See lib/api.mjs.
import { handleAdmin } from '../lib/api.mjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  // Same-origin only. The admin is never called from anywhere else.
  const ref = req.headers.origin || req.headers.referer || '';
  let host = '';
  try { host = ref ? new URL(ref).hostname : ''; } catch { host = ''; }
  const allowed = !host || host === 's4digi.com' || host.endsWith('.s4digi.com') || host === 'localhost' || host === '127.0.0.1';
  if (!allowed) { res.status(403).json({ error: 'Forbidden' }); return; }

  const action = (req.query && req.query.action) || '';
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

  const out = await handleAdmin({ action, req, body, secure: true });
  for (const [k, v] of Object.entries(out.headers || {})) res.setHeader(k, v);
  res.setHeader('Cache-Control', 'no-store');
  res.status(out.status).json(out.body);
}
