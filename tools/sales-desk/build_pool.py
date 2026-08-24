# -*- coding: utf-8 -*-
"""Pull every London prospect worth approaching into one pool.

Sectors are chosen on three tests, in this order:

  1. Can the work be filmed?  The offer is a day on site, so the work has to
     happen somewhere and look like something. That rules out solicitors,
     recruiters and opticians however well they pay.
  2. Do they have money?  Commercial and B2B, not domestic call-outs.
  3. Has he done it before?  Sectors he has already shot in rank first, because
     knowing how the day runs is what separates him from everyone else emailing
     these people. Clients are never named in the email itself.

Sources are the directories already built in this workspace. Nothing new is
scraped here; enrich.py does that afterwards for whatever has no address.
"""
import csv, json, os, re, sys
from collections import Counter
sys.stdout.reconfigure(encoding='utf-8')

BASE = os.path.join('..', '..', '..')

LONDON = set('E EC N NW SE SW W WC BR CR DA EN HA IG KT RM SM TW UB WD'.split())

# Sectors Earl has actually shot in. Used only to rank, never to name anyone:
# clients are not mentioned in cold outreach. compose_pool.py turns these into a
# line about knowing how the day runs.
WORKED_IN = {'EV charging', 'Building controls', 'Drainage and plumbing',
             'Commercial heating', 'HVAC', 'Roofing', 'Electrical'}

def area(pc):
    m = re.match(r'^([A-Z]{1,2})', (pc or '').upper().replace(' ', ''))
    return m.group(1) if m else ''

def is_london(row):
    if area(row.get('postcode')) in LONDON:
        return True
    blob = ' '.join(str(row.get(k) or '') for k in ('location', 'city', 'region', 'address')).lower()
    return 'london' in blob

def norm(n):
    n = re.sub(r'\b(ltd|limited|llp|plc|uk|the|group|services|solutions|systems)\b', '', (n or '').lower())
    return re.sub(r'[^a-z0-9]', '', n)

def dom(u):
    m = re.search(r'https?://(?:www\.)?([^/]+)', (u or '').lower())
    return m.group(1).split(':')[0] if m else ''

def read(path, **kw):
    p = os.path.join(BASE, path)
    if not os.path.exists(p):
        print('  missing:', path)
        return []
    if p.endswith('.json'):
        return json.load(open(p, encoding='utf-8'))
    return list(csv.DictReader(open(p, encoding='utf-8-sig'), **kw))


pool = []

# ---- building controls: commercial budgets and work that films well ---------
for r in read('EV WEB DIRECTORY/BMS Contact Database - [Cleaned] UK BMS Contractors.csv'):
    if r.get('Target Type') not in ('BMS Contractor', 'Specifier'):
        continue
    row = {'name': r.get('Company Name'), 'website': r.get('Website'),
           'email': (r.get('Email') or '').strip(), 'phone': (r.get(' Phone ') or '').strip(),
           'city': r.get('City'), 'region': r.get('Region'), 'postcode': '',
           'reviews': r.get('Google Review Count'), 'rating': r.get('Google Rating'),
           'linkedin': r.get('LinkedIn URL'),
           'sector': 'Building controls', 'source': 'BMS contact database'}
    if is_london(row):
        pool.append(row)

# ---- EV charge point installers -------------------------------------------
for r in read('EV WEB DIRECTORY/data/enriched/installers.enriched.json'):
    hq = r.get('headquarters') or {}
    row = {'name': r.get('name'), 'website': r.get('website'), 'email': '',
           'phone': r.get('phone') or '', 'city': hq.get('cityId'), 'region': '',
           'postcode': hq.get('postcodeArea') or '',
           'reviews': r.get('reviewCount'), 'rating': r.get('rating'), 'linkedin': '',
           'sector': 'EV charging', 'source': 'EV directory'}
    if is_london(row):
        pool.append(row)

# ---- heating, HVAC and the rest of the original directory pull -------------
for r in read('S4DIGI WEB BUILD/prospects-from-directories-uk.csv'):
    row = {'name': r.get('Company Name'), 'website': r.get('Website'),
           'email': (r.get('General Email') or '').strip(), 'phone': r.get('Main Phone'),
           'city': r.get('Location'), 'region': r.get('Region'),
           'postcode': r.get('Postcode'),
           'reviews': r.get('Google Review Count'), 'rating': r.get('Google Rating'),
           'linkedin': r.get('LinkedIn Company'),
           'sector': r.get('Sector') or 'Commercial heating', 'source': 'directory pull'}
    if is_london(row):
        pool.append(row)

# ---- local London businesses, but only the trades you can point a camera at -
FILMABLE = re.compile(r'roof|electric|construction|plumb|scaffold|glaz|landscap|'
                      r'fabricat|joiner|builder|drain|hvac|refrig|solar|fire|security', re.I)
for r in read('S4 LOCAL OUTREACH/output/s4-london-500.csv'):
    ind = r.get('Industry') or ''
    if not FILMABLE.search(ind):
        continue
    pool.append({'name': r.get('Business name'), 'website': r.get('Website'),
                 'email': (r.get('Email') or '').strip(), 'phone': r.get('Phone'),
                 'city': r.get('Location'), 'region': '', 'postcode': '',
                 'reviews': '', 'rating': '', 'linkedin': r.get('LinkedIn'),
                 'sector': ind, 'source': 'local outreach'})

NAME_SECTOR = [
    (r'\b(bms|building management|controls?|automation|scada|bacnet)\b', 'Building controls'),
    (r'\b(ev|charge ?point|charging)\b', 'EV charging'),
    (r'\b(boiler|heating|plumb|gas)\b', 'Commercial heating'),
    (r'\b(air ?con|aircon|cooling|refrigerat|hvac|climate|chiller|ventilat)\b', 'HVAC'),
    (r'\b(roof)\b', 'Roofing'),
    (r'\b(drain|sewer)\b', 'Drainage and plumbing'),
    (r'\b(electric|sparks)\b', 'Electrical'),
]

def sector_from_name(name, fallback):
    """A company's own name is better evidence than the list it was scraped from."""
    n = (name or '').lower()
    for pat, sec in NAME_SECTOR:
        if re.search(pat, n):
            return sec
    return fallback

for r in pool:
    r['sector'] = sector_from_name(r.get('name'), r.get('sector'))

print('gathered:', len(pool))
print(' ', Counter(r['source'] for r in pool).most_common())

# ---- anyone already approached comes straight out -------------------------
seen_before = set()
try:
    for e in csv.DictReader(open(os.path.join(BASE, 'LONDON EV SERIES', 'london-ev-outreach.csv'),
                                 encoding='utf-8-sig')):
        if e.get('email'):
            seen_before.add(e['email'].strip().lower())
        seen_before.add(norm(e.get('name')))
except FileNotFoundError:
    pass
# Deliberately NOT sequence.json. That is this script's own output, so reading it
# back would delete the whole list on every rebuild. Only people who have actually
# been written to belong here, which for now is the EV film series list.

# ---- dedupe and drop the obvious nationals --------------------------------
SKIP = re.compile(r'\b(british gas|npower|e\.?on|edf|octopus|centrica|siemens|honeywell|'
                  r'schneider|johnson controls|trend control|bp pulse|pod ?point|instavolt|'
                  r'mitsubishi|daikin|carrier|tesla)\b', re.I)

out, by_key, dropped = [], {}, Counter()
for r in pool:
    if not r.get('name'):
        dropped['no name'] += 1; continue
    if SKIP.search(r['name']):
        dropped['national or manufacturer'] += 1; continue
    key = dom(r.get('website')) or 'n:' + norm(r['name'])
    if key in ('n:', ''):
        dropped['unidentifiable'] += 1; continue
    if norm(r['name']) in seen_before or (r.get('email') or '').lower() in seen_before:
        dropped['already approached'] += 1; continue
    if key in by_key:
        cur = by_key[key]
        for f, v in r.items():
            if v and not cur.get(f):
                cur[f] = v
        dropped['duplicate'] += 1
        continue
    r['workedIn'] = r['sector'] in WORKED_IN
    by_key[key] = r
    out.append(r)

print()
print('after dedupe and exclusions:', len(out))
print(' dropped:', dropped.most_common())
print(' by sector:', Counter(r['sector'] for r in out).most_common(10))
print(' with an email already:', sum(1 for r in out if r['email']))
print(' with a website:', sum(1 for r in out if r['website']))
json.dump(out, open('pool.json', 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
print()
print('written to pool.json - run enrich_pool.py next to fill in the gaps')
