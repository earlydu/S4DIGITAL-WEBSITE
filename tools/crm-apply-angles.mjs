#!/usr/bin/env node
// Writes researched "why call them" lines onto existing prospects.
//
//   node --env-file=.env.production.local tools/crm-apply-angles.mjs angles.json
//
// The JSON is keyed by company name, each entry holding:
//   angle      the line that shows on the call card
//   evidence   what makes them look established, if found
//   segment    commercial | residential | both, if it became clear
//
// Matching is on the normalised company name, the same way the importer
// de-duplicates, so "E&S" finds "E&S" and not "E&S Mechanical Ltd" by accident.
// Anything that does not match exactly is reported rather than guessed at.

import { readFileSync } from 'node:fs';
import { argv, exit } from 'node:process';
import { select, update, nowISO } from '../lib/crm/db.mjs';
import { normName, searchBlob } from '../lib/crm/importer.mjs';

const file = argv[2];
if (!file) {
  console.error('\n  Which file? node tools/crm-apply-angles.mjs angles.json\n');
  exit(1);
}

const angles = JSON.parse(readFileSync(file, 'utf8'));

const companies = await select('companies', { limit: 5000 });
const byName = new Map();
for (const c of companies) byName.set(normName(c.name), c);

let updated = 0;
const missed = [];

for (const [name, data] of Object.entries(angles)) {
  const hit = byName.get(normName(name));
  if (!hit) { missed.push(name); continue; }

  const patch = {
    marketing_opportunity: data.angle,
    date_verified: nowISO().slice(0, 10),
  };
  if (data.evidence) patch.established_evidence = data.evidence;
  if (data.segment) patch.segment = data.segment;

  // Keep search working against the new wording.
  patch.search_blob = searchBlob({ ...hit, ...patch }, null);

  await update('companies', hit.id, patch);
  updated += 1;
  console.log(`  ${hit.name}`);
}

console.log(`\n  ${updated} prospects given a researched angle`);
if (missed.length) {
  console.log(`  ${missed.length} not matched, left alone: ${missed.join(', ')}`);
}
console.log();
