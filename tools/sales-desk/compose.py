# -*- coding: utf-8 -*-
"""Write the three-touch sequence for each prospect, following VOICE.md.

The opening line is built only from things actually found on their own website or in
their Google listing. If there is nothing specific, the row is held back rather than
padded out with a merge field, because a sentence that could be sent to anyone is the
thing that makes an email read as generated.
"""
import csv, json, os, re, sys
sys.stdout.reconfigure(encoding='utf-8')

SIGNATURE = 'Thanks,\nEarl'          # 191 uses against 30 for "Best regards"
WORK_LINK = 'www.s4digi.com/work'

# Superseded by compose_pool.py. Clients are never named in cold outreach.
PROOF = {}

ACCRED_CASE = {'gas safe': 'Gas Safe', 'niceic': 'NICEIC', 'refcom': 'REFCOM', 'f-gas': 'F-Gas',
               'oftec': 'OFTEC', 'chas': 'CHAS', 'safecontractor': 'SafeContractor',
               'constructionline': 'Constructionline', 'iso 9001': 'ISO 9001',
               'trustmark': 'TrustMark', 'napit': 'NAPIT', 'besa': 'BESA'}

LEAD_INS = [
    'I looked your company up this week.',
    'I had a look through your site this week.',
    'Came across you while I was looking at %s firms.',
    'I was reading through your site earlier.',
]

CLOSERS = [                           # his own, in his order of preference
    'Worth a quick chat?',
    'Fancy a quick 10-minute call?',
    'Worth a quick 10 minutes?',
]

WHO = ("I'm a filmmaker in London, putting together a set of short films about how skilled "
       "trade work actually gets done. Not a marketing thing, more of a documentary. One job, "
       "start to finish.")

# The ask is access, not a sale. No price anywhere, in any touch.
OFFER = ('Would you let me film one of your jobs for a day? No cost to you, and you keep '
         'everything I shoot to use however you want.')


LONDON = set('E EC N NW SE SW W WC BR CR DA EN HA IG KT RM SM TW UB WD'.split())
# roughly a drive there and back in a day with a shoot in the middle
REACHABLE = set('GU RG SL HP AL CM SS ME CT TN BN RH MK LU SG OX PO SO'.split())


def region(postcode):
    m = re.match(r'^([A-Z]{1,2})', (postcode or '').upper().replace(' ', ''))
    a = m.group(1) if m else ''
    if a in LONDON:
        return 'London'
    if a in REACHABLE:
        return 'Day trip'
    return 'Too far'


def num(v):
    try:
        return float(str(v).strip() or 0)
    except Exception:
        return 0.0


def hookmap(r):
    return {h['kind']: h['value'] for h in r.get('hooks', [])}


def credentials(h):
    """The true, specific bits about this one company, most distinctive first."""
    bits = []
    if h.get('family'):
        bits.append(str(h['family']).lower().replace('-', ' ').strip())
    # accreditations are proper nouns and look wrong lowercased
    if h.get('since'):
        bits.append('trading since ' + str(h['since']))
    elif h.get('years'):
        bits.append(str(h['years']) + ' years in')
    if h.get('accred'):
        bits.append(ACCRED_CASE.get(str(h['accred']).lower(), str(h['accred'])))
    if h.get('247'):
        bits.append('24/7')
    if h.get('team'):
        bits.append('a team of ' + str(h['team']))
    if h.get('award'):
        bits.append('award winning')
    return bits


def opener(r):
    """One true sentence about them, then the gap. Varies with what was actually found."""
    h = hookmap(r)
    creds = credentials(h)
    reviews, rating = num(r.get('Google Review Count')), num(r.get('Google Rating'))
    has_ig, has_video = 'instagram' in r.get('socials', {}), r.get('usesVideo')

    # --- the true observation ---
    obs = []
    if creds:
        c = ', '.join(creds[:2])
        obs.append(c[:1].upper() + c[1:])
    if reviews >= 25:
        obs.append('%d Google reviews at %s' % (int(reviews), ('%g' % rating)))
    elif h.get('sector'):
        obs.append('doing work in ' + str(h['sector']).lower())
    if not obs:
        return None
    line = ' and '.join(obs[:2]) + '.'

    # The frame is a documentary, not a pitch, so the second half is interest in their
    # work rather than a note on their marketing. Pointing out what is missing from
    # someone's Instagram is a sales move and it reads like one.
    gap = "That's exactly the sort of work I'm after."
    if h.get('sector'):
        gap = "The %s side is exactly the sort of work I'm after." % str(h['sector']).lower()
    elif has_video:
        gap = "You clearly take how it looks seriously, which is half the battle on a shoot."

    return line + ' ' + gap


def lead_in(r):
    t = LEAD_INS[int(r.get('_i', 0)) % len(LEAD_INS)]
    if '%s' in t:
        sec = (r.get('Sector') or 'local').lower()
        return t % sec
    return t


def first_email(r):
    op = opener(r)
    if not op:
        return None
    name = (r.get('_firstName') or '').strip()
    proof = PROOF.get(r.get('Sector'), '')

    body = [
        ('Hi %s,' % name) if name else 'Hi,',
        '',
        lead_in(r) + ' ' + op,
        '',
        WHO,
        '',
        OFFER,
        '',
    ]
    if proof:
        body += [proof, '']
    body += [
        'Happy to work around whatever is already in the diary.',
        '',
        SIGNATURE,
    ]
    return {'subject': subject_for(r), 'body': '\n'.join(body)}


def subject_for(r):
    h = hookmap(r)
    town = (r.get('Location') or '').strip()
    if h.get('sector'):
        return 'Video for the %s work' % str(h['sector']).lower()
    if town:
        return 'Content for a %s company' % town
    return 'Video and photo content'


def second_email(r):
    """Touch two. A different angle, never a repeat of touch one."""
    name = (r.get('_firstName') or '').strip()
    has_ig = 'instagram' in r.get('socials', {})
    angle = ('Most firms tell me they have nothing worth filming. Then I spend a day on site and '
             'we come away with something they end up using for months.')
    if has_ig:
        angle = ('A day on site usually turns into more than people expect, and you would have '
                 'plenty to post off the back of it.')
    return {
        'subject': 'Re: ' + subject_for(r),
        'body': '\n'.join([
            ('Hi %s,' % name) if name else 'Hi,',
            '',
            'Following up on my last email.',
            '',
            angle,
            '',
            'Still happy to film one of yours. No cost, and nothing to sign.',
            '',
            'Worth a quick 10 minutes?',
            '',
            SIGNATURE,
        ]),
    }


def third_email(r):
    """Touch three. The easy exit. Saying no is easier than saying yes."""
    name = (r.get('_firstName') or '').strip()
    return {
        'subject': 'Re: ' + subject_for(r),
        'body': '\n'.join([
            ('Hi %s,' % name) if name else 'Hi,',
            '',
            'I have not heard back, which is fair enough, you are busy.',
            '',
            'Should I close the file on this one, or is it worth asking again later in the year?',
            '',
            'Either answer is genuinely fine, I would just rather know than keep emailing you.',
            '',
            SIGNATURE,
        ]),
    }


def main():
    rows = json.load(open('prospects.enriched.json', encoding='utf-8'))

    # Anyone already approached for the EV film series is off this list. They have had
    # one free-film email from Earl already; a second, differently worded one would land
    # as a mailshot rather than a person asking.
    already = set()
    try:
        import csv as _csv
        ev = os.path.join('..', '..', '..', 'LONDON EV SERIES', 'london-ev-outreach.csv')
        for e in _csv.DictReader(open(ev, encoding='utf-8-sig')):
            if e.get('email'):
                already.add(e['email'].strip().lower())
            already.add(re.sub(r'[^a-z0-9]', '', (e.get('name') or '').lower()))
    except FileNotFoundError:
        pass

    out, held = [], []
    seen_inbox = {}

    for i, r in enumerate(rows):
        r['_i'] = i
        email = (r.get('foundEmail') or r.get('General Email') or '').strip().lower()
        first = first_email(r)

        if not email:
            held.append((r, r.get('emailNote') or 'no email found'))
            continue
        if not first:
            held.append((r, 'nothing specific to open with'))
            continue
        if (email in already
                or re.sub(r'[^a-z0-9]', '', (r.get('Company Name') or '').lower()) in already):
            held.append((r, 'already approached for the EV series'))
            continue
        if region(r.get('Postcode')) != 'London':
            held.append((r, 'not London'))
            continue
        if email in seen_inbox:
            held.append((r, 'same inbox as %s' % seen_inbox[email]))
            continue
        seen_inbox[email] = r.get('Company Name')

        out.append({
            'rank': len(out) + 1,
            'company': r.get('Company Name'),
            'sector': r.get('Sector'),
            'location': r.get('Location'),
            'region': region(r.get('Postcode')),
            'postcode': r.get('Postcode'),
            'quality': r.get('Lead Quality'),
            'website': r.get('Website'),
            'email': email,
            'emailNote': r.get('emailNote', ''),
            'phone': r.get('Main Phone', ''),
            'instagram': r.get('socials', {}).get('instagram', ''),
            'usesVideo': bool(r.get('usesVideo')),
            'reviews': r.get('Google Review Count', ''),
            'rating': r.get('Google Rating', ''),
            'hooks': [h['kind'] + '=' + str(h['value']) for h in r.get('hooks', [])],
            'observation': opener(r),
            'touch1': first,
            'touch2': second_email(r),
            'touch3': third_email(r),
        })

    # best leads first: A/B/C, then review weight
    # in-person work means geography beats lead score: a grade A in Glasgow is not a prospect
    order = {'A': 0, 'B': 1, 'C': 2}
    out.sort(key=lambda x: (order.get(x['quality'], 3), -num(x['reviews'])))
    for i, x in enumerate(out):
        x['rank'] = i + 1

    json.dump(out, open('sequence.json', 'w', encoding='utf-8'), indent=1, ensure_ascii=False)

    cols = ['rank', 'company', 'sector', 'region', 'location', 'postcode', 'quality', 'email', 'phone',
            'website', 'instagram', 'usesVideo', 'reviews', 'rating', 'observation',
            'subject', 'touch1', 'touch2', 'touch3', 'emailNote']
    with open('sales-sequence.csv', 'w', newline='', encoding='utf-8-sig') as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        for x in out:
            w.writerow({**{k: x.get(k, '') for k in cols},
                        'subject': x['touch1']['subject'],
                        'touch1': x['touch1']['body'],
                        'touch2': x['touch2']['body'],
                        'touch3': x['touch3']['body'],
                        'usesVideo': 'yes' if x['usesVideo'] else 'no'})

    from collections import Counter
    print('ready to send :', len(out))
    print('  by region   :', Counter(x['region'] for x in out).most_common())
    print('  by quality  :', Counter(x['quality'] for x in out).most_common())
    print('  by sector   :', Counter(x['sector'] for x in out).most_common())
    print('held back     :', len(held))
    print('  reasons     :', Counter(reason for _, reason in held).most_common(6))


if __name__ == '__main__':
    main()
