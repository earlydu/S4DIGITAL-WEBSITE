#!/usr/bin/env node
// Build a callable prospect list from the research already sitting in the other
// projects. Reads local files only: nothing is scraped, nothing is fetched.
//
//   node tools/crm-from-directories.mjs              write a CSV to review
//   node tools/crm-from-directories.mjs --import      write it, then import it
//   node tools/crm-from-directories.mjs --all-uk      keep the whole country
//
// Sources, in descending order of trust:
//   BMS WEB DIRECTORY/data/live/installers.json     cleaned, BCIA accredited
//   BMS WEB DIRECTORY/data/raw/bms-contact-db.json  compiled BMS contractor list
//   BMS WEB DIRECTORY/data/raw/outscraper-2.json    raw, needs category filtering
//   EV  WEB DIRECTORY/data/enriched/…enriched.json  cleaned EV installers
//   EV  WEB DIRECTORY/data/raw/batch-01.json        raw, mostly charge POINTS
//
// The last one matters. A Google search for "EV charger installer" returns
// mostly the chargers themselves: InstaVolt, bp pulse, Tesla Superchargers,
// supermarket car parks. Those are hardware in a car park, not a business that
// buys marketing, so they are thrown out rather than dialled.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { argv, exit } from 'node:process';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PROJECTS = resolve(ROOT, '..');

const say = (...a) => console.log(...a);
const flag = f => argv.includes(f);

/* ------------------------------------------------------------------ loading */

const load = rel => {
  const p = join(PROJECTS, rel);
  if (!existsSync(p)) { say(`  (missing, skipped) ${rel}`); return []; }
  try {
    const d = JSON.parse(readFileSync(p, 'utf8'));
    return Array.isArray(d) ? d : (d.items || d.installers || []);
  } catch (err) {
    say(`  (unreadable, skipped) ${rel}: ${err.message}`);
    return [];
  }
};

/* ------------------------------------------------------------------ filters */

/**
 * Charge point operators and retail car parks. Google files these under
 * "Electric vehicle charging station", the same category as real installers,
 * so they have to go by name and domain.
 */
const CHARGE_POINT = new RegExp([
  'instavolt', 'bp pulse', 'tesla', 'shell recharge', 'osprey', 'gridserve',
  'ionity', 'fastned', 'char\.?gy', 'source london', 'ubitricity', 'connected kerb',
  'esb energy', 'mfg', 'motor fuel', 'supercharger', 'charging station', 'charge point',
  'lidl', 'tesco', 'aldi', 'sainsbury', 'morrisons', 'waitrose', 'asda', 'co-?op',
  'mcdonald', 'starbucks', 'costa', 'premier inn', 'travelodge', 'car park', 'services',
  'ncp', 'q-?park', 'ikea', 'marks and spencer',
].map(w => `\\b${w}\\b`).join('|'), 'i');

/** Trades that turn up in the raw scrapes and are not who Earl sells to. */
const WRONG_TRADE = new RegExp([
  'construction', 'scaffold', 'skip hire', 'removals', 'taxi', 'hair', 'beauty', 'dental',
  'solicitor\\w*', 'accountant\\w*', 'estate agent\\w*', 'recruit\\w*', 'driving school',
  'car sales', 'window\\w*', 'kitchen\\w*', 'bathroom\\w*', 'flooring', 'carpet\\w*',
  'roofing', 'fencing', 'landscap\\w*', 'paving', 'catering', 'nursery', 'school', 'church',
  'pharmacy', 'vets?', 'clinic', 'locksmith\\w*', 'cleaning', 'waste', 'hire centre',
  'insurance', 'mortgage', 'plumb\\w*', 'transport', 'logistics', 'courier', 'haulage',
  'training', 'fabricat\\w*', 'steel', 'glazing', 'joiner\\w*', 'shopfitt\\w*',
  'furniture', 'signage', 'printing', 'travel', 'restaurant', 'takeaway',
].map(w => `\\b${w}\\b`).join('|'), 'i');

/** Google categories worth calling, per source type. */
const OK_CATEGORY = {
  bms: new Set(['Automation company', 'HVAC contractor', 'Home automation company',
    'Electrical engineer', 'Electrical installation service',
    'Engineering consultant', 'Security system installation service',
    'Air conditioning contractor', 'Heating contractor', 'Mechanical contractor',
    'Energy equipment and solutions', 'Refrigerator repair service']),
  ev: new Set(['Electric vehicle charging station contractor', 'Electrician',
    'Electrical installation service', 'Electrical engineer', 'Solar energy company',
    'Solar energy system service']),
};

const PRIORITY = [
  'london', 'croydon', 'bromley', 'kingston', 'sutton', 'richmond', 'enfield', 'harrow', 'barnet',
  'hounslow', 'ealing', 'brent', 'camden', 'islington', 'hackney', 'newham', 'redbridge', 'havering',
  'bexley', 'greenwich', 'lewisham', 'southwark', 'lambeth', 'wandsworth', 'merton', 'westminster',
  'surrey', 'kent', 'essex', 'hertfordshire', 'berkshire', 'middlesex', 'buckinghamshire',
  'guildford', 'woking', 'epsom', 'reigate', 'reading', 'slough', 'watford', 'st albans',
  'chelmsford', 'maidstone', 'sevenoaks', 'dartford', 'basildon', 'romford', 'ilford', 'luton',
  'brighton', 'crawley', 'basingstoke', 'high wycombe', 'hemel hempstead', 'southend',
];

/* --------------------------------------------------------------- normalising */

// Some source rows carry mangled bytes from the original export.
const clean = s => String(s ?? '')
  .replace(/[�Â ]/g, ' ')
  .replace(/\s*[|/-]\s*$/, '')
  .replace(/\s+/g, ' ')
  .trim();

const domainOf = u => {
  const s = String(u || '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '');
  const d = s.split(/[/?#]/)[0];
  return d.includes('.') ? d : '';
};

/** UK numbers into a comparable shape, and into something dialable. */
const tidyPhone = p => {
  let d = String(p || '').replace(/[^0-9+]/g, '');
  if (!d) return '';
  d = d.replace(/^\+?44/, '0').replace(/^00440?/, '0');
  d = d.replace(/[^0-9]/g, '');
  if (d.length < 10 || d.length > 11) return '';
  return d.length === 10 ? `0${d}` : d;
};

const cityOf = r => clean(
  (r.headquarters && r.headquarters.cityId) || r.cityId || r.sourceCity || ''
).replace(/-/g, ' ');

const postcodeOf = r => clean(
  (r.headquarters && r.headquarters.postcodeArea) || r.postcodeArea || ''
).toUpperCase();

const socialOf = r => {
  const s = r.social || {};
  return {
    linkedin: clean(s.linkedin || s.linkedIn || ''),
    instagram: clean(s.instagram || ''),
    facebook: clean(s.facebook || ''),
  };
};

/* ------------------------------------------------------------------ scoring */

/**
 * A, B or C from what is actually on the record. No guessing at revenue.
 * Accreditations and review volume are the only real "established" signals here.
 */
function grade(p) {
  let score = 0;
  if (p.google_reviews >= 40) score += 3;
  else if (p.google_reviews >= 15) score += 2;
  else if (p.google_reviews >= 5) score += 1;
  // A 5.0 from one review says nothing, so the rating only counts with volume.
  if (p.google_rating >= 4.5 && p.google_reviews >= 5) score += 1;
  if (p.certifications >= 2) score += 2;
  else if (p.certifications >= 1) score += 1;
  if (p.website) score += 1;
  if (p.general_email) score += 1;
  if (p.inPriorityRegion) score += 2;
  if (p.commercial) score += 2;
  if (p.trusted) score += 2;            // came from a cleaned, vetted source
  return score >= 8 ? 'A' : score >= 5 ? 'B' : 'C';
}

/**
 * The "why call them" line. Built only from gaps visible in the record, never
 * invented. If nothing stands out it says so, rather than making something up.
 */
function angle(p) {
  const gaps = [];
  if (!p.website) gaps.push('no website on file');
  if (!p.instagram && !p.facebook && !p.linkedin) gaps.push('no social presence found');
  else if (!p.instagram) gaps.push('nothing on Instagram');
  if (p.google_reviews >= 20 && p.google_rating >= 4.4 && !p.instagram) {
    return `${p.google_reviews} Google reviews at ${p.google_rating} and nothing on Instagram to show for it.`;
  }
  if (p.certifications >= 2 && !p.website) {
    return 'Accredited and established, with no website carrying any of it.';
  }
  if (p.google_reviews >= 20 && p.google_rating >= 4.4) {
    return `Strong reviews (${p.google_reviews} at ${p.google_rating}). Worth asking what they do with that proof.`;
  }
  if (gaps.length) {
    return `Researched from ${p.source}: ${gaps.join(', ')}. Confirm on the call.`;
  }
  return `From ${p.source}. Nothing researched yet, so open with what they do and how they market it.`;
}

/* ------------------------------------------------------------------ mapping */

function toProspect(r, { sector, source, trusted, categoryKey }) {
  const name = clean(r.name);
  const phone = tidyPhone(r.phone);
  if (!name || !phone) return null;

  const category = clean(r.sourceCategory || r.category || '');
  if (CHARGE_POINT.test(name) || CHARGE_POINT.test(domainOf(r.website))) return null;
  if (WRONG_TRADE.test(name)) return null;

  // Raw sources get judged on the Google category. Cleaned sources are already vetted.
  if (!trusted && categoryKey) {
    const allowed = OK_CATEGORY[categoryKey];
    if (category && !allowed.has(category)) return null;
    if (!category) return null;
  }

  const city = cityOf(r);
  const social = socialOf(r);
  const certs = Array.isArray(r.certifications) ? r.certifications.length : 0;
  const services = Array.isArray(r.serviceTypes) ? r.serviceTypes : [];
  const commercial = services.some(s => /commercial|workplace|fleet|apartment/i.test(s));
  const inPriorityRegion = PRIORITY.some(x => city.toLowerCase().includes(x));

  const p = {
    name,
    sector,
    sub_sector: category,
    location: city ? city.replace(/\b\w/g, c => c.toUpperCase()) : '',
    postcode: postcodeOf(r),
    region: inPriorityRegion ? 'London and the South East' : '',
    website: clean(r.website),
    main_phone: phone.replace(/^(\d{5})(\d+)$/, '$1 $2'),
    general_email: clean(r.email || '').toLowerCase(),
    linkedin_company: social.linkedin,
    instagram: social.instagram,
    facebook: social.facebook,
    google_reviews: Number(r.reviewCount) || 0,
    google_rating: Number(r.rating) || 0,
    segment: commercial ? 'both' : '',
    key_services: services.join(', '),
    certifications: certs,
    established_evidence: [
      certs ? `${certs} accreditation${certs > 1 ? 's' : ''} on file` : '',
      Number(r.reviewCount) ? `${r.reviewCount} Google reviews` : '',
      Array.isArray(r.citiesServed) && r.citiesServed.length > 3 ? `covers ${r.citiesServed.length} areas` : '',
    ].filter(Boolean).join(', '),
    source,
    source_urls: clean(r.website),
    inPriorityRegion,
    commercial,
    trusted,
  };

  p.lead_quality = grade(p);
  p.marketing_opportunity = angle(p);
  return p;
}

/* --------------------------------------------------------------------- main */

const SOURCES = [
  { rel: 'BMS WEB DIRECTORY/data/live/installers.json',
    sector: 'Commercial Heating', source: 'BCIA accredited list', trusted: true },
  { rel: 'BMS WEB DIRECTORY/data/raw/bms-contact-db.json',
    sector: 'Commercial Heating', source: 'BMS contractor database',
    // Not vetted: this is a name search, and "BMS" is also the initials of a
    // transport firm, a recruiter and a locksmith. Judge it on its category.
    trusted: false, categoryKey: 'bms' },
  { rel: 'BMS WEB DIRECTORY/data/raw/outscraper-2.json',
    sector: 'HVAC', source: 'Building controls search', trusted: false, categoryKey: 'bms' },
  { rel: 'EV WEB DIRECTORY/data/enriched/installers.enriched.json',
    sector: 'EV Charging', source: 'EV installer directory', trusted: true },
  { rel: 'EV WEB DIRECTORY/data/raw/batch-01.json',
    sector: 'EV Charging', source: 'EV installer search', trusted: false, categoryKey: 'ev' },
];

const COLUMNS = [
  ['name', 'Company Name'], ['sector', 'Sector'], ['sub_sector', 'Sub-Sector'],
  ['location', 'Location'], ['postcode', 'Postcode'], ['region', 'Region'],
  ['website', 'Website'], ['main_phone', 'Main Phone'], ['general_email', 'General Email'],
  ['linkedin_company', 'LinkedIn Company'], ['instagram', 'Instagram'], ['facebook', 'Facebook'],
  ['google_reviews', 'Google Review Count'], ['google_rating', 'Google Rating'],
  ['segment', 'Commercial / Residential / Both'], ['key_services', 'Key Services'],
  ['established_evidence', "Evidence They're Established"],
  ['marketing_opportunity', 'Marketing Opportunity'], ['lead_quality', 'Lead Quality'],
  ['source', 'Source'], ['source_urls', 'Source URLs'],
];

const csvCell = v => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

async function main() {
  const allUk = flag('--all-uk');
  say(`\n  Reading local research files only. Nothing is fetched.\n`);

  const kept = [];
  const dropped = { chargePoint: 0, wrongTrade: 0, noPhone: 0, offCategory: 0 };

  for (const src of SOURCES) {
    const rows = load(src.rel);
    let n = 0;
    for (const r of rows) {
      if (!clean(r.name)) continue;
      if (!tidyPhone(r.phone)) { dropped.noPhone += 1; continue; }
      if (CHARGE_POINT.test(clean(r.name))) { dropped.chargePoint += 1; continue; }
      if (WRONG_TRADE.test(clean(r.name))) { dropped.wrongTrade += 1; continue; }
      const p = toProspect(r, src);
      if (!p) { dropped.offCategory += 1; continue; }
      kept.push(p);
      n += 1;
    }
    say(`  ${String(n).padStart(5)} from ${src.rel.split('/')[0]}  (${src.source})`);
  }

  /* Dedupe the same way the CRM will: domain, then phone, then a squashed name. */
  const byKey = new Map();
  const squash = s => s.toLowerCase()
    .replace(/\b(ltd|limited|plc|llp|uk|the|co|company|group|services|solutions)\b/g, '')
    .replace(/[^a-z0-9]/g, '');
  let dupes = 0;
  for (const p of kept) {
    const keys = [domainOf(p.website), tidyPhone(p.main_phone), squash(p.name)].filter(Boolean);
    const hit = keys.find(k => byKey.has(k));
    if (hit) {
      // Keep whichever record carries more, so a cleaned row beats a raw one.
      const cur = byKey.get(hit);
      const richer = (x) => Object.values(x).filter(Boolean).length + (x.trusted ? 5 : 0);
      if (richer(p) > richer(cur)) keys.forEach(k => byKey.set(k, p));
      dupes += 1;
      continue;
    }
    keys.forEach(k => byKey.set(k, p));
  }
  let unique = [...new Set(byKey.values())];

  const inRegion = unique.filter(p => p.inPriorityRegion);
  if (!allUk) unique = inRegion;

  unique.sort((a, b) =>
    a.lead_quality.localeCompare(b.lead_quality) || b.google_reviews - a.google_reviews);

  say(`\n  dropped: ${dropped.noPhone} without a phone, ${dropped.chargePoint} charge points,`);
  say(`           ${dropped.wrongTrade} wrong trade, ${dropped.offCategory} off-category`);
  say(`  ${dupes} duplicates merged`);
  say(`\n  ${unique.length} prospects ready${allUk ? ' (whole UK)' : ' in London and the South East'}`);
  const byGrade = unique.reduce((m, p) => { m[p.lead_quality] = (m[p.lead_quality] || 0) + 1; return m; }, {});
  say(`  A: ${byGrade.A || 0}   B: ${byGrade.B || 0}   C: ${byGrade.C || 0}`);
  say(`  with an email: ${unique.filter(p => p.general_email).length}`);
  say(`  with a website: ${unique.filter(p => p.website).length}`);

  const out = join(ROOT, `prospects-from-directories${allUk ? '-uk' : ''}.csv`);
  const csv = '﻿' + [
    COLUMNS.map(c => csvCell(c[1])).join(','),
    ...unique.map(p => COLUMNS.map(([k]) => csvCell(p[k])).join(',')),
  ].join('\r\n');
  writeFileSync(out, csv, 'utf8');
  say(`\n  written: ${out}`);

  if (flag('--import')) {
    const { runImport } = await import('../lib/crm/importer.mjs');
    const { init } = await import('../lib/crm/db.mjs');
    const auth = await import('../lib/crm/auth.mjs');
    await init();
    const owner = (await auth.listUsers())[0];
    const summary = await runImport({
      rows: unique, mode: 'add',
      filename: 'prospects-from-directories.csv',
      userId: owner && owner.id,
    });
    say(`\n  imported: ${summary.added} added, ${summary.updated} updated, ${summary.skipped} skipped\n`);
  } else {
    say(`  Review it, then import at /crm, or re-run with --import\n`);
  }
}

main().catch(err => { console.error(err); exit(1); });
