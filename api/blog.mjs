// Vercel serverless function behind /blog, /blog/<slug> and /blog/feed.xml (see the rewrites in vercel.json).
// Pages are rendered on the server so search engines and link previews get the full post in the first response.
import { renderBlogIndex, renderPost, renderFeed, render404 } from '../lib/blogssr.mjs';

// A short shared cache: a scheduled post still goes live within a few minutes of midnight UK time.
const CACHE = 'public, max-age=0, s-maxage=300, stale-while-revalidate=600';

export default async function handler(req, res) {
  const q = req.query || {};
  try {
    if (q.feed) {
      res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
      res.setHeader('Cache-Control', CACHE);
      res.status(200).send(await renderFeed());
      return;
    }
    const slug = typeof q.slug === 'string' ? q.slug : '';
    const out = slug ? await renderPost(slug) : await renderBlogIndex(Array.isArray(q.page) ? q.page[0] : q.page);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', CACHE);
    if (out.status === 404) res.setHeader('X-Robots-Tag', 'noindex');
    res.status(out.status).send(out.html);
  } catch (err) {
    console.error('[blog]', err);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.status(500).send((await render404().catch(() => ({ html: 'Something went wrong. Please refresh.' }))).html);
  }
}
