// Importing researched prospect lists.
//
// The browser parses the CSV or XLSX and maps the columns, then posts rows here
// keyed by CRM field name. This file owns everything that must not be trusted to
// the browser: normalising, matching against what already exists, and deciding
// whether a row is new, an update, or a duplicate to leave alone.
//
// Matching runs against a single in-memory index of the existing prospects
// (id, name, domain, phone) rather than a query per row, so a 5,000 row import
// is a handful of round trips instead of fifteen thousand.

import { select, insert, insertMany, update, byId, nowISO } from './db.mjs';
import { getSettings, STAGE } from './settings.mjs';
import { matchesExclusion } from './queue.mjs';

/**
 * Every importable field, with the header names commonly seen in the wild.
 * The browser uses `aliases` to pre-fill the mapping screen.
 */
export const FIELDS = [
  { key: 'name', label: 'Company Name', required: true, aliases: ['company', 'company name', 'business', 'business name', 'organisation', 'account'] },
  { key: 'sector', label: 'Sector', aliases: ['industry', 'category', 'vertical', 'niche'] },
  { key: 'sub_sector', label: 'Sub-Sector', aliases: ['sub sector', 'subcategory', 'speciality', 'specialty'] },
  { key: 'location', label: 'Location', aliases: ['town', 'city', 'address', 'area', 'county'] },
  { key: 'postcode', label: 'Postcode', aliases: ['post code', 'zip', 'postal code'] },
  { key: 'region', label: 'Region', aliases: ['county', 'territory'] },
  { key: 'areas_served', label: 'Areas Served', aliases: ['coverage', 'service area', 'areas covered', 'areas'] },
  { key: 'website', label: 'Website', aliases: ['url', 'site', 'web', 'domain', 'website url'] },
  { key: 'main_phone', label: 'Main Phone', aliases: ['phone', 'telephone', 'tel', 'company phone', 'office phone', 'main number', 'phone number'] },
  { key: 'general_email', label: 'General Email', aliases: ['email', 'company email', 'info email', 'general email address'] },
  { key: 'contact_first_name', label: 'Contact First Name', aliases: ['first name', 'firstname', 'forename', 'contact first'] },
  { key: 'contact_last_name', label: 'Contact Last Name', aliases: ['last name', 'lastname', 'surname', 'contact last'] },
  { key: 'contact_full_name', label: 'Contact Full Name', aliases: ['contact', 'contact name', 'full name', 'decision maker', 'name'] },
  { key: 'job_title', label: 'Job Title', aliases: ['title', 'position', 'role', 'job role'] },
  { key: 'direct_email', label: 'Direct Email', aliases: ['personal email', 'contact email', 'direct email address'] },
  { key: 'direct_phone', label: 'Direct Phone', aliases: ['mobile', 'direct dial', 'ddi', 'contact phone', 'cell'] },
  { key: 'linkedin_contact', label: 'LinkedIn (Contact)', aliases: ['linkedin', 'linkedin profile', 'contact linkedin'] },
  { key: 'linkedin_company', label: 'LinkedIn (Company)', aliases: ['company linkedin', 'linkedin company', 'linkedin page'] },
  { key: 'instagram', label: 'Instagram', aliases: ['ig', 'insta'] },
  { key: 'facebook', label: 'Facebook', aliases: ['fb'] },
  { key: 'employees', label: 'Approx Employee Count', aliases: ['staff', 'headcount', 'employee count', 'team size', 'employees'] },
  { key: 'founded', label: 'Founded', aliases: ['year founded', 'established', 'incorporated', 'since'] },
  { key: 'years_trading', label: 'Years Trading', aliases: ['years in business', 'trading years', 'age'] },
  { key: 'google_reviews', label: 'Google Review Count', aliases: ['reviews', 'review count', 'google reviews'] },
  { key: 'google_rating', label: 'Google Rating', aliases: ['rating', 'stars', 'google rating'] },
  { key: 'segment', label: 'Commercial / Residential / Both', aliases: ['type', 'customer type', 'market', 'commercial residential'] },
  { key: 'key_services', label: 'Key Services', aliases: ['services', 'offering', 'what they do'] },
  { key: 'established_evidence', label: 'Evidence They\'re Established', aliases: ['evidence', 'signals', 'established evidence', 'credibility'] },
  { key: 'marketing_opportunity', label: 'Marketing Opportunity', aliases: ['opportunity', 'why call', 'angle', 'reason to call', 'hook'] },
  { key: 'lead_quality', label: 'Lead Quality', aliases: ['rating', 'grade', 'priority', 'lead rating', 'quality'] },
  { key: 'source_urls', label: 'Source URLs', aliases: ['sources', 'source', 'source url', 'research links'] },
  { key: 'date_verified', label: 'Date Verified', aliases: ['verified', 'checked', 'date checked'] },
  { key: 'ask_for', label: 'Ask For (job title)', aliases: ['ask for', 'target role'] },
  { key: 'est_mrr', label: 'Estimated Monthly Value', aliases: ['mrr', 'monthly value', 'estimated value', 'monthly'] },
  { key: 'est_one_off', label: 'Estimated One-Off Value', aliases: ['one off', 'project value', 'one-off value'] },
  { key: 'notes', label: 'Notes', aliases: ['note', 'comments', 'remarks'] },
];

export const FIELD_KEYS = FIELDS.map(f => f.key);

/* ---------------------------------------------------------- normalising */

export const cleanDomain = url => {
  const s = String(url || '').trim().toLowerCase();
  if (!s) return '';
  const m = s.replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[/?#]/)[0];
  return m.includes('.') ? m : '';
};

/** UK numbers, reduced to something comparable. 0208… and +4420… must match. */
export const phoneKey = phone => {
  let d = String(phone || '').replace(/[^0-9+]/g, '');
  if (!d) return '';
  d = d.replace(/^\+?44/, '0').replace(/^00440?/, '0');
  d = d.replace(/[^0-9]/g, '');
  if (d.length < 9) return '';
  return d.slice(-10);
};

export const normName = s => String(s || '')
  .toLowerCase()
  .replace(/\b(ltd|limited|plc|llp|llc|inc|uk|the|co|company|group|services|solutions)\b/g, '')
  .replace(/[^a-z0-9]+/g, '')
  .trim();

const tidyUrl = u => {
  const s = String(u || '').trim();
  if (!s) return '';
  return /^https?:\/\//i.test(s) ? s : `https://${s.replace(/^\/+/, '')}`;
};

const QUALITY = v => {
  const s = String(v || '').trim().toUpperCase();
  if (s.startsWith('A')) return 'A';
  if (s.startsWith('B')) return 'B';
  if (s.startsWith('C')) return 'C';
  if (/HIGH/.test(s)) return 'A';
  if (/MED|GOOD/.test(s)) return 'B';
  if (/LOW/.test(s)) return 'C';
  return 'B';
};

const SEGMENT = v => {
  const s = String(v || '').toLowerCase();
  if (s.includes('both')) return 'both';
  if (s.includes('comm')) return 'commercial';
  if (s.includes('resi') || s.includes('domestic')) return 'residential';
  return '';
};

const num = v => {
  if (v === null || v === undefined || v === '') return null;
  const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
};

/** One raw mapped row into the company fields and the contact fields. */
export function normaliseRow(raw) {
  const g = k => {
    const v = raw[k];
    return v === null || v === undefined ? '' : String(v).trim();
  };

  let first = g('contact_first_name');
  let last = g('contact_last_name');
  const full = g('contact_full_name');
  if (!first && !last && full) {
    const bits = full.split(/\s+/).filter(Boolean);
    first = bits.shift() || '';
    last = bits.join(' ');
  }

  const website = tidyUrl(g('website'));
  const founded = num(g('founded'));
  const yearsTrading = num(g('years_trading'));
  const thisYear = new Date().getUTCFullYear();

  const company = {
    name: g('name'),
    sector: g('sector'),
    sub_sector: g('sub_sector'),
    location: g('location'),
    postcode: g('postcode').toUpperCase(),
    region: g('region'),
    areas_served: g('areas_served'),
    website,
    domain: cleanDomain(website),
    main_phone: g('main_phone'),
    phone_key: phoneKey(g('main_phone')),
    general_email: g('general_email').toLowerCase(),
    linkedin_company: g('linkedin_company'),
    instagram: g('instagram'),
    facebook: g('facebook'),
    employees: num(g('employees')),
    founded: founded && founded > 1800 && founded <= thisYear ? Math.round(founded) : null,
    years_trading: yearsTrading != null ? Math.round(yearsTrading)
      : (founded && founded > 1800 ? thisYear - Math.round(founded) : null),
    google_reviews: num(g('google_reviews')),
    google_rating: num(g('google_rating')),
    segment: SEGMENT(g('segment')),
    key_services: g('key_services'),
    established_evidence: g('established_evidence'),
    marketing_opportunity: g('marketing_opportunity'),
    lead_quality: QUALITY(g('lead_quality')),
    source_urls: g('source_urls'),
    date_verified: g('date_verified'),
    ask_for: g('ask_for'),
    est_mrr: num(g('est_mrr')),
    est_one_off: num(g('est_one_off')),
    notes: g('notes'),
  };

  const contact = (first || last || g('job_title') || g('direct_email') || g('direct_phone'))
    ? {
        first_name: first,
        last_name: last,
        job_title: g('job_title'),
        direct_email: g('direct_email').toLowerCase(),
        direct_phone: g('direct_phone'),
        linkedin: g('linkedin_contact'),
      }
    : null;

  return { company, contact };
}

export const searchBlob = (company, contact) => [
  company.name, company.location, company.postcode, company.sector, company.sub_sector,
  company.main_phone, company.general_email, company.website, company.notes,
  company.marketing_opportunity, company.key_services,
  contact && `${contact.first_name || ''} ${contact.last_name || ''}`,
  contact && contact.direct_email, contact && contact.direct_phone,
].filter(Boolean).join(' ').toLowerCase().slice(0, 2000);

/* ------------------------------------------------------------- matching */

/** id/name/domain/phone for everything already stored, fetched in pages. */
export async function buildIndex() {
  const byDomain = new Map();
  const byPhone = new Map();
  const byName = new Map();
  const pageSize = 1000;
  for (let offset = 0; offset < 200000; offset += pageSize) {
    const page = await select('companies', {
      columns: ['id', 'name', 'domain', 'phone_key'],
      order: [{ col: 'created_at', dir: 'asc' }],
      limit: pageSize, offset,
    });
    for (const r of page) {
      if (r.domain) byDomain.set(r.domain, r.id);
      if (r.phone_key) byPhone.set(r.phone_key, r.id);
      const n = normName(r.name);
      if (n && !byName.has(n)) byName.set(n, r.id);
    }
    if (page.length < pageSize) break;
  }
  return { byDomain, byPhone, byName };
}

/** Domain is the strongest signal, then phone, then a normalised name. */
export function matchRow(company, index) {
  if (company.domain && index.byDomain.has(company.domain)) {
    return { id: index.byDomain.get(company.domain), by: 'website domain' };
  }
  if (company.phone_key && index.byPhone.has(company.phone_key)) {
    return { id: index.byPhone.get(company.phone_key), by: 'phone number' };
  }
  const n = normName(company.name);
  if (n && index.byName.has(n)) {
    return { id: index.byName.get(n), by: 'company name' };
  }
  return null;
}

/** Dry run for the confirm screen: how many are new, how many already exist. */
export async function analyse(rows) {
  const index = await buildIndex();
  const exclusions = await select('exclusions', {});
  const seen = new Map();
  const out = [];
  let added = 0;
  let duplicates = 0;
  let invalid = 0;

  rows.forEach((raw, i) => {
    const { company, contact } = normaliseRow(raw);
    if (!company.name) {
      invalid += 1;
      out.push({ row: i + 1, status: 'error', message: 'No company name' });
      return;
    }
    const keyBy = company.domain ? 'website domain' : company.phone_key ? 'phone number' : 'company name';
    const key = company.domain || company.phone_key || normName(company.name);
    const hit = matchRow(company, index);
    const dupeInFile = seen.has(key);
    seen.set(key, true);

    const excluded = matchesExclusion(company.name, exclusions);

    if (hit || dupeInFile) {
      duplicates += 1;
      out.push({
        row: i + 1, status: 'duplicate', name: company.name,
        matchedBy: hit ? hit.by : `${keyBy}, against another row in this file`,
        inFile: !hit,
        existingId: hit ? hit.id : null, excluded,
      });
    } else {
      added += 1;
      out.push({ row: i + 1, status: 'new', name: company.name, excluded, hasContact: Boolean(contact) });
    }
  });

  return { total: rows.length, wouldAdd: added, duplicates, invalid, rows: out };
}

/* -------------------------------------------------------------- running */

/**
 * @param mode 'add'    only create rows that do not already exist
 *             'update' create new ones and refresh the fields on existing ones
 *             'skip'   create new ones, leave every duplicate untouched (same as add)
 */
export async function runImport({ rows, mode = 'add', filename = '', userId, isSeed = false }) {
  const settings = await getSettings();
  const index = await buildIndex();
  const exclusions = await select('exclusions', {});
  const stamp = nowISO();

  const errors = [];
  const toInsert = [];
  const pendingContacts = [];   // parallel to toInsert
  let updated = 0;
  let skipped = 0;
  const seen = new Set();

  const importRow = await insert('imports', {
    filename: String(filename || 'pasted rows').slice(0, 200),
    user_id: userId || null,
    rows: rows.length, added: 0, updated: 0, skipped: 0, errors: '[]',
  });

  for (let i = 0; i < rows.length; i += 1) {
    const { company, contact } = normaliseRow(rows[i]);
    if (!company.name) { errors.push({ row: i + 1, message: 'No company name' }); continue; }

    const key = company.domain || company.phone_key || normName(company.name);
    if (seen.has(key)) { skipped += 1; continue; }
    seen.add(key);

    const hit = matchRow(company, index);
    const hitExclusion = matchesExclusion(company.name, exclusions);

    if (hit) {
      if (mode !== 'update') { skipped += 1; continue; }
      // Never blank an existing value with an empty cell.
      const patch = {};
      for (const [k, v] of Object.entries(company)) {
        if (v === '' || v === null || v === undefined) continue;
        patch[k] = v;
      }
      patch.import_id = importRow.id;
      patch.search_blob = searchBlob(company, contact);
      await update('companies', hit.id, patch);
      if (contact) await upsertContact(hit.id, contact, isSeed);
      updated += 1;
      continue;
    }

    const id = globalThis.crypto.randomUUID();
    toInsert.push({
      ...company,
      id,
      stage: STAGE.NEW,
      call_status: 'new',
      attempts: 0,
      no_answer_count: 0,
      excluded: hitExclusion ? 1 : 0,
      exclusion_reason: hitExclusion ? `Matches "${hitExclusion}"` : null,
      archived: 0,
      is_seed: isSeed ? 1 : 0,
      source: 'import',
      import_id: importRow.id,
      search_blob: searchBlob(company, contact),
      created_at: stamp,
      updated_at: stamp,
      created_by: userId || null,
    });
    if (contact) pendingContacts.push({ companyId: id, contact });

    if (company.domain) index.byDomain.set(company.domain, id);
    if (company.phone_key) index.byPhone.set(company.phone_key, id);
    const n = normName(company.name);
    if (n) index.byName.set(n, id);
  }

  if (toInsert.length) await insertMany('companies', toInsert);
  if (pendingContacts.length) {
    await insertMany('contacts', pendingContacts.map(({ companyId, contact }) => ({
      company_id: companyId,
      ...contact,
      is_primary: 1,
      archived: 0,
      is_seed: isSeed ? 1 : 0,
      updated_at: stamp,
    })));
  }

  const summary = {
    id: importRow.id,
    filename: importRow.filename,
    rows: rows.length,
    added: toInsert.length,
    updated,
    skipped,
    errors,
  };
  await update('imports', importRow.id, {
    added: summary.added, updated, skipped, errors: JSON.stringify(errors.slice(0, 200)),
  });
  return summary;
}

async function upsertContact(companyId, contact, isSeed) {
  const existing = await select('contacts', {
    where: [{ col: 'company_id', op: 'eq', val: companyId }],
    limit: 20,
  });
  const same = existing.find(c =>
    (contact.direct_email && c.direct_email === contact.direct_email) ||
    (normName(`${c.first_name}${c.last_name}`) === normName(`${contact.first_name}${contact.last_name}`)));
  if (same) {
    const patch = {};
    for (const [k, v] of Object.entries(contact)) if (v) patch[k] = v;
    return update('contacts', same.id, patch);
  }
  return insert('contacts', {
    company_id: companyId, ...contact,
    is_primary: existing.length === 0 ? 1 : 0,
    archived: 0, is_seed: isSeed ? 1 : 0, updated_at: nowISO(),
  });
}

export { upsertContact };
