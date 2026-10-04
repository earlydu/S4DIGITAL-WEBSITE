// Vercel serverless function behind /sitemap.xml (see the rewrite in vercel.json).
import { buildSitemap } from '../lib/sitemap.mjs';

export default async function handler(req, res) {
  try {
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600');
    res.status(200).send(await buildSitemap());
  } catch (err) {
    res.status(500).send('sitemap error');
  }
}
