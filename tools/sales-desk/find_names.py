# -*- coding: utf-8 -*-
"""Find a real person to write to at each prospect.

"Hi," is what kills a cold email. A name changes it from a broadcast into
something addressed to someone.

A wrong name is worse than no name, so everything here is graded and only the
confident ones are used. The rest are handed back as a call list, which is what
Earl's own best cold emails did anyway: ring the office, get a name, then write.

  high    the email address and the page agree on the same person
  good    a name sitting next to an owner or director title
  weak    a name on the page with no title to back it up  -> not used
  none    nothing found                                   -> phone call
"""
import json, re, sys, warnings, concurrent.futures as cf
import requests
from collections import Counter
from enrich import UA, get, text_of, domain

warnings.filterwarnings('ignore')
sys.stdout.reconfigure(encoding='utf-8')

PEOPLE_PAGE = re.compile(
    r'href=["\']([^"\']*(?:about|team|our-?people|meet|who-?we-?are|staff|'
    r'management|leadership|contact)[^"\']*)["\']', re.I)

BOSS = (r'(?:Managing\s+Director|Director|Owner|Founder|Co-?Founder|Proprietor|'
        r'Managing\s+Partner|Chief\s+Executive|CEO|MD|General\s+Manager|'
        r'Operations\s+Manager|Contracts\s+Manager|Business\s+Development\s+Manager)')

NAME = r'([A-Z][a-z]{1,14}(?:\s+[A-Z][a-z]{1,14}){1,2})'

PATTERNS = [
    ('good', re.compile(NAME + r'\s*[,\-–|]?\s*' + BOSS, re.I)),          # Dave Smith, Director
    ('good', re.compile(BOSS + r'\s*[:\-–|]?\s*' + NAME)),                # Director: Dave Smith
    ('good', re.compile(r'(?:founded|started|set up|run)\s+by\s+' + NAME, re.I)),
    ('good', re.compile(r'(?:speak|talk|chat)\s+to\s+' + NAME, re.I)),
    ('weak', re.compile(r'\b' + NAME + r'\s+(?:will|can|has|joined|says|leads)\b')),
]

# Words that look like names but are not. A wrong name is worse than none.
NOT_A_NAME = {
    'the', 'our', 'we', 'us', 'your', 'you', 'and', 'for', 'with', 'from', 'all', 'new',
    'home', 'about', 'contact', 'services', 'service', 'team', 'company', 'group', 'ltd',
    'limited', 'london', 'england', 'britain', 'united', 'kingdom', 'gas', 'safe', 'niceic',
    'refcom', 'oftec', 'chas', 'trustmark', 'google', 'facebook', 'instagram', 'linkedin',
    'privacy', 'policy', 'cookie', 'terms', 'read', 'more', 'get', 'call', 'email', 'phone',
    'quote', 'free', 'book', 'now', 'today', 'here', 'click', 'find', 'out', 'why', 'choose',
    'what', 'when', 'where', 'how', 'who', 'our', 'meet', 'view', 'see', 'learn', 'building',
    'management', 'system', 'systems', 'control', 'controls', 'energy', 'heating', 'cooling',
    'electrical', 'mechanical', 'installation', 'maintenance', 'commercial', 'residential',
    'north', 'south', 'east', 'west', 'central', 'greater', 'monday', 'friday', 'january',
    'december', 'covid', 'health', 'safety', 'quality', 'customer', 'client', 'project',
}

GENERIC_LOCAL = {'info', 'sales', 'enquiries', 'enquiry', 'admin', 'hello', 'contact', 'office',
                 'accounts', 'mail', 'team', 'support', 'service', 'bookings', 'general', 'help',
                 'reception', 'post', 'ask', 'estimating', 'quotes'}



# Titles that get swept up in front of a name, and words that end up behind one.
TITLE_PREFIX = re.compile(r'^(?:Mr|Mrs|Ms|Miss|Dr|Technician|Engineer|Manager|Director|Owner|'
                          r'Founder|Our|Meet|Contact|Speak|Senior|Lead|Head|Chief)\s+', re.I)
TRAILING_JUNK = re.compile(r'\s+(?:Office|Ltd|Limited|Services?|Group|Team|Systems?|Solutions?|'
                           r'Engineering|Electrical|Heating|Cooling|Plumbing|Contractors?)$', re.I)

# Kentish Town is not a person. Anything that smells like a place is rejected.
PLACE_WORDS = {'town', 'road', 'street', 'park', 'green', 'hill', 'end', 'bridge', 'common',
               'heath', 'court', 'gate', 'cross', 'wood', 'field', 'vale', 'grove', 'lane',
               'way', 'gardens', 'square', 'north', 'south', 'east', 'west', 'upper', 'lower',
               'kentish', 'camden', 'islington', 'hackney', 'croydon', 'bromley', 'ealing',
               'chelsea', 'fulham', 'putney', 'brixton', 'clapham', 'wembley', 'harrow'}

# A first name has to look like one. Precision beats recall here: a name we are not
# sure of becomes a phone call, which is what Earl's best emails did anyway.
FIRST_NAMES = set("""
adam adrian ahmed aidan alan alex alexander ali alice amanda amar amir amy andrew andy angela
anna anne anthony antonio arjun arthur ashley barry ben benjamin bernard bill bob brad bradley
brian bruce bryan callum cameron carl carlos caroline catherine charles charlie chris christian
christopher claire clare colin connor craig daniel danny darren dave david dean debbie declan
dennis derek des diane dominic don donald donna doug douglas duncan eamon ed eddie edward elaine
eleanor elliot emma eric ewan farhan fiona francis frank fraser gary gavin gemma geoff geoffrey
george gerald gerard gill glen gordon graham grant greg gregory hannah harry hasan hassan heather
helen henry hugh iain ian idris imran ivan jack jacob jake james jamie jane janet jason jay jean
jeff jeffrey jenny jeremy jim jo joanne joe john johnny jon jonathan jordan joseph josh joshua
julian julie justin karen karl kate katherine kathy keith kelly ken kenneth kevin kieran kim
krishna kwame kyle lauren laurence lee leo leon les leslie lewis liam linda lisa louis louise
luke lyn malcolm marc marcus margaret maria mark martin mary mathew matt matthew max mel melvin
michael michelle mick mike mo mohamed mohammed mohammad muhammad naomi nathan neil niall nick
nicholas nicola nigel noel norman oliver olly omar oscar patrick paul paula pete peter phil
philip pierre priya raj rajesh ralph ray raymond rebecca rhys ricardo richard rick rob robert
robin roger ron ronald rory ross roy russell ryan sam samuel sandra sanjay sarah scott sean
sebastian shane sharon shaun shane simon sonia stephen steve steven stewart stuart sue surinder
tariq terence terry theo thomas tim timothy tina toby tom tommy tony trevor tyler vernon victor
vijay vince vincent wayne will william yusuf zac zack
""".split())


def clean_name(n):
    n = TITLE_PREFIX.sub('', n or '').strip()
    n = TRAILING_JUNK.sub('', n).strip()
    return re.sub(r'\s+', ' ', n)


def looks_like_a_person(name, email_first, company):
    """Precision over recall. Unsure means a phone call, not a guess."""
    if not name:
        return False
    parts = name.split()
    if not 1 <= len(parts) <= 3:
        return False
    low = [p.lower() for p in parts]
    if any(p in PLACE_WORDS for p in low):
        return False
    comp = re.sub(r'[^a-z ]', ' ', (company or '').lower()).split()
    if any(p in comp for p in low):          # it is just the company name again
        return False
    return low[0] in FIRST_NAMES or (email_first and low[0] == email_first.lower())


def plausible(name):
    parts = name.split()
    if not 2 <= len(parts) <= 3:
        return False
    for p in parts:
        low = p.lower()
        if low in NOT_A_NAME or len(p) < 2 or not p[0].isupper() or not p.isalpha():
            return False
    return True


def from_email(email):
    """joe@ gives Joe. dave.smith@ gives Dave Smith. info@ gives nothing."""
    local = (email or '').split('@')[0].lower()
    if not local or local in GENERIC_LOCAL:
        return ''
    bits = [b for b in re.split(r'[._\-]', local) if b.isalpha() and 2 < len(b) < 15]
    bits = [b for b in bits if b not in GENERIC_LOCAL and b not in NOT_A_NAME]
    if not bits:
        return ''
    return ' '.join(b.capitalize() for b in bits[:2])


def work(r):
    r = dict(r)
    r.update({'contactName': '', 'contactFirst': '', 'nameSource': '', 'nameGrade': 'none'})

    guess = from_email(r.get('email'))
    site = (r.get('website') or '').strip()
    blob = ''

    if site:
        if not site.startswith('http'):
            site = 'https://' + site
        home = get(site) or get('https://' + domain(site))
        if home:
            pages, picked = [home], []
            for m in PEOPLE_PAGE.finditer(home):
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
            blob = text_of(' '.join(pages))

    found = []
    for grade, pat in PATTERNS:
        for m in pat.finditer(blob):
            cand = next((g for g in m.groups() if g and g[0].isupper()), '')
            cand = clean_name(re.sub(r'\s+', ' ', cand).strip())
            if plausible(cand) and looks_like_a_person(cand, guess.split()[0] if guess else '',
                                                       r.get('name')):
                found.append((grade, cand))

    # the email and the page agreeing is the strongest signal there is
    if guess:
        first = guess.split()[0].lower()
        for grade, cand in found:
            if cand.split()[0].lower() == first:
                r.update({'contactName': cand, 'contactFirst': cand.split()[0],
                          'nameSource': 'email and site agree', 'nameGrade': 'high'})
                return r

    good = [c for g, c in found if g == 'good']
    if good:
        best = Counter(good).most_common(1)[0][0]
        r.update({'contactName': best, 'contactFirst': best.split()[0],
                  'nameSource': 'named next to a director or owner title', 'nameGrade': 'good'})
        return r

    if guess and looks_like_a_person(guess, '', r.get('name')):
        r.update({'contactName': guess, 'contactFirst': guess.split()[0],
                  'nameSource': ('firstname.lastname in the address' if ' ' in guess
                                 else 'first name in the address'),
                  'nameGrade': 'good'})
        return r

    weak = [c for g, c in found if g == 'weak']
    if weak:
        best = Counter(weak).most_common(1)[0][0]
        r.update({'contactName': best, 'nameSource': 'on the page, no title to back it up',
                  'nameGrade': 'weak'})
    return r


def main():
    rows = json.load(open('pool.enriched.json', encoding='utf-8'))
    print('checking', len(rows), 'sites for a person to write to...')
    with cf.ThreadPoolExecutor(max_workers=12) as ex:
        res = list(ex.map(work, rows))
    json.dump(res, open('pool.enriched.json', 'w', encoding='utf-8'), indent=1, ensure_ascii=False)

    g = Counter(r['nameGrade'] for r in res)
    usable = g['high'] + g['good']
    print()
    print('  high  (address and site agree) :', g['high'])
    print('  good  (title or a real address):', g['good'])
    print('  weak  (not used)               :', g['weak'])
    print('  none  (needs a phone call)     :', g['none'])
    print()
    print('  usable names: %d of %d  (%d%%)' % (usable, len(res), round(100 * usable / len(res))))
    print()
    print('  sample:')
    for r in [x for x in res if x['nameGrade'] in ('high', 'good')][:8]:
        print('    %-34s %-18s %s' % ((r.get('name') or '')[:33], r['contactName'], r['nameSource']))


if __name__ == '__main__':
    main()
