# -*- coding: utf-8 -*-
"""Visit every prospect in pool.json and fill in what is missing.

Same job as enrich.py did for the first list, and the same hygiene: placeholder
addresses, web developers' addresses and duplicate inboxes all get caught rather
than sent to. Also takes a real hook off each site, because the opening line has
to be about that one company or the whole approach falls over.
"""
import json, re, sys, warnings, concurrent.futures as cf
import requests
from enrich import (UA, SUBPAGE, SOCIAL, HOOKS, VIDEO, EMAIL, PLACEHOLDER, CONSUMER,
                    get, text_of, domain, tokens)

warnings.filterwarnings('ignore')
sys.stdout.reconfigure(encoding='utf-8')


def work(r):
    r = dict(r)
    r.setdefault('socials', {})
    r.update({'hooks': [], 'usesVideo': False, 'siteLive': False,
              'emailNote': r.get('emailNote', ''), 'title': ''})

    site = (r.get('website') or '').strip()
    if not site:
        r['emailNote'] = r['emailNote'] or 'no website'
        return r
    if not site.startswith('http'):
        site = 'https://' + site
    root = domain(site)

    home = get(site) or get('https://' + root) or get('http://' + root)
    if not home:
        r['emailNote'] = 'site did not load'
        return r
    r['siteLive'] = True

    t = re.search(r'<title[^>]*>(.*?)</title>', home, re.I | re.S)
    if t:
        r['title'] = re.sub(r'\s+', ' ', t.group(1)).strip()[:140]

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

    for k, pat in SOCIAL.items():
        m = re.search(pat, blob, re.I)
        if m and m.group(1).lower() not in ('sharer', 'share', 'tr', 'plugins', 'pages', 'profile.php'):
            r['socials'][k] = m.group(1)
    r['usesVideo'] = bool(VIDEO.search(blob))

    for name, pat in HOOKS:
        m = re.search(pat, body, re.I)
        if m:
            r['hooks'].append({'kind': name, 'value': m.group(1)})

    # only go looking for an address if the source did not already give us one
    if not (r.get('email') or '').strip():
        found = []
        for e in EMAIL.findall(blob):
            e = e.strip().strip('.,;:').lower()
            if re.search(r'\.(png|jpe?g|gif|webp|svg)$', e) or e in found:
                continue
            found.append(e)
        for e in found:
            ed = e.split('@')[-1]
            if ed in PLACEHOLDER:
                r['emailNote'] = 'site has a placeholder address'
                continue
            if ed == root or ed.endswith('.' + root) or root.endswith('.' + ed):
                r['email'] = e
                break
            if ed in CONSUMER:
                local = re.sub(r'[^a-z0-9]', '', e.split('@')[0])
                if any(len(x) >= 4 and x in local for x in tokens(r.get('name')) | tokens(root)):
                    r['email'], r['emailNote'] = e, 'personal address, looks like theirs'
                    break
                continue
            if not r['emailNote']:
                r['emailNote'] = ed + ' is not their domain, probably their web developer'
    return r


def main():
    rows = json.load(open('pool.json', encoding='utf-8'))
    print('visiting', sum(1 for r in rows if r.get('website')), 'sites...')
    with cf.ThreadPoolExecutor(max_workers=12) as ex:
        res = list(ex.map(work, rows))
    json.dump(res, open('pool.enriched.json', 'w', encoding='utf-8'), indent=1, ensure_ascii=False)

    from collections import Counter
    print('live sites      :', sum(1 for r in res if r['siteLive']))
    print('contactable     :', sum(1 for r in res if (r.get('email') or '').strip()))
    print('with a real hook:', sum(1 for r in res if r['hooks']))
    print('on instagram    :', sum(1 for r in res if 'instagram' in r.get('socials', {})))
    print('by sector       :', Counter(r['sector'] for r in res
                                       if (r.get('email') or '').strip() and r['hooks']).most_common(8))


if __name__ == '__main__':
    main()
