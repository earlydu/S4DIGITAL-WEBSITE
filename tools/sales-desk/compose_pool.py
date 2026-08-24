# -*- coding: utf-8 -*-
"""Write the three-touch sequence for the combined London pool.

Free day of filming, documentary framing, no price in any touch.

The one line that separates this from every other email these people get is the
proof line: a real client named in their own sector. It only appears where there
genuinely is one. Where there is not, the email says less rather than reaching
for something vague, because a vague claim is exactly what a chancer sounds like.
"""
import csv, json, re, sys
from collections import Counter
sys.stdout.reconfigure(encoding='utf-8')

SIGNATURE = 'Thanks,\nEarl'

WHO = ("I'm a filmmaker in London, putting together a set of short films about how skilled "
       "trade work actually gets done. Not a marketing thing, more of a documentary. "
       "One job, start to finish.")

OFFER = ('Would you let me film one of your jobs for a day? No cost to you, and you keep '
         'everything I shoot to use however you want.')

# Sector fluency, not name-dropping. Earl does not want clients named in cold
# outreach, and the credibility here comes from knowing how the day actually
# runs rather than from whose logo he can list. Every line below is true of him.
PROOF = {
    'Building controls': "I've filmed on the controls side before, so I know my way around a "
                         "plant room and a panel, and I know to stay out of the way.",
    'EV charging': "I've filmed installs before, so I know how the day runs and I won't slow "
                   "anyone down.",
    'Drainage and plumbing': "I've filmed drainage work before, so I know how a job like that "
                             "runs and what not to stand on.",
    'Commercial heating': "I've filmed plant room work before, so I know how a job like that "
                          "runs and I'll keep out of the way.",
    'HVAC': "I've filmed plant and rooftop work before, so I know how the day runs and I'll "
            "keep out of the way.",
    'Roofing': "I've filmed at height before and I'm used to working around a site's rules.",
    'Electrical': "I've filmed electrical work before, so I know how the day runs and I'll keep "
                  "out of the way.",
}

SECTOR_FIX = {
    'ev charging': 'EV charging', 'commercial heating': 'Commercial heating',
    'hvac': 'HVAC', 'building controls': 'Building controls',
    'roofing service': 'Roofing', 'electrician': 'Electrical',
    'construction company': 'Construction', 'plumber': 'Drainage and plumbing',
    'landscape gardener': 'Landscaping', 'landscape designer': 'Landscaping',
    'electrical installation service': 'Electrical', 'home builder': 'Construction',
    'general contractor': 'Construction', 'roofing contractor': 'Roofing',
    'plumbing supply store': 'Drainage and plumbing', 'hvac contractor': 'HVAC',
    'air conditioning contractor': 'HVAC', 'heating contractor': 'Commercial heating',
}

SPOKEN = {'EV charging': 'EV charger installers', 'Building controls': 'building controls firms',
          'Commercial heating': 'commercial heating firms', 'HVAC': 'air conditioning firms',
          'Roofing': 'roofing firms', 'Electrical': 'electrical contractors',
          'Drainage and plumbing': 'drainage firms', 'Construction': 'contractors',
          'Landscaping': 'landscaping firms'}

LEAD_INS = [
    'Came across you while I was looking at %s in London.',
    'I looked your company up this week.',
    'I had a look through your site earlier.',
]

ACCRED = {'gas safe': 'Gas Safe', 'niceic': 'NICEIC', 'refcom': 'REFCOM', 'f-gas': 'F-Gas',
          'oftec': 'OFTEC', 'chas': 'CHAS', 'safecontractor': 'SafeContractor', 'besa': 'BESA',
          'constructionline': 'Constructionline', 'iso 9001': 'ISO 9001', 'napit': 'NAPIT',
          'trustmark': 'TrustMark'}


LONDON_PC = set('E EC N NW SE SW W WC BR CR DA EN HA IG KT RM SM TW UB WD'.split())
FRINGE_PC = set('GU RG SL HP AL CM SS ME CT TN RH MK LU SG OX'.split())
# Greater London by name, for rows the directories left without a postcode
LONDON_TOWNS = {
    'london', 'city of london', 'croydon', 'carshalton', 'sutton', 'bromley', 'barnet',
    'enfield', 'harrow', 'hounslow', 'ealing', 'ilford', 'romford', 'richmond', 'kingston',
    'twickenham', 'wembley', 'uxbridge', 'greenwich', 'woolwich', 'wimbledon', 'orpington',
    'dagenham', 'barking', 'edgware', 'mitcham', 'wallington', 'purley', 'hayes', 'southall',
    'chessington', 'surbiton', 'feltham', 'hampton', 'ruislip', 'northolt', 'sidcup', 'bexley',
}


def region_of(r):
    """In-person work, so this decides more than lead quality does."""
    import re as _re
    m = _re.match(r'^([A-Z]{1,2})', (r.get('postcode') or '').upper().replace(' ', ''))
    a = m.group(1) if m else ''
    town = (r.get('city') or r.get('location') or '').strip().lower()
    if a in LONDON_PC or town in LONDON_TOWNS:
        return 'London'
    if a in FRINGE_PC:
        return 'Fringe'
    return 'London' if (not a and 'london' in town) else 'Out'


SUBJECTS = {
    'EV charging': 'Filming an EV install',
    'Building controls': 'Filming a controls job',
    'Commercial heating': 'Filming a heating job',
    'HVAC': 'Filming an HVAC job',
    'Roofing': 'Filming a roofing job',
    'Electrical': 'Filming an electrical job',
    'Drainage and plumbing': 'Filming a drainage job',
    'Construction': 'Filming a site',
    'Home builder': 'Filming a build',
    'Landscaping': 'Filming a landscaping job',
}


def subject_for(sec):
    if sec in SUBJECTS:
        return SUBJECTS[sec]
    if not sec:
        return 'Filming one of your jobs'
    art = 'an' if sec[:1].lower() in 'aeiou' else 'a'
    return 'Filming %s %s job' % (art, sec.lower())


def num(v):
    try:
        return float(str(v).strip() or 0)
    except Exception:
        return 0.0


def sector_of(r):
    return SECTOR_FIX.get((r.get('sector') or '').strip().lower(), (r.get('sector') or '').strip())


def credentials(h):
    bits = []
    if h.get('family'):
        bits.append(str(h['family']).lower().replace('-', ' ').strip())
    if h.get('since'):
        bits.append('trading since ' + str(h['since']))
    elif h.get('years'):
        bits.append(str(h['years']) + ' years in')
    if h.get('accred'):
        bits.append(ACCRED.get(str(h['accred']).lower(), str(h['accred'])))
    if h.get('247'):
        bits.append('24/7')
    if h.get('team'):
        bits.append('a team of ' + str(h['team']))
    return bits


def opener(r):
    """One true sentence about them, then why their work interests him."""
    h = {x['kind']: x['value'] for x in r.get('hooks', [])}
    creds, obs = credentials(h), []
    if creds:
        c = ', '.join(creds[:2])
        obs.append(c[:1].upper() + c[1:])
    reviews, rating = num(r.get('reviews')), num(r.get('rating'))
    if reviews >= 25:
        obs.append('%d Google reviews at %s' % (int(reviews), '%g' % rating))
    if not obs:
        return None

    if h.get('sector'):
        tail = "The %s side is exactly the sort of work I'm after." % str(h['sector']).lower()
    elif r.get('usesVideo'):
        tail = "You clearly take how it looks seriously, which is half the battle on a shoot."
    else:
        tail = "That's exactly the sort of work I'm after."
    return ' and '.join(obs[:2]) + '. ' + tail


def emails(r, i):
    op = opener(r)
    if not op:
        return None
    sec = sector_of(r)
    lead = LEAD_INS[i % len(LEAD_INS)]
    lead = lead % SPOKEN.get(sec, (sec or 'local').lower() + ' firms') if '%s' in lead else lead
    proof = PROOF.get(sec, '')

    first = ['Hi,', '', lead + ' ' + op, '', WHO, '']
    if proof:
        first += [proof, '']
    first += [OFFER, '', 'Happy to work around whatever is already in the diary.', '', SIGNATURE]

    subject = subject_for(sec)

    second = ['Hi,', '', 'Following up on my last email.', '',
              'Most firms tell me they have nothing worth filming. Then I spend a day on site '
              'and we come away with something they end up using for months.', '',
              'Still happy to film one of yours. No cost, and nothing to sign.', '',
              'Worth a quick 10 minutes?', '', SIGNATURE]

    third = ['Hi,', '', 'I have not heard back, which is fair enough, you are busy.', '',
             'Should I close the file on this one, or is it worth asking again later in the year?',
             '', 'Either answer is genuinely fine, I would just rather know than keep emailing you.',
             '', SIGNATURE]

    return ({'subject': subject, 'body': '\n'.join(first)},
            {'subject': 'Re: ' + subject, 'body': '\n'.join(second)},
            {'subject': 'Re: ' + subject, 'body': '\n'.join(third)})


def main():
    rows = json.load(open('pool.enriched.json', encoding='utf-8'))
    out, held, seen = [], Counter(), {}

    for i, r in enumerate(rows):
        email = (r.get('email') or '').strip().lower()
        if not email:
            held[r.get('emailNote') or 'no email found'] += 1
            continue
        if email in seen:
            held['same inbox as ' + seen[email][:20]] += 1
            continue
        reg = region_of(r)
        if reg == 'Out':
            held['too far from London'] += 1
            continue
        built = emails(r, i)
        if not built:
            held['nothing specific to open with'] += 1
            continue
        seen[email] = r.get('name')
        t1, t2, t3 = built
        out.append({
            'company': r.get('name'), 'sector': sector_of(r), 'source': r.get('source'),
            'region': reg,
            'location': r.get('city') or '', 'postcode': r.get('postcode') or '',
            'website': r.get('website') or '', 'email': email,
            'phone': (r.get('phone') or '').strip(), 'linkedin': r.get('linkedin') or '',
            'instagram': (r.get('socials') or {}).get('instagram', ''),
            'reviews': r.get('reviews') or '', 'rating': r.get('rating') or '',
            'usesVideo': bool(r.get('usesVideo')), 'emailNote': r.get('emailNote') or '',
            'hasProof': bool(PROOF.get(sector_of(r))),
            'quality': ('A' if PROOF.get(sector_of(r)) and num(r.get('reviews')) >= 50
                        else 'B' if PROOF.get(sector_of(r)) or num(r.get('reviews')) >= 25
                        else 'C'),
            'observation': opener(r),
            'touch1': t1, 'touch2': t2, 'touch3': t3,
        })

    # Sectors he can prove himself in go first. Then the biggest, most established.
    out.sort(key=lambda x: (x['region'] != 'London', not x['hasProof'], -num(x['reviews'])))
    for i, x in enumerate(out):
        x['rank'] = i + 1

    json.dump(out, open('sequence.json', 'w', encoding='utf-8'), indent=1, ensure_ascii=False)

    cols = ['rank', 'company', 'sector', 'region', 'quality', 'location', 'postcode', 'email', 'phone', 'website',
            'instagram', 'reviews', 'rating', 'hasProof', 'observation', 'subject',
            'touch1', 'touch2', 'touch3', 'emailNote', 'source']
    with open('sales-sequence.csv', 'w', newline='', encoding='utf-8-sig') as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        for x in out:
            w.writerow({**{k: x.get(k, '') for k in cols},
                        'subject': x['touch1']['subject'],
                        'touch1': x['touch1']['body'], 'touch2': x['touch2']['body'],
                        'touch3': x['touch3']['body'],
                        'hasProof': 'yes' if x['hasProof'] else ''})

    print('ready to send  :', len(out))
    print('  by region    :', Counter(x['region'] for x in out).most_common())
    print('  by sector    :', Counter(x['sector'] for x in out).most_common(10))
    print('  with proof   :', sum(1 for x in out if x['hasProof']))
    print('held back      :', sum(held.values()))
    print('  reasons      :', held.most_common(5))


if __name__ == '__main__':
    main()
