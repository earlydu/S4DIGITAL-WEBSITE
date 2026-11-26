"""Build /kit-hire (kit-hire.html) from Earl's kit catalogue and Scouty listings.

Chrome (head links, nav, footer, modals) is copied from case-study-videos.html, so edit that page's
nav/footer first and rerun.  Cards come from the kit catalogue in
S4 STORYTELLING PROSPECTS/crew-for-hire/kit/fatllama (scouty_copy.load, day_rate, scouty_fill.category),
covers from its scouty/<slug>.png (written to assets/kit/<slug>.webp), links from
_scouty_map/hrefs.json (title -> /listing/... on scouty.com).  Usage: python tools/build_kit_hire.py"""
import html, json, os, re, sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KIT = os.path.join(ROOT, '..', 'S4 STORYTELLING PROSPECTS', 'crew-for-hire', 'kit', 'fatllama')
sys.path.insert(0, KIT)
import scouty_copy  # noqa: E402
from scouty_fill import category  # noqa: E402

OUT_IMG = os.path.join(ROOT, 'assets', 'kit')
SCOUTY = 'https://www.scouty.com'
PROFILE = SCOUTY + '/user/6b07730ec141830016b49edc'
GROUPS = [('cameras', 'Cameras'), ('lenses', 'Lenses'), ('sound', 'Sound'), ('lighting', 'Lighting'),
          ('support', 'Grip and support'), ('kits', 'Kits')]
GROUP_OF = {'Camera': 'cameras', 'Lens': 'lenses', 'Audio': 'sound', 'Lighting': 'lighting'}

FAQ = [
    ('How do I book?', 'Every item is listed on Scouty, so you book and pay there. Message me through the listing first so I can check the dates, then Scouty handles the payment and ID checks.'),
    ('Do I need insurance?', "Yes. I'll need your hire insurance certificate and photo ID before the first booking. Scouty doesn't insure the kit, so it has to be covered by your own hire policy."),
    ('Where do I collect from?', "Crystal Palace, SE19. We'll agree a time that suits, and evenings and weekends are fine. I can deliver in London too, just ask."),
    ('Can I hire it for the weekend?', 'Usually, yes. For a weekend hire you can collect on Friday and drop back on Monday.'),
    ('Is it cheaper for longer hires?', "Yes, hires of five days or more get 20% off the day rate."),
    ('Can you come and shoot it as well?', "Yes. I'm a working self-shooting director, so you can hire me with the kit for a crewed day. Tell me about the job and I'll come back with a price."),
]


def esc(s):
    return html.escape(s, quote=True)


def group(item):
    if not item['slug'].startswith('s'):
        return 'kits'
    return GROUP_OF.get(category(item)[0], 'support')


def cover(slug):
    os.makedirs(OUT_IMG, exist_ok=True)
    out = os.path.join(OUT_IMG, slug + '.webp')
    src = os.path.join(KIT, 'scouty', slug + '.png')
    if not os.path.exists(out) or os.path.getmtime(out) < os.path.getmtime(src):
        im = Image.open(src).convert('RGB')
        im.thumbnail((800, 600))
        im.save(out, 'WEBP', quality=80, method=6)
    return f'/assets/kit/{slug}.webp'


def card(item, href):
    g = group(item)
    label = {'cameras': 'Camera', 'lenses': 'Lens', 'sound': 'Sound', 'lighting': 'Lighting',
             'support': 'Grip and support', 'kits': 'Kit'}[g]
    sub = re.sub(r'\s*·\s*', ', ', item['sub'])
    return f'''      <a class="wcard kcard" data-group="{g}" href="{esc(SCOUTY + href)}" target="_blank" rel="noopener">
        <div class="wcard__media"><img src="{cover(item['slug'])}" alt="{esc(item['title'])}" loading="lazy" width="800" height="600" /></div>
        <div class="wcard__body">
          <h3 class="wcard__title">{esc(item['title'])}</h3>
          <p class="wcard__desc">{esc(sub)}</p>
          <p class="kcard__price">&pound;{scouty_copy.day_rate(item)} a day</p>
          <span class="wcard__more">Book on Scouty<span class="arrow">&rarr;</span></span>
        </div>
      </a>'''


def main():
    items = scouty_copy.load()
    hrefs = json.load(open(os.path.join(KIT, '_scouty_map', 'hrefs.json'), encoding='utf-8'))
    titles = {r['slug']: r['title'] for r in json.load(open(os.path.join(KIT, 'scouty_published.json'), encoding='utf-8'))}
    titles.setdefault('s01-sony-fx6', 'Sony FX6 Full-Frame Cinema Camera | Body + Handle + LCD')
    order = {g: i for i, (g, _) in enumerate(GROUPS)}
    items.sort(key=lambda x: (order[group(x)], -scouty_copy.day_rate(x)))
    cards = '\n'.join(card(x, hrefs[titles[x['slug']]]) for x in items)
    counts = {g: sum(group(x) == g for x in items) for g, _ in GROUPS}
    tabs = f'<button type="button" class="ktab is-on" data-k="all">All <span>{len(items)}</span></button>' + ''.join(
        f'<button type="button" class="ktab" data-k="{g}">{n} <span>{counts[g]}</span></button>' for g, n in GROUPS)

    src = open(os.path.join(ROOT, 'case-study-videos.html'), encoding='utf-8').read()
    head_links = src[src.index('<link rel="icon"'):src.index('<script type="application/ld+json">')]
    chrome_top = src[src.index('<body>'):src.index('<section class="phero')]
    chrome_foot = src[src.index('<footer class="footer">'):]

    desc = ("Camera and film kit hire in South London: Sony FX6 and A1, G Master lenses, Sennheiser sound, "
            "lights and grip. Collect from Crystal Palace, SE19, or book a crewed day.")
    schema = {'@context': 'https://schema.org', '@graph': [
        {'@type': 'Service', 'name': 'Camera kit hire', 'serviceType': 'Camera and film equipment hire',
         'provider': {'@type': 'ProfessionalService', 'name': 's4digital', 'url': 'https://s4digi.com/'},
         'areaServed': [{'@type': 'City', 'name': 'London'}], 'url': 'https://s4digi.com/kit-hire', 'description': desc},
        {'@type': 'BreadcrumbList', 'itemListElement': [
            {'@type': 'ListItem', 'position': 1, 'name': 'Home', 'item': 'https://s4digi.com/'},
            {'@type': 'ListItem', 'position': 2, 'name': 'Kit hire', 'item': 'https://s4digi.com/kit-hire'}]},
        {'@type': 'FAQPage', 'mainEntity': [{'@type': 'Question', 'name': q,
                                              'acceptedAnswer': {'@type': 'Answer', 'text': a}} for q, a in FAQ]}]}
    faq = '\n'.join(f'      <details><summary>{esc(q)}</summary><p>{esc(a)}</p></details>' for q, a in FAQ)

    page = f'''<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Camera Kit Hire South London | Sony FX6, A1 and G Master | s4digital</title>
<meta name="description" content="{esc(desc)}" />
<link rel="canonical" href="https://s4digi.com/kit-hire" />
<meta property="og:title" content="Camera kit hire in South London" />
<meta property="og:description" content="The kit I shoot with, for hire. Collect from Crystal Palace, or hire me with it." />
<meta property="og:type" content="website" />
<meta property="og:url" content="https://s4digi.com/kit-hire" />
<meta property="og:image" content="https://s4digi.com/assets/kit/04-fx6-zoom-kit.webp" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:image" content="https://s4digi.com/assets/kit/04-fx6-zoom-kit.webp" />
{head_links}<script type="application/ld+json">{json.dumps(schema, ensure_ascii=False)}</script>
<style>
  .csvh h1{{font-weight:900;font-size:clamp(38px,5.2vw,68px);line-height:1;letter-spacing:-.035em;margin:0 0 18px;max-width:17ch;text-wrap:balance}}
  .csvh h1 .kw{{color:var(--blue)}}
  .csvh p{{font-size:18px;line-height:1.6;color:var(--ink-2);max-width:60ch;margin:0 0 26px;text-wrap:pretty}}
  .csvh__ctas{{display:flex;flex-wrap:wrap;gap:12px;align-items:center}}
  .csvprose{{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:28px}}
  .csvprose h2{{font-size:clamp(22px,2vw,26px);letter-spacing:-.02em;margin:0 0 10px;text-wrap:balance}}
  .csvprose p{{margin:0;color:var(--ink-2);line-height:1.65;text-wrap:pretty}}
  .csvfaq{{max-width:820px}}
  .csvfaq details{{border-bottom:1px solid var(--line);padding:18px 0}}
  .csvfaq summary{{font-weight:800;font-size:18px;cursor:pointer;list-style:none}}
  .csvfaq summary::-webkit-details-marker{{display:none}}
  .csvfaq details p{{margin:12px 0 0;color:var(--ink-2);line-height:1.65}}
  .ktabs{{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 28px}}
  .ktab{{font:inherit;font-weight:700;font-size:14px;padding:9px 16px;border-radius:999px;border:1px solid var(--line);background:transparent;color:var(--ink);cursor:pointer}}
  .ktab span{{opacity:.55;font-weight:500;margin-left:4px}}
  .ktab.is-on{{background:var(--ink);color:var(--paper);border-color:var(--ink)}}
  .gal__head a{{color:var(--ink);font-weight:700;text-decoration:underline;text-underline-offset:3px}}
  .kcard[hidden]{{display:none}}
  .kcard{{content-visibility:auto;contain-intrinsic-size:auto 520px}}
  .kcard__price{{font-size:17px;font-weight:800;color:var(--ink);margin:2px 0 0}}
  [data-theme="dark"] .kcard__price{{color:#fff}}
  .kcard .wcard__media{{background:#E3DDD3}}
  .kcard .wcard__media img{{object-fit:contain}}
  @media (max-width:900px){{.csvprose{{grid-template-columns:1fr}}}}
</style>
</head>
{chrome_top}<section class="phero csvh" style="padding-bottom:40px">
  <div class="shell">
    <h1>Camera kit hire in South London, from a <span class="kw">working</span>&nbsp;filmmaker.</h1>
    <p>This is the kit I shoot with: the Sony FX6 and A1, G Master lenses, Sennheiser sound, Amaran lights and the grip to hold it all. Collect from Crystal Palace, SE19, or I can deliver in London. Everything is booked through Scouty, which handles the payment and ID checks, and you&rsquo;ll need hire&nbsp;insurance.</p>
    <div class="csvh__ctas">
      <a class="btn btn--orange btn--lg" href="#kit"><span>Browse the kit</span><span class="arrow">&rarr;</span></a>
      <a class="btn btn--ghost" href="#" data-quickform="Crewed kit hire"><span>Hire me with it</span><span class="arrow">&rarr;</span></a>
    </div>
  </div>
</section>

<section class="sec sec--tight">
  <div class="shell csvprose">
    <div><h2>Dry hire</h2><p>Take the kit and shoot it yourself. It goes out clean, charged and tested, and I&rsquo;ll show you round it when you collect. The kits put together what usually gets hired together, so you&rsquo;re not short a battery or a plate on the&nbsp;day.</p></div>
    <div><h2>Hire me with it</h2><p>If you&rsquo;d rather not shoot it yourself, book me as a self-shooting director with the kit. Interviews, documentary, events and brand content. Tell me about the job and I&rsquo;ll come back with a price for the&nbsp;day.</p></div>
    <div><h2>Collection and delivery</h2><p>Pick up and drop off in Crystal Palace, SE19. Evenings and weekends are fine, and for a weekend hire you can usually collect on Friday and drop back on Monday. I can deliver in London, just&nbsp;ask.</p></div>
  </div>
</section>

<section class="sec kitsec" id="kit">
  <div class="shell">
    <div class="gal__head">
      <h2>The <span class="kw">kit</span></h2>
      <p>Day rates as listed on Scouty, with 20% off hires of five days or more. See everything on <a href="{PROFILE}" target="_blank" rel="noopener">my Scouty profile</a>.</p>
    </div>
    <div class="ktabs" role="group" aria-label="Filter the kit">{tabs}</div>
    <div class="wgrid" id="kitGrid">
<!-- generated by tools/build_kit_hire.py -->
{cards}
    </div>
  </div>
</section>

<section class="sec">
  <div class="shell">
    <div class="sec__head"><h2>Questions people&nbsp;ask</h2></div>
    <div class="csvfaq">
{faq}
    </div>
  </div>
</section>

<section class="sec sec--tight csend">
  <div class="shell csend__inner">
    <h2>Need someone to shoot it?</h2>
    <p>Tell me about the job and the dates. I come back within one working day.</p>
    <a class="btn btn--orange btn--lg" href="#" data-quickform="Crewed kit hire"><span>Hire me with the kit</span><span class="arrow">&rarr;</span></a>
  </div>
</section>

<script>
  document.querySelectorAll('.ktab').forEach(function (b) {{
    b.addEventListener('click', function () {{
      var k = b.getAttribute('data-k');
      document.querySelectorAll('.ktab').forEach(function (x) {{ x.classList.toggle('is-on', x === b); }});
      document.querySelectorAll('#kitGrid .kcard').forEach(function (c) {{ c.hidden = k !== 'all' && c.getAttribute('data-group') !== k; }});
    }});
  }});
</script>

{chrome_foot}'''
    open(os.path.join(ROOT, 'kit-hire.html'), 'w', encoding='utf-8', newline='\n').write(page)
    print('wrote kit-hire.html with', len(items), 'items', counts)


if __name__ == '__main__':
    main()
