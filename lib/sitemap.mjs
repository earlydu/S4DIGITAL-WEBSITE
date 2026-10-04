// Builds sitemap.xml on request, so a scheduled blog post joins it on its publish date with no rebuild.
import { readDoc } from './store.mjs';

const SITE = 'https://s4digi.com';
const PAGES = [
  ['/', '1.0'], ['/films', '0.9'], ['/work', '0.9'], ['/services', '0.8'], ['/about', '0.8'], ['/blog', '0.6'],
  ['/guide', '0.7'], ['/personal-brand-shoot', '0.6'], ['/free-tools', '0.6'], ['/free-tools/film-budget', '0.6'],
  ['/free-tools/video-resizer', '0.5'], ['/free-tools/pdf-tools', '0.5'], ['/planpulse', '0.4'],
  ['/free-tools/video-to-gif', '0.5'], ['/free-tools/trim-video', '0.5'], ['/free-tools/compress-video', '0.5'], ['/free-tools/mute-video', '0.5'], ['/free-tools/extract-audio', '0.5'], ['/free-tools/images-to-gif', '0.5'], ['/free-tools/gif-optimise', '0.5'], ['/free-tools/gif-resize', '0.5'], ['/free-tools/gif-crop', '0.5'], ['/free-tools/gif-speed', '0.5'], ['/free-tools/gif-reverse', '0.5'], ['/free-tools/add-text-to-gif', '0.5'], ['/free-tools/gif-to-mp4', '0.5'], ['/free-tools/gif-frames', '0.5'], ['/free-tools/merge-pdf', '0.5'], ['/free-tools/split-pdf', '0.5'], ['/free-tools/compress-pdf', '0.5'], ['/free-tools/word-to-pdf', '0.5'], ['/free-tools/pdf-to-word', '0.5'], ['/free-tools/excel-to-pdf', '0.5'], ['/free-tools/pdf-to-excel', '0.5'], ['/free-tools/powerpoint-to-pdf', '0.5'], ['/free-tools/sign-pdf', '0.5'], ['/free-tools/pdf-to-jpg', '0.5'], ['/free-tools/jpg-to-pdf', '0.5'], ['/free-tools/extract-pages', '0.5'], ['/free-tools/delete-pages', '0.5'], ['/free-tools/organise-pdf', '0.5'], ['/free-tools/rotate-pdf', '0.5'], ['/free-tools/add-page-numbers', '0.5'], ['/free-tools/watermark-pdf', '0.5'], ['/free-tools/crop-pdf', '0.5'], ['/free-tools/pdf-to-text', '0.5'], ['/free-tools/compress-image', '0.5'], ['/free-tools/resize-image', '0.5'], ['/free-tools/convert-image', '0.5'], ['/free-tools/crop-image', '0.5'], ['/free-tools/youtube-thumbnail', '0.5'], ['/privacy', '0.2'], ['/terms', '0.2'],
];
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

export async function buildSitemap() {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
  const [work, posts] = await Promise.all([readDoc('work'), readDoc('posts')]);
  const live = (posts.items || []).filter(p => p.status === 'published' && p.slug && (!p.date || p.date <= today));
  const urls = PAGES.map(([path, pr]) => [SITE + path, today, pr])
    .concat((work.items || []).filter(w => w.slug).map(w => [`${SITE}/work/${w.slug}`, '', '0.7']))
    .concat(live.map(p => [`${SITE}/blog/${p.slug}`, p.date || '', '0.5']));
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map(([loc, mod, pr]) => `  <url><loc>${esc(loc)}</loc>${mod ? `<lastmod>${mod}</lastmod>` : ''}<priority>${pr}</priority></url>`).join('\n') +
    '\n</urlset>\n';
}
