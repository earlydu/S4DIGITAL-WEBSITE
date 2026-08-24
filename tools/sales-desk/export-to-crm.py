# -*- coding: utf-8 -*-
"""Write the London list in the shape the CRM importer already understands.

The upgrade is the Marketing Opportunity column. It used to hold the same sentence for
every row with the review count swapped. It now holds the real observation pulled off
that company's own site, which is the line the email opens with.

Nothing here touches the live database. It writes a file; you run the import.
"""
import csv, json, sys
sys.stdout.reconfigure(encoding='utf-8')

rows = json.load(open('sequence.json', encoding='utf-8'))

# exactly the labels lib/crm/importer.mjs auto-maps
COLS = ['Company Name', 'Sector', 'Sub-Sector', 'Location', 'Postcode', 'Region',
        'Website', 'Main Phone', 'General Email', 'Instagram',
        'Google Review Count', 'Google Rating', 'Key Services',
        'Marketing Opportunity', 'Lead Quality', 'Estimated One-Off Value',
        'Ask For (job title)', 'Notes']

with open('crm-import-london.csv', 'w', newline='', encoding='utf-8-sig') as f:
    w = csv.DictWriter(f, fieldnames=COLS)
    w.writeheader()
    for r in rows:
        notes = []
        notes.append('Sector: ' + (r.get('sector') or 'unknown')
                     + (' (client to name: yes)' if r.get('hasProof') else ''))
        notes.append('Already using video' if r.get('usesVideo') else 'No video anywhere')
        if r.get('emailNote'):
            notes.append('Address note: ' + r['emailNote'])
        notes.append('Source: ' + (r.get('source') or ''))
        notes.append('Offer: free day of filming, documentary framing')

        w.writerow({
            'Company Name': r.get('company'),
            'Sector': r.get('sector'),
            'Sub-Sector': '',
            'Location': r.get('location'),
            'Postcode': r.get('postcode'),
            'Region': r.get('region', 'London'),
            'Website': r.get('website'),
            'Main Phone': r.get('phone'),
            'General Email': r.get('email'),
            'Instagram': ('https://instagram.com/' + r['instagram']) if r.get('instagram') else '',
            'Google Review Count': r.get('reviews', ''),
            'Google Rating': r.get('rating', ''),
            'Key Services': '',
            'Marketing Opportunity': r.get('observation') or '',
            'Lead Quality': r.get('quality', 'C'),
            'Estimated One-Off Value': '',
            'Ask For (job title)': 'Owner or whoever handles marketing',
            'Notes': '. '.join(notes),
        })

print('crm-import-london.csv written:', len(rows), 'companies')
print()
print('To load them in, from S4DIGI WEB BUILD:')
print('  node tools/crm.mjs import tools/sales-desk/crm-import-london.csv')
print()
print('It needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment,')
print('and it writes to the live database, so run it when you are ready rather than now.')
