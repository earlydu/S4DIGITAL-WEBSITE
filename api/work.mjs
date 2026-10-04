// Vercel serverless function behind /work/<slug> (see the rewrite in vercel.json).
// Gives every case study its own title, description, canonical and social card; assets/work.js draws the page body.
import { renderCaseStudy, render404 } from '../lib/blogssr.mjs';

export default async function handler(req, res) {
  const slug = (req.query && typeof req.query.slug === 'string') ? req.query.slug : '';
  try {
    const out = slug ? await renderCaseStudy(slug) : await render404();
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=600');
    if (out.status === 404) res.setHeader('X-Robots-Tag', 'noindex');
    res.status(out.status).send(out.html);
  } catch (err) {
    console.error('[work]', err);
    res.setHeader('Cache-Control', 'no-store');
    res.status(500).send('Something went wrong. Please refresh.');
  }
}
