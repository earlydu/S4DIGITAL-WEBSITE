// Vercel serverless function behind /p/<slug> and /p/<slug>/media/<file> (see the rewrites in vercel.json).
// Shows a passcode form until the right passcode is posted, then the private pitch page. Logic is in lib/pitch.mjs.
import { handlePitch } from '../lib/pitch.mjs';

export default async function handler(req, res) {
  const q = req.query || {};
  try {
    const out = await handlePitch({
      slug: typeof q.slug === 'string' ? q.slug : '',
      file: typeof q.file === 'string' ? q.file : '',
      method: req.method,
      passcode: req.body && typeof req.body === 'object' ? req.body.passcode : new URLSearchParams(String(req.body || '')).get('passcode'),
      req,
      secure: true,
    });
    for (const [k, v] of Object.entries(out.headers)) res.setHeader(k, v);
    res.status(out.status).send(out.body);
  } catch (err) {
    console.error('[pitch]', err);
    res.setHeader('Cache-Control', 'no-store');
    res.status(500).send('Something went wrong. Please refresh.');
  }
}
