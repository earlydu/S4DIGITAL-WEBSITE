"""Build the London location pages (hub, regions, boroughs) from the Croydon page's chrome.

Run: python tools/build_location_pages.py
Content lives in tools/location_data.py. Every page has to stay genuinely local:
real filming rules, real places, the nearest real case study, and never a claim
that we've filmed somewhere we haven't.
"""
import json
import re
from pathlib import Path

from location_data import CARDS, PAGES, SHARED_FAQ

ROOT = Path(__file__).resolve().parent.parent
SITE = "https://s4digi.com"
TEMPLATE = (ROOT / "video-production-croydon.html").read_text(encoding="utf-8")

STYLE = TEMPLATE[TEMPLATE.index("<style>"):TEMPLATE.index("</style>") + len("</style>")]
CHROME_TOP = TEMPLATE[TEMPLATE.index("<body>"):TEMPLATE.index('<section class="phero">')]
CHROME_TAIL = TEMPLATE[TEMPLATE.index('<section class="cta" id="contact">'):]


def nb(s):
    """Join the last two words with &nbsp; so no line ends on a lone word."""
    depth, last = 0, -1
    for i, ch in enumerate(s):
        if ch == "<":
            depth += 1
        elif ch == ">":
            depth -= 1
        elif ch == " " and depth == 0:
            last = i
    return s if last < 0 else s[:last] + "&nbsp;" + s[last + 1:]


def t(s):
    """Copy -> HTML text: curly apostrophes, pound entity, no widow."""
    return nb(ap(s))


def ap(s):
    """Straight apostrophes -> &rsquo; (contractions, possessives, plural possessives)."""
    s = re.sub(r"(?<=\w)'(?=\w)|'(?=s\b)|(?<=s)'(?=[\s&.,])", "&rsquo;", s)
    return s.replace("£", "&pound;")


def plain(s):
    """Copy -> JSON-LD text (strip tags)."""
    return re.sub(r"<[^>]+>", "", s).replace("'", "’")


def card(slug, sector):
    c = CARDS[slug]
    return f"""      <a class="wcard" href="/work/{slug}">
        <div class="wcard__media"><img src="{c['img']}" alt="{c['alt']}" loading="lazy" /></div>
        <div class="wcard__body">
          <span class="wcard__sector">{sector}</span>
          <h3 class="wcard__title">{t(c['title'])}</h3>
          <p class="wcard__desc">{t(c['desc'])}</p>
          <span class="wcard__more">Read the case study<span class="arrow">&rarr;</span></span>
        </div>
      </a>"""


def page(p):
    url = f"{SITE}/{p['slug']}"
    name = p["name"]
    faqs = p["faq"] + [(q.format(name=name), a.format(name=name)) for q, a in SHARED_FAQ]

    crumbs = [("Home", f"{SITE}/"), ("London", f"{SITE}/video-production-london")]
    if p.get("parent"):
        crumbs.append(p["parent"])
    if p["slug"] != "video-production-london":
        crumbs.append((name, url))
    graph = [
        {
            "@type": "ProfessionalService", "name": "s4digital", "url": f"{SITE}/",
            "telephone": "+44 20 4572 1118", "email": "earl@s4digi.com",
            "image": f"{SITE}/assets/og-card.jpg",
            "description": plain(p["meta"]),
            "areaServed": [{"@type": "Place", "name": a} for a in p["served"]],
            "address": {"@type": "PostalAddress", "addressLocality": "London", "addressCountry": "GB"},
        },
        {
            "@type": "BreadcrumbList",
            "itemListElement": [
                {"@type": "ListItem", "position": i + 1, "name": n, "item": u}
                for i, (n, u) in enumerate(crumbs)
            ],
        },
        {
            "@type": "FAQPage",
            "mainEntity": [
                {"@type": "Question", "name": plain(q), "acceptedAnswer": {"@type": "Answer", "text": plain(a)}}
                for q, a in faqs
            ],
        },
    ]
    ld = json.dumps({"@context": "https://schema.org", "@graph": graph}, ensure_ascii=False)

    offer = "\n".join(
        f'      <div><h3>{h}</h3><p>{t(b)}</p><a href="{href}">{lbl}<span class="arrow">&rarr;</span></a></div>'
        for h, b, href, lbl in p["offer"]
    )
    places = "\n".join(
        f"      <div><h3>{ap(x[0])}</h3><p>{t(x[1])}</p>"
        + (f'<a href="{x[2]}">{x[3]}<span class="arrow">&rarr;</span></a>' if len(x) == 4 else "")
        + "</div>"
        for x in p["places"]
    )
    know = "\n".join(f"        <li><b>{t(h)}</b><span>{t(b)}</span></li>" for h, b in p["know"])
    cards = "\n".join(card(s, sec) for s, sec in p["work"])
    areas = "\n".join(f"      <div><h3>{ap(h)}</h3><p>{t(b)}</p></div>" for h, b in p["areas"])
    faq_html = "\n".join(f"        <details><summary>{t(q)}</summary><p>{t(a)}</p></details>" for q, a in faqs)
    links = p.get("links_html", "")

    return f"""<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>{p['title']}</title>
<meta name="description" content="{p['meta']}" />
<link rel="canonical" href="{url}" />
<meta property="og:title" content="{p['title']}" />
<meta property="og:description" content="{p['meta']}" />
<meta property="og:type" content="website" />
<meta property="og:url" content="{url}" />
<meta property="og:image" content="{SITE}/assets/og-card.jpg" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:image" content="{SITE}/assets/og-card.jpg" />
<link rel="icon" type="image/png" href="/assets/32wh.png" />
<link rel="apple-touch-icon" href="/assets/32wh.png" />
<link rel="preconnect" href="https://api.fontshare.com" crossorigin />
<link rel="preconnect" href="https://cdn.fontshare.com" crossorigin />
<link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=satoshi@400,500,700,900&display=swap" />
<link rel="stylesheet" href="/assets/site.css?v=202611011200" />
{STYLE}
<script type="application/ld+json">{ld}</script>
</head>
{CHROME_TOP}<section class="phero">
  <span class="ast phero__bg" aria-hidden="true"></span>
  <div class="shell">
    <h1>{p['h1']}</h1>
    <p class="phero__sub">{t(p['intro'])}</p>
    <div class="phero__ctas">
      <a class="btn btn--orange btn--lg" data-book href="/contact"><span>Book a Discovery Call</span><span class="arrow">&rarr;</span></a>
      <a class="btn btn--ghost btn--lg" href="#local-work"><span>{p['work_btn']}</span><span class="arrow">&rarr;</span></a>
    </div>
  </div>
</section>

<section class="sec" style="padding-top:8px">
  <div class="shell">
    <h2 class="loc__h2">{p['offer_h2']}</h2>
    <div class="locgrid">
{offer}
    </div>
  </div>
</section>

<section class="sec">
  <div class="shell">
    <h2 class="loc__h2">{p['places_h2']}</h2>
    <div class="locgrid">
{places}
    </div>
  </div>
</section>

<section class="sec">
  <div class="shell">
    <h2 class="loc__h2">{p['know_h2']}</h2>
    <ul class="objections">
{know}
    </ul>
  </div>
</section>

<section class="gal" id="local-work">
  <div class="shell">
    <div class="gal__head">
      <h2>{p['work_h2']}</h2>
      <p>{t(p['work_intro'])}</p>
    </div>
    <div class="wgrid">
{cards}
    </div>
    <div class="sec__foot">
      <a class="btn btn--ghost btn--lg" href="/work"><span>See every case study</span><span class="arrow">&rarr;</span></a>
    </div>
  </div>
</section>

<section class="sec">
  <div class="shell">
    <h2 class="loc__h2">{p['areas_h2']}</h2>
    <div class="locareas">
{areas}
    </div>
    <p class="locnote">{t(p['note'])}</p>{links}
  </div>
</section>

<section class="sec">
  <div class="shell">
    <div class="ps-faqwrap">
      <div>
        <h2>{p['faq_h2']}</h2>
        <p>The questions businesses ask us most. Anything else, ask us on the&nbsp;call.</p>
        <a class="btn btn--orange btn--lg" data-book href="/contact"><span>Book a Discovery Call</span><span class="arrow">&rarr;</span></a>
      </div>
      <div class="ps-faq">
{faq_html}
      </div>
    </div>
  </div>
</section>

{CHROME_TAIL}"""


def main():
    for p in PAGES:
        out = ROOT / f"{p['slug']}.html"
        out.write_text(page(p), encoding="utf-8", newline="\n")
        print("wrote", out.name)


if __name__ == "__main__":
    main()
