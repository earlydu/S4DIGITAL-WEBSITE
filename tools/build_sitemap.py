"""Build sitemap.xml from the static pages plus the case studies and published blog posts.

Run after adding a case study or post:  python tools/build_sitemap.py
"""
import json, os, datetime
from xml.sax.saxutils import escape

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = 'https://s4digi.com'
TODAY = datetime.date.today().isoformat()  # scheduled posts join the sitemap on their date

# path, html file (for lastmod), priority. Private pages (/sales, /admin) stay out on purpose.
PAGES = [
    ('/', 'index.html', '1.0'),
    ('/films', 'films.html', '0.9'),
    ('/work', 'work.html', '0.9'),
    ('/services', 'services.html', '0.8'),
    ('/about', 'about.html', '0.8'),
    ('/personal-brand-shoot', 'personal-brand-shoot.html', '0.6'),
    ('/guide', 'guide.html', '0.7'),
    ('/planpulse', 'planpulse.html', '0.4'),
    ('/free-tools', 'free-tools.html', '0.6'),
    ('/free-tools/video-resizer', 'free-tools/video-resizer.html', '0.5'),
    ('/free-tools/pdf-tools', 'free-tools/pdf-tools.html', '0.5'),
    ('/free-tools/film-budget', 'free-tools/film-budget.html', '0.6'),
    ('/privacy', 'privacy.html', '0.2'),
    ('/terms', 'terms.html', '0.2'),
]

def mtime(name):
    return datetime.date.fromtimestamp(os.path.getmtime(os.path.join(ROOT, name))).isoformat()

def load(name):
    with open(os.path.join(ROOT, 'content', name), encoding='utf-8') as f:
        return json.load(f)['items']

urls = [(SITE + p, mtime(f), pr) for p, f, pr in PAGES]
work_date = mtime('content/work.json')
urls += [(f"{SITE}/work/{w['slug']}", work_date, '0.7') for w in load('work.json') if w.get('slug')]
posts = [p for p in load('posts.json') if p.get('status') == 'published' and p.get('slug') and p.get('date', '') <= TODAY]
if posts:  # the blog index only goes in once there is something on it
    urls.append((SITE + '/blog', mtime('templates/blog.html'), '0.5'))
urls += [(f"{SITE}/blog/{p['slug']}", p.get('date') or mtime('content/posts.json'), '0.4')
         for p in load('posts.json') if p.get('status') == 'published' and p.get('slug') and p.get('date', '') <= TODAY]

out = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
for loc, lastmod, pr in urls:
    out.append(f'  <url><loc>{escape(loc)}</loc><lastmod>{lastmod}</lastmod><priority>{pr}</priority></url>')
out.append('</urlset>')
with open(os.path.join(ROOT, 'sitemap.xml'), 'w', encoding='utf-8') as f:
    f.write('\n'.join(out) + '\n')
print(f'sitemap.xml: {len(urls)} urls')
