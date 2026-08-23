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
        if r['hooks']:
            notes.append('Found on site: ' + ', '.join(r['hooks']))
        notes.append('Already using video' if r['usesVideo'] else 'No video anywhere')
        if r['emailNote']:
            notes.append('Address note: ' + r['emailNote'])
        notes.append('Lead offer: content day, £795 + VAT')

        w.writerow({
            'Company Name': r['company'],
            'Sector': r['sector'],
            'Sub-Sector': '',
            'Location': r['location'],
            'Postcode': r['postcode'],
            'Region': 'London',
            'Website': r['website'],
            'Main Phone': r['phone'],
            'General Email': r['email'],
            'Instagram': ('https://instagram.com/' + r['instagram']) if r['instagram'] else '',
            'Google Review Count': r['reviews'],
            'Google Rating': r['rating'],
            'Key Services': '',
            'Marketing Opportunity': r['observation'] or '',
            'Lead Quality': r['quality'],
            'Estimated One-Off Value': '795',
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
