// Server rendering for /blog, /blog/<slug>, /blog/feed.xml and /work/<slug>.
//
// Search engines and link previews (LinkedIn, WhatsApp, Slack) read the first
// HTML response and nothing else, so every post is written into the page here:
// title, description, canonical, Open Graph, JSON-LD and the full article.
// assets/post.js then only adds behaviour (charts animating, lightbox, the side
// form, the falling camera) to markup that is already on the page.
//
// Used by api/blog.mjs and api/work.mjs on Vercel and by serve.mjs locally.

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readDoc } from './store.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
export const SITE = 'https://s4digi.com';
const PER_PAGE = 9;
const LOGO = SITE + '/assets/s4digital-logo.png';
const DEFAULT_OG = SITE + '/assets/og-card.jpg';
const BLOG_DESC = 'Earl Duncan on brand films: budgets, craft, being on camera and what makes people watch.';

/* ----------------------------------------------------------------- helpers */

const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const nice = d => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d || '')) return '';
  return new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
};
const abs = u => (!u ? '' : /^https?:\/\//.test(u) ? u : SITE + (u.charAt(0) === '/' ? u : '/' + u));
// JSON inside <script> must never contain "</script>".
const ldJson = obj => '<script type="application/ld+json">' + JSON.stringify(obj).replace(/</g, '\\u003c') + '</script>';

const templates = new Map();
async function template(name) {
  if (!templates.has(name)) templates.set(name, await readFile(join(ROOT, name), 'utf8'));
  return templates.get(name);
}

/** Today in the UK. BLOG_PREVIEW_DATE lets a local preview show scheduled posts early. Never set on Vercel. */
const ukToday = () => process.env.BLOG_PREVIEW_DATE || new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });

/** Published posts whose date has arrived, in the order the content store keeps them. */
export async function livePosts() {
  const doc = await readDoc('posts');
  const today = ukToday();
  return (doc.items || []).filter(p => p.status === 'published' && p.slug && (!p.date || p.date <= today));
}

/**
 * Swap the template's <title>, description, canonical, Open Graph and Twitter
 * tags for the ones given, and add anything extra (JSON-LD, rel links) to <head>.
 */
function setHead(html, { title, description, canonical, og = {}, extra = '' }) {
  html = html
    .replace(/[ \t]*<meta (?:property="og:|property="article:|name="twitter:|name="description")[^>]*>\r?\n?/g, '')
    .replace(/[ \t]*<link rel="canonical"[^>]*>\r?\n?/g, '');
  const tags = [
    '<meta name="description" content="' + esc(description) + '" />',
    canonical ? '<link rel="canonical" href="' + esc(canonical) + '" />' : '',
    '<meta property="og:site_name" content="s4digital" />',
    '<meta property="og:locale" content="en_GB" />',
    '<meta property="og:type" content="' + esc(og.type || 'website') + '" />',
    '<meta property="og:title" content="' + esc(og.title || title) + '" />',
    '<meta property="og:description" content="' + esc(description) + '" />',
    canonical ? '<meta property="og:url" content="' + esc(canonical) + '" />' : '',
    '<meta property="og:image" content="' + esc(og.image || DEFAULT_OG) + '" />',
    og.imageAlt ? '<meta property="og:image:alt" content="' + esc(og.imageAlt) + '" />' : '',
    !og.image ? '<meta property="og:image:width" content="1200" />\n<meta property="og:image:height" content="630" />' : '',
    og.published ? '<meta property="article:published_time" content="' + esc(og.published) + '" />' : '',
    og.modified ? '<meta property="article:modified_time" content="' + esc(og.modified) + '" />' : '',
    og.author ? '<meta property="article:author" content="' + esc(og.author) + '" />' : '',
    '<meta name="twitter:card" content="summary_large_image" />',
    '<meta name="twitter:title" content="' + esc(og.title || title) + '" />',
    '<meta name="twitter:description" content="' + esc(description) + '" />',
    '<meta name="twitter:image" content="' + esc(og.image || DEFAULT_OG) + '" />',
    extra,
  ].filter(Boolean).join('\n');
  return html.replace(/<title>[\s\S]*?<\/title>/, () => '<title>' + esc(title) + '</title>\n' + tags);
}

const RSS_LINK = '<link rel="alternate" type="application/rss+xml" title="s4digital blog" href="' + SITE + '/blog/feed.xml" />';

/* ------------------------------------------------------------------- 404 */

export async function render404() {
  return { status: 404, html: await template('404.html') };
}

/* ------------------------------------------------------------- blog index */

const postHref = p => p.legacyUrl || '/blog/' + p.slug;
const pageHref = k => '/blog' + (k > 1 ? '?page=' + k : '');

/** pageParam is the raw ?page= value (or undefined). Bad or out of range pages are a 404. */
export async function renderBlogIndex(pageParam) {
  const items = await livePosts();
  const rest = items.slice(1);                              // the featured post isn't repeated under "All posts"
  const pages = Math.max(1, Math.ceil(rest.length / PER_PAGE));
  let n = 1;
  if (pageParam != null && pageParam !== '') {
    if (!/^\d+$/.test(String(pageParam))) return render404();
    n = parseInt(pageParam, 10);
    if (n < 1 || n > pages) return render404();
  }

  const meta = p => '<span class="bmeta">' + esc(nice(p.date)) + ' &middot; ' + esc(p.readingTime || 5) + ' min read</span>';
  const img = (p, eager) => p.cover ? '<img src="' + esc(p.cover) + '" alt="' + esc(p.coverAlt) + '"' + (eager ? ' fetchpriority="high"' : ' loading="lazy"') + ' />' : '';
  const row = p =>
    '<a class="brow" href="' + esc(postHref(p)) + '">' +
      '<div class="brow__img">' + img(p) + '</div>' +
      '<div><h2>' + esc(p.title) + '</h2><p>' + esc(p.excerpt) + '</p>' + meta(p) + '</div>' +
    '</a>';
  const pager = () => {
    if (pages < 2) return '';
    const link = (k, label, cls, rel) => '<a class="bpage' + (cls ? ' ' + cls : '') + '" href="' + pageHref(k) + '" data-page="' + k + '"' +
      (rel ? ' rel="' + rel + '"' : '') + (k === n && !cls ? ' aria-current="page"' : '') + '>' + label + '</a>';
    let out = '<nav class="bpager" aria-label="Blog pages">';
    if (n > 1) out += link(n - 1, '&larr; Newer', 'bpage--step', 'prev');
    for (let k = 1; k <= pages; k++) out += link(k, k);
    if (n < pages) out += link(n + 1, 'Older &rarr;', 'bpage--step', 'next');
    return out + '</nav>';
  };

  let list;
  if (!items.length) {
    list = '<p class="wempty">Nothing published yet.</p>';
  } else {
    const lead = items[0];
    const slice = rest.slice((n - 1) * PER_PAGE, n * PER_PAGE);
    list =
      (n === 1 ?
        '<div class="btop" id="blogTop">' +
          '<a class="bfeat" href="' + esc(postHref(lead)) + '"><div class="bfeat__img">' + img(lead, true) + '</div>' +
            '<h2>' + esc(lead.title) + '</h2><p>' + esc(lead.excerpt) + '</p>' + meta(lead) + '</a>' +
          '<div class="brecent"><h3>Recent</h3>' +
            rest.slice(0, 4).map(p => '<a href="' + esc(postHref(p)) + '"><strong>' + esc(p.title) + '</strong>' + meta(p) + '</a>').join('') +
          '</div>' +
        '</div>' +
        '<a class="breport" href="/guide">' +
          '<div class="breport__img"><img src="/assets/guide/guide-cover.png" alt="Cover of Before the Camera Comes Out, the free brand film playbook" loading="lazy" /></div>' +
          '<div class="breport__body">' +
            '<strong>Before the camera comes out: the free brand film playbook</strong>' +
            '<p>The questions we ask, what films really cost, a brief template, a licensing checklist and a 30-day release plan. Everything we know, free.</p>' +
            '<span class="btn btn--orange"><span>Get the guide</span><span class="arrow">&rarr;</span></span></div>' +
        '</a>' : '') +
      '<div class="brows" id="blogRows"><h3>' + (n === 1 ? 'All posts' : 'All posts &middot; page ' + n + ' of ' + pages) + '</h3>' +
        slice.map(row).join('') +
      '</div>' + pager();
  }

  const title = (n > 1 ? 'Blog, page ' + n + ' | ' : 'Blog | ') + 's4digital, documentary brand films';
  const canonical = SITE + pageHref(n);
  const rel = (n > 1 ? '<link rel="prev" href="' + SITE + pageHref(n - 1) + '" />\n' : '') +
    (n < pages ? '<link rel="next" href="' + SITE + pageHref(n + 1) + '" />\n' : '');
  let html = await template('templates/blog.html');
  html = setHead(html, {
    title,
    description: BLOG_DESC + (n > 1 ? ' Page ' + n + ' of ' + pages + '.' : ''),
    canonical,
    og: { title: (n > 1 ? 'Blog, page ' + n : 'Blog') + ' | s4digital' },
    extra: rel + RSS_LINK,
  });
  html = html.replace('<div id="postList"></div>', () => '<div id="postList" data-ssr data-page="' + n + '" data-pages="' + pages + '">' + list + '</div>');
  return { status: 200, html };
}

/* ------------------------------------------------------------- one post */

// Every post carries a real author with a way to check who they are.
const AUTHORS = {
  'Earl Duncan': {
    img: '/assets/earl/earl-head.png',
    role: 'Founder and director, s4digital',
    bio: 'Earl makes documentary-style brand films about people who are exceptionally good at what they do, from shoemakers and cheesemongers to world champion fighters. He is currently making Manxinha, a feature documentary about the founder of London Fight Factory.',
    links: [['Instagram', 'https://www.instagram.com/earlduncan'], ['LinkedIn', 'https://www.linkedin.com/in/earlcan/'], ['About Earl', '/about']],
  },
};

function authorHtml(p) {
  const a = AUTHORS[p.author || 'Earl Duncan'];
  if (!a) return '';
  return '<aside class="pauthor"><img src="' + esc(a.img) + '" alt="' + esc(p.author || 'Earl Duncan') + '" />' +
    '<div><span class="pauthor__kicker">Written by</span><strong>' + esc(p.author || 'Earl Duncan') + '</strong>' +
    '<span class="pauthor__role">' + esc(a.role) + '</span><p>' + esc(a.bio) + '</p>' +
    '<div class="pauthor__links">' + a.links.map(l => '<a href="' + esc(l[1]) + '"' + (/^https?:/.test(l[1]) ? ' target="_blank" rel="noopener"' : '') + '>' + esc(l[0]) + '</a>').join('') + '</div></div></aside>';
}

function faqHtml(p) {
  if (!p.faqs || !p.faqs.length) return '';
  return '<section class="pfaq"><h2>Questions people ask</h2>' +
    p.faqs.map(f => '<details><summary>' + esc(f.q) + '</summary><p>' + esc(f.a) + '</p></details>').join('') + '</section>';
}

function morePosts(p, items) {
  const others = items.filter(x => x.slug !== p.slug);
  const pick = others.filter(x => x.category === p.category).concat(others.filter(x => x.category !== p.category)).slice(0, 3);
  if (!pick.length) return '';
  return '<section class="sec pmore"><div class="shell"><h2>Keep reading</h2><div class="pmore__grid">' +
    pick.map(x => '<a class="pmore__card" href="/blog/' + esc(x.slug) + '">' +
      (x.cover ? '<div class="pmore__img"><img src="' + esc(x.cover) + '" alt="' + esc(x.coverAlt) + '" loading="lazy" /></div>' : '') +
      '<strong>' + esc(x.title) + '</strong><span>' + esc(x.readingTime || 5) + ' min read</span></a>').join('') +
    '</div><a class="pmore__all" href="/blog">All posts &rarr;</a></div></section>';
}

// Six ways to show a number, so every post's data doesn't look the same.
// Counting numbers carry their final value here; post.js resets them to 0 and counts up when they scroll into view.
function vizHtml(st, max) {
  const u = esc(st.unit || ''), bars = st.bars || [];
  const ring = (v, size) => {
    const r = 42, c = 2 * Math.PI * r;
    return '<svg class="pstat__ring" viewBox="0 0 100 100" width="' + size + '" height="' + size + '" aria-hidden="true">' +
      '<circle cx="50" cy="50" r="' + r + '" class="pstat__ringbg"/>' +
      '<circle cx="50" cy="50" r="' + r + '" class="pstat__ringfg" style="--c:' + c.toFixed(1) + ';--o:' + (c * (1 - v / 100)).toFixed(1) + '" transform="rotate(-90 50 50)"/></svg>';
  };
  switch (st.type) {
    case 'paired': {
      const names = (st.series || []).map(x => x.name), mx = Math.max.apply(null, bars.map(b => Math.max.apply(null, b.values))) || 1;
      return '<div class="pstat__legendrow">' + names.map((nm, i) => '<span class="s' + i + '"><i></i>' + esc(nm) + '</span>').join('') + '</div>' +
        '<div class="pstat__paired">' + bars.map(b => '<div class="pstat__pgroup"><span class="pstat__label">' + esc(b.label) + '</span>' +
          b.values.map((v, i) => '<div class="pstat__prow s' + i + '"><span class="pstat__track"><span class="pstat__bar" style="--w:' + (v / mx * 100).toFixed(1) + '%"></span></span><span class="pstat__val">' + esc(v) + u + '</span></div>').join('') +
        '</div>').join('') + '</div>';
    }
    case 'rings':
      return '<div class="pstat__rings">' + bars.map(b => '<div class="pstat__ringitem"><div class="pstat__ringwrap">' + ring(b.value, 120) +
        '<span class="pstat__ringval">' + esc(b.value) + u + '</span></div><span class="pstat__label">' + esc(b.label) + '</span></div>').join('') + '</div>';
    case 'big':
      return '<div class="pstat__bigs">' + bars.map(b => '<div><span class="pstat__big" data-count="' + esc(b.value) + '">' + esc(b.value) + '</span><span class="pstat__bigu">' + u + '</span>' +
        '<span class="pstat__label">' + esc(b.label) + '</span></div>').join('') + '</div>';
    case 'people': {
      const b = bars[bars.length - 1], k = Math.round(b.value);
      let dots = '';
      for (let i = 0; i < 100; i++) dots += '<i class="' + (i < k ? 'on' : '') + '" style="--d:' + (i * 8) + 'ms"></i>';
      return '<div class="pstat__people"><div class="pstat__grid" role="img" aria-label="' + k + ' in 100 people">' + dots + '</div>' +
        '<div><span class="pstat__big" data-count="' + k + '">' + k + '</span><span class="pstat__bigu">in 100</span><span class="pstat__label">' + esc(b.label) + '</span>' +
        (bars.length > 1 ? '<span class="pstat__trend">' + bars.map(x => esc(x.label) + ': ' + esc(x.value) + u).join(' &middot; ') + '</span>' : '') + '</div></div>';
    }
    case 'compare': {
      const [a, b] = bars, up = ((b.value - a.value) / a.value * 100).toFixed(0);
      return '<div class="pstat__compare"><div><span class="pstat__label">' + esc(a.label) + '</span><span class="pstat__cnum">' + esc(st.prefix || '') + esc(a.value) + esc(st.suffix || '') + '</span></div>' +
        '<div class="pstat__arrow" aria-hidden="true"><svg viewBox="0 0 120 40"><path d="M4 20h100M90 6l16 14-16 14"/></svg><span>' + (up > 0 ? '+' : '') + up + '%</span></div>' +
        '<div class="is-now"><span class="pstat__label">' + esc(b.label) + '</span><span class="pstat__cnum">' + esc(st.prefix || '') + esc(b.value) + esc(st.suffix || '') + '</span></div></div>';
    }
    case 'donut': {
      const total = bars.reduce((t, b) => t + b.value, 0) || 1, r = 40, c = 2 * Math.PI * r;
      let off = 0;
      const segs = bars.map((b, i) => {
        const len = b.value / total * c, seg = '<circle cx="50" cy="50" r="' + r + '" class="pstat__seg' + (i === 0 ? ' is-lead' : '') + '" style="--o:' + (-off).toFixed(2) + '" stroke-dasharray="' + Math.max(0, len - 1.2).toFixed(2) + ' ' + c.toFixed(2) + '" transform="rotate(-90 50 50)"/>';
        off += len; return seg;
      }).join('');
      return '<div class="pstat__donut"><div class="pstat__ringwrap"><svg viewBox="0 0 100 100" width="220" height="220" aria-hidden="true">' + segs + '</svg>' +
        '<span class="pstat__ringval">' + esc(bars[0].value) + u + '</span></div><ul class="pstat__legend">' +
        bars.map((b, i) => '<li class="' + (i === 0 ? 'is-lead' : '') + '"><i></i>' + esc(b.label) + '<b>' + esc(b.value) + u + '</b></li>').join('') + '</ul></div>';
    }
    default:
      return '<div class="pstat__bars" role="table" aria-label="' + esc(st.title) + '">' +
        bars.map(b => '<div class="pstat__row" role="row" title="' + esc(b.label) + ': ' + esc(b.value) + u + '">' +
          '<span class="pstat__label" role="cell">' + esc(b.label) + '</span>' +
          '<span class="pstat__track" role="presentation"><span class="pstat__bar" style="--w:' + (b.value / max * 100).toFixed(1) + '%"></span></span>' +
          '<span class="pstat__val" role="cell">' + esc(b.value) + u + '</span></div>').join('') + '</div>';
  }
}

// A stat with its source. One per post via p.stat, or several via p.stats placed in <div class="pstat-slot" data-stat="id">.
function statHtml(st) {
  const max = Math.max.apply(null, (st.bars || []).map(b => b.value)) || 1;
  return '<figure class="pstat pstat--' + esc(st.type || 'bars') + '"><figcaption class="pstat__title">' + esc(st.title) + '</figcaption>' + vizHtml(st, max) +
    (st.takeaway ? '<p class="pstat__take">' + esc(st.takeaway) + '</p>' : '') +
    (st.note ? '<p class="pstat__src">' + esc(st.note) + '</p>' : '') +
    (st.source ? '<p class="pstat__src">Source: ' + (st.source.url ? '<a href="' + esc(st.source.url) + '" target="_blank" rel="noopener">' + esc(st.source.name) + '</a>' : esc(st.source.name)) + '</p>' : '') +
    '</figure>';
}

const PROMO_HTML = '<aside class="ppromo"><div class="ppromo__img"><img src="/assets/guide/guide-cover.png" alt="Before the Camera Comes Out, the free s4digital brand film playbook" loading="lazy" /></div>' +
  '<div class="ppromo__body">' +
  '<strong>Before the camera comes out: our free 44-page brand film playbook</strong>' +
  '<p>Find the story, set a budget that makes sense and brief a production company properly. The same questions we ask before every film.</p>' +
  '<a class="btn btn--orange" href="/guide"><span>Get the free guide</span><span class="arrow">&rarr;</span></a></div></aside>';

// Gear I actually use: matched automatically from content/gear.json by phrases in the post.
function gearHtml(g, text) {
  if (!g || !g.items) return '';
  const hits = g.items.filter(it => (it.match || []).some(m => text.includes(m.toLowerCase())));
  if (!hits.length) return '';
  let anyAff = false;
  const pr = g.programmes || {};
  return '<aside class="pgear">' + hits.map(it => {
    let link = it.affiliate || it.url, aff = !!it.affiliate;
    if (!aff && pr.amazon_uk_tag && /^https:\/\/(www\.)?amazon\.co\.uk\//.test(link)) {
      link += (link.includes('?') ? '&' : '?') + 'tag=' + encodeURIComponent(pr.amazon_uk_tag); aff = true;
    }
    if (aff) anyAff = true;
    return '<a class="pgear__item" href="' + esc(link) + '" target="_blank" rel="noopener' + (aff ? ' sponsored' : '') + '">' +
      (it.image ? '<img src="' + esc(it.image) + '" alt="' + esc(it.name) + '" loading="lazy" />' : '') +
      '<span><strong>' + esc(it.name) + '</strong><em>' + esc(it.maker || '') + '</em><span>' + esc(it.why) + '</span>' +
      '<b>' + (aff ? 'See the price' : 'Take a look') + ' &rarr;</b>' + (it.imageCredit ? '<small>' + esc(it.imageCredit) + '</small>' : '') + '</span></a>';
  }).join('') +
    (anyAff ? '<p class="pgear__note">Some links here are affiliate links. If you buy through one I may earn a small commission, at no extra cost to you. I only list kit I use.</p>' : '') +
    '</aside>';
}

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const BLOCK = /^(p|div|h[1-6]|li|ul|ol|figure|figcaption|blockquote|aside|section|br|tr|table)$/;

/** Offsets of the <h2> tags that are direct children of the article body (what `:scope > h2` finds in the browser). */
function topLevelH2s(html) {
  const out = [], re = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?(\/?)>/g;
  let depth = 0, m;
  while ((m = re.exec(html))) {
    const name = m[2].toLowerCase();
    if (m[1]) { depth = Math.max(0, depth - 1); continue; }
    if (depth === 0 && name === 'h2') out.push(m.index);
    if (!VOID.has(name) && !m[3]) depth++;
  }
  return out;
}

/** Roughly what element.innerText gives: block boundaries become line breaks, inline tags vanish. */
function textOf(html) {
  return html
    .replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, (t, n) => (BLOCK.test(n.toLowerCase()) ? '\n' : ''))
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&rsquo;|&lsquo;/g, "'").replace(/&ldquo;|&rdquo;/g, '"').replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d));
}

/** The article body with charts, the guide promo, gear cards and embeds placed exactly where post.js used to put them. */
function articleBody(p, live, gear) {
  let body = p.body || '';

  // A link to a post that isn't live yet reads as plain text until its publish date.
  body = body.replace(/<a\b[^>]*\bhref="\/blog\/([^"?#]*)[^"]*"[^>]*>([\s\S]*?)<\/a>/g, (whole, slug, inner) =>
    slug && !live.has(slug) ? '<span>' + esc(textOf(inner)) + '</span>' : whole);

  // Several stats placed by the writer.
  body = body.replace(/<div class="pstat-slot" data-stat="([^"]*)"><\/div>/g, (_, id) => {
    const st = Array.isArray(p.stats) && p.stats.find(x => x.id === id);
    return st ? statHtml(st) : '';
  });

  // Embedded films show a still and a play button; YouTube only loads once someone presses play.
  body = body.replace(/<div class="yt" data-yt="([^"]*)"([^>]*)><\/div>/g, (whole, id, rest) => {
    const t = /data-title="([^"]*)"/.exec(rest), po = /data-poster="([^"]*)"/.exec(rest);
    const title = t ? t[1] : 'Film', poster = po ? po[1] : 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg';
    return '<div class="yt" data-yt="' + id + '"' + rest + '><img src="' + poster + '" alt="" loading="lazy" />' +
      '<button type="button" class="yt__play" aria-label="Play ' + title + '"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor"/></svg></button>' +
      '<span class="yt__label">' + title + '</span></div>';
  });

  // Inserts before top-level h2s, in the same order post.js added them: stat, promo, gear.
  const h2 = topLevelH2s(body);
  const before = h2.map(() => []);
  const tail = [];
  if (p.stat && h2.length) before[Math.min(p.stat.after != null ? p.stat.after : 1, h2.length - 1)].push(statHtml(p.stat));
  if (h2.length > 3) before[Math.ceil(h2.length * 0.6)].push(PROMO_HTML);
  const assemble = () => {
    let out = '', last = 0;
    h2.forEach((at, i) => { out += body.slice(last, at) + before[i].join(''); last = at; });
    return out + body.slice(last) + tail.join('');
  };
  const g = gearHtml(gear, textOf(assemble()).toLowerCase());
  if (g) { if (h2.length) before[Math.min(2, h2.length - 1)].push(g); else tail.push(g); }
  return assemble();
}

/** One post, or a 404 when the slug isn't live (unknown, draft or scheduled for later). */
export async function renderPost(slug) {
  const items = await livePosts();
  const p = items.find(x => x.slug === slug);
  if (!p) return render404();
  let gear = null;
  try { gear = await readDoc('gear'); } catch { gear = null; }

  const author = p.author || 'Earl Duncan';
  const url = SITE + '/blog/' + p.slug;
  const modified = p.updated || p.date;

  const main =
    '<section class="phero"><div class="shell article">' +
      '<div class="crumb"><a href="/blog">&larr; All posts</a></div>' +
      '<h1 style="max-width:24ch">' + esc(p.title) + '</h1>' +
      '<div class="article__meta"><span>' + esc(nice(p.date)) + '</span><span>&middot;</span>' +
        '<span>' + esc(p.readingTime || 5) + ' min read</span><span>&middot;</span><span>' + esc(author) + '</span></div>' +
    '</div></section>' +
    '<section class="sec" style="padding-top:0"><div class="shell article">' +
      (p.cover ? '<figure class="article__cover"><img src="' + esc(p.cover) + '" alt="' + esc(p.coverAlt) + '" fetchpriority="high" /></figure>' : '') +
      '<div class="article__body">' + articleBody(p, new Set(items.map(x => x.slug)), gear) + '</div>' +
    '</div></section>' +
    '<section class="sec" style="padding-top:0"><div class="shell article">' + authorHtml(p) + faqHtml(p) + '</div></section>' +
    morePosts(p, items) +
    '<section class="pband"><div class="shell pband__inner">' +
      '<h2>Got a story <span>worth filming?</span></h2>' +
      '<p>We make documentary-style brand films about businesses that are exceptionally good at what they do. The first conversation is free.</p>' +
      '<div class="pband__ctas"><a class="btn btn--orange btn--lg" data-book href="/contact"><span>Book a discovery call</span><span class="arrow">&rarr;</span></a>' +
      '<a class="btn btn--ghost btn--lg" href="/films"><span>See the films</span><span class="arrow">&rarr;</span></a></div>' +
    '</div></section>' +
    '<aside class="pfloat" id="pFloat" aria-label="Talk to Earl about a film" hidden>' +
      '<button type="button" class="pfloat__x" aria-label="Close">&times;</button>' +
      '<div class="pfloat__head"><img src="/assets/earl/earl-head.png" alt="" /><div><strong>Thinking about a film?</strong><span>Tell me a bit about it and I&rsquo;ll come back within one working day.</span></div></div>' +
      '<form class="pfloat__form" action="https://formsubmit.co/ajax/005f38c83e0554279919ce0dff944657" method="POST">' +
        '<input type="hidden" name="_subject" value="Blog enquiry: ' + esc(p.title) + '">' +
        '<input type="hidden" name="_template" value="table"><input type="hidden" name="_captcha" value="false">' +
        '<input type="text" name="_honey" tabindex="-1" autocomplete="off" class="pfloat__hp" aria-hidden="true">' +
        '<label><span>Name</span><input type="text" name="Name" autocomplete="name" required></label>' +
        '<label><span>Email</span><input type="email" name="Email" autocomplete="email" required></label>' +
        '<label><span>Phone <em>optional</em></span><input type="tel" name="Phone" autocomplete="tel"></label>' +
        '<label><span>What&rsquo;s the story?</span><textarea name="Enquiry" rows="3" required></textarea></label>' +
        '<button type="submit" class="btn btn--orange"><span>Send it to Earl</span><span class="arrow">&rarr;</span></button>' +
        '<p class="pfloat__msg" role="status" aria-live="polite"></p>' +
      '</form>' +
    '</aside>';

  // Article data for search engines and AI answer engines.
  const person = { '@type': 'Person', '@id': SITE + '/about#earl', name: author, url: SITE + '/about' };
  let ld = ldJson({
    '@context': 'https://schema.org', '@type': 'BlogPosting',
    headline: p.title, description: p.excerpt || '',
    datePublished: p.date, dateModified: modified,
    author: person,
    publisher: { '@type': 'Organization', name: 's4digital', url: SITE, logo: { '@type': 'ImageObject', url: LOGO, width: 1620, height: 378 } },
    image: p.cover ? abs(p.cover) : undefined,
    articleSection: p.category || undefined,
    inLanguage: 'en-GB',
    url,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
  });
  if (p.faqs && p.faqs.length) {
    ld += '\n' + ldJson({ '@context': 'https://schema.org', '@type': 'FAQPage',
      mainEntity: p.faqs.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) });
  }

  let html = await template('templates/post.html');
  html = setHead(html, {
    title: p.title + ' | s4digital',
    description: p.excerpt || BLOG_DESC,
    canonical: url,
    og: {
      type: 'article', title: p.title,
      image: p.cover ? abs(p.cover) : '', imageAlt: p.coverAlt || '',
      published: p.date, modified, author: SITE + '/about',
    },
    extra: RSS_LINK + '\n' + ld,
  });
  html = html.replace('<main id="postPage"></main>', () => '<main id="postPage" data-ssr>' + main + '</main>');
  return { status: 200, html };
}

/* ------------------------------------------------------------------ RSS */

const xml = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const rfc822 = d => new Date((/^\d{4}-\d{2}-\d{2}$/.test(d || '') ? d : new Date().toISOString().slice(0, 10)) + 'T08:00:00Z').toUTCString();

export async function renderFeed() {
  const items = (await livePosts()).slice(0, 50);
  const body = items.map(p => {
    const link = abs(postHref(p));
    return '  <item>\n' +
      '    <title>' + xml(p.title) + '</title>\n' +
      '    <link>' + xml(link) + '</link>\n' +
      '    <guid isPermaLink="true">' + xml(link) + '</guid>\n' +
      '    <pubDate>' + rfc822(p.date) + '</pubDate>\n' +
      '    <dc:creator>' + xml(p.author || 'Earl Duncan') + '</dc:creator>\n' +
      (p.category ? '    <category>' + xml(p.category) + '</category>\n' : '') +
      '    <description>' + xml(p.excerpt || '') + '</description>\n' +
      (p.cover ? '    <media:content url="' + xml(abs(p.cover)) + '" medium="image" />\n' : '') +
      '  </item>';
  }).join('\n');
  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:media="http://search.yahoo.com/mrss/">\n' +
    '<channel>\n' +
    '  <title>s4digital blog</title>\n' +
    '  <link>' + SITE + '/blog</link>\n' +
    '  <atom:link href="' + SITE + '/blog/feed.xml" rel="self" type="application/rss+xml" />\n' +
    '  <description>' + xml(BLOG_DESC) + '</description>\n' +
    '  <language>en-gb</language>\n' +
    (items.length ? '  <lastBuildDate>' + rfc822(items[0].date) + '</lastBuildDate>\n' : '') +
    body + '\n</channel>\n</rss>\n';
}

/* ------------------------------------------------------------ case study */

/** /work/<slug>: its own title, description, canonical and social card. The page body is still drawn by assets/work.js. */
export async function renderCaseStudy(slug) {
  const doc = await readDoc('work');
  const w = (doc.items || []).find(x => x.slug === slug);
  if (!w) return render404();
  const url = SITE + '/work/' + w.slug;
  const cover = w.cover && w.cover.src ? abs(w.cover.src) : '';
  let html = await template('templates/case-study.html');
  html = setHead(html, {
    title: w.client + ' | Case Study | s4digital',
    description: w.summary || 'A film and content case study from s4digital.',
    canonical: url,
    og: { type: 'article', title: w.client + ' | s4digital case study', image: cover, imageAlt: (w.cover && w.cover.alt) || '' },
  });
  return { status: 200, html };
}
