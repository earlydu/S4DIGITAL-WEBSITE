// Vercel serverless function: GET /api/content?file=work|posts
// Public read of the content store. Drafts are filtered out here, not in the browser.
import { handleContent } from '../lib/api.mjs';

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }
  const file = (req.query && req.query.file) || '';
  const out = await handleContent(file);
  res.setHeader('Cache-Control', 'no-store');
  res.status(out.status).json(out.body);
}
