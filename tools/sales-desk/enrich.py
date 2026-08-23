# -*- coding: utf-8 -*-
"""Visit every prospect's website once and take two things away:

  1. a usable email address, with the same hygiene that caught the placeholders,
     web developers' addresses and duplicate inboxes on the EV list
  2. something real and specific to open the email with

The second is the point. A merge field with their review count in it is not research,
and 465 emails carrying the same sentence read exactly like what they are. Anything
this cannot find a genuine hook for is flagged rather than quietly sent.
"""
import csv, json, os, re, sys, warnings, html
import requests
import concurrent.futures as cf

warnings.filterwarnings('ignore')
sys.stdout.reconfigure(encoding='utf-8')

SRC = os.path.join('..', '..', 'prospects-from-directories-uk.csv')
UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
                    '(KHTML, like Gecko) Chrome/122.0 Safari/537.36'}

SUBPAGE = re.compile(
    r'href=["\']([^"\']*(?:contact|about|our-?team|who-?we-?are|case-?stud|projects?|'
    r'gallery|testimonial|review)[^"\']*)["\']', re.I)

SOCIAL = {
    'instagram': r'instagram\.com/([A-Za-z0-9_.]{2,30})',
    'facebook':  r'facebook\.com/([A-Za-z0-9_.\-]{2,40})',
    'youtube':   r'youtube\.com/(?:@|c/|channel/|user/)([A-Za-z0-9_.\-]{2,40})',
    'linkedin':  r'linkedin\.com/(?:company|in)/([A-Za-z0-9_.\-]{2,60})',
    'tiktok':    r'tiktok\.com/@([A-Za-z0-9_.]{2,30})',
}

# things that are actually true about this one business, in order of how specific they are
HOOKS = [
    ('since',     r'\b(?:established|est\.?|trading|serving|since)\s+(?:in\s+)?((?:19|20)\d{2})\b'),
    ('years',     r'\b(?:over|more than)\s+(\d{2})\+?\s+years\b'),
    ('family',    r'\b(family[- ]run|family[- ]owned|third generation|second generation)\b'),
    ('fleet',     r'\b(?:fleet of\s+)?(\d{1,3})\s+(?:vans|vehicles|engineers|technicians)\b'),
    ('team',      r'\bteam of\s+(\d{1,3})\b'),
    ('247',       r'\b(24[/ ]?7|24 hour|round the clock)\b'),
    ('accred',    r'\b(Gas Safe|NICEIC|REFCOM|F-Gas|OFTEC|CHAS|SafeContractor|Constructionline|'
                  r'ISO 9001|TrustMark|NAPIT|BESA)\b'),
    ('sector',    r'\b(schools?|hospitals?|care homes?|hotels?|restaurants?|data ?centres?|'
                  r'warehouses?|leisure centres?|councils?|housing associations?)\b'),
    ('award',     r'\b(award[- ]winning|winner of|finalist)\b'),
]

VIDEO = re.compile(r'(youtube\.com/embed|youtu\.be/|player\.vimeo|<video|wistia)', re.I)
EMAIL = re.compile(r'[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}')

PLACEHOLDER = {'domain.com', 'test.com', 'example.com', 'yourdomain.com', 'yoursite.com',
               'email.com', 'sentry.io', 'wixpress.com', 'company.com', 'sentry-next.wixpress.com'}
CONSUMER = {'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'hotmail.co.uk',
            'yahoo.com', 'yahoo.co.uk', 'btinternet.com', 'icloud.com', 'live.co.uk',
            'sky.com', 'aol.com', 'me.com', 'btconnect.com'}


def get(url, timeout=14):
    try:
        r = requests.get(url, headers=UA, timeout=timeout, verify=False)
        return (r.text or '')[:400000] if r.status_code < 400 else ''
    except Exception:
        return ''


def text_of(h):
    h = re.sub(r'<(script|style|noscript)[^>]*>.*?</\1>', ' ', h, flags=re.I | re.S)
    h = re.sub(r'<[^>]+>', ' ', h)
    return re.sub(r'\s+', ' ', html.unescape(h)).strip()


def domain(u):
    m = re.search(r'https?://([^/]+)', (u or '').lower())
    return m.group(1).replace('www.', '').split(':')[0] if m else ''


def tokens(t):
    return {w for w in re.split(r'[^a-z0-9]+', (t or '').lower()) if len(w) > 3}


def work(row):
    out = dict(row)
    out.update({'foundEmail': '', 'emailNote': '', 'socials': {}, 'usesVideo': False,
                'hooks': [], 'hookText': '', 'hookQuality': 'none', 'siteLive': False,
                'title': ''})

    site = (row.get('Website') or '').strip()
    if not site:
        out['emailNote'] = 'no website'
        return out
    if not site.startswith('http'):
        site = 'https://' + site
    root = domain(site)

    home = get(site) or get('https://' + root) or get('http://' + root)
    if not home:
        out['emailNote'] = 'site did not load'
        return out
    out['siteLive'] = True

    t = re.search(r'<title[^>]*>(.*?)</title>', home, re.I | re.S)
    out['title'] = re.sub(r'\s+', ' ', html.unescape(t.group(1))).strip()[:140] if t else ''

    pages, picked = [home], []
    for m in SUBPAGE.finditer(home):
        u = m.group(1)
        if u.startswith(('#', 'mailto', 'tel', 'javascript')):
            continue
        if u.startswith('/'):
            u = '/'.join(site.split('/')[:3]) + u
        if not u.startswith('http') or u in picked:
            continue
        picked.append(u)
        if len(picked) >= 3:
            break
    for u in picked:
        page = get(u, 11)
        if page:
            pages.append(page)

    blob = ' '.join(pages)
    body = text_of(blob)

    # ---- socials ----
    for k, pat in SOCIAL.items():
        m = re.search(pat, blob, re.I)
        if m and m.group(1).lower() not in ('sharer', 'share', 'tr', 'plugins', 'pages', 'profile.php'):
            out['socials'][k] = m.group(1)
    out['usesVideo'] = bool(VIDEO.search(blob))

    # ---- email, with the hygiene the EV list taught us ----
    found = []
    for e in EMAIL.findall(blob):
        e = e.strip().strip('.,;:').lower()
        if re.search(r'\.(png|jpe?g|gif|webp|svg)$', e):
            continue
        if e not in found:
            found.append(e)

    chosen, note = '', ''
    for e in found:
        ed = e.split('@')[-1]
        if ed in PLACEHOLDER:
            note = 'site has a placeholder address'
            continue
        if ed == root or ed.endswith('.' + root) or root.endswith('.' + ed):
            chosen = e
            break
        if ed in CONSUMER:
            local = re.sub(r'[^a-z0-9]', '', e.split('@')[0])
            if any(len(x) >= 4 and x in local for x in tokens(row.get('Company Name')) | tokens(root)):
                chosen, note = e, 'personal address, looks like theirs'
                break
            continue
        if not note:
            note = ed + ' is not their domain, probably their web developer'
    out['foundEmail'] = chosen
    out['emailNote'] = note if not chosen else note

    # ---- something real to open with ----
    for name, pat in HOOKS:
        m = re.search(pat, body, re.I)
        if m:
            out['hooks'].append({'kind': name, 'value': m.group(1)})

    out['hookQuality'] = 'specific' if out['hooks'] else 'none'
    return out


def main():
    rows = list(csv.DictReader(open(SRC, encoding='utf-8-sig')))
    print('prospects:', len(rows))
    with cf.ThreadPoolExecutor(max_workers=12) as ex:
        res = list(ex.map(work, rows))
    json.dump(res, open('prospects.enriched.json', 'w', encoding='utf-8'),
              indent=1, ensure_ascii=False)

    live = sum(1 for r in res if r['siteLive'])
    had = sum(1 for r in rows if (r.get('General Email') or '').strip())
    new = sum(1 for r in res if r['foundEmail'] and not (r.get('General Email') or '').strip())
    print('sites live          :', live, 'of', len(rows))
    print('emails already had  :', had)
    print('emails newly found  :', new)
    print('total contactable   :', sum(1 for r in res
                                       if r['foundEmail'] or (r.get('General Email') or '').strip()))
    print('with a real hook    :', sum(1 for r in res if r['hooks']))
    print('on instagram        :', sum(1 for r in res if 'instagram' in r['socials']))
    print('already using video :', sum(1 for r in res if r['usesVideo']))


if __name__ == '__main__':
    main()
