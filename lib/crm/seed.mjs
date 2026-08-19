// Development sample data.
//
// Every company here is invented. None of them are real businesses, none of the
// numbers dial anywhere real (they use Ofcom's reserved 01632 / 07700 ranges),
// and every row is written with is_seed = 1 so `clearSeed()` removes the lot
// without touching anything you have imported for real.

import { insert, insertMany, select, remove, count, nowISO } from './db.mjs';
import { addDays, addWorkingDays, today } from './dates.mjs';
import { searchBlob } from './importer.mjs';
import { refreshNextFollowUp } from './queue.mjs';
import { STAGE } from './settings.mjs';

const COMPANIES = [
  ['Apex Solar Solutions Ltd', 'Commercial Solar', 'Rooftop PV', 'Croydon', 'CR0 2RF', 'Greater London', 'A', 42, 2011, 'commercial', 'Rooftop PV, O&M contracts, solar carports', 'Strong commercial project portfolio but almost no video case studies.', 'MCS accredited, 40+ staff, named industrial clients on site', 187, 4.8],
  ['South East Climate Systems Ltd', 'Air Conditioning', 'VRF and Chillers', 'Sevenoaks', 'TN13 1XA', 'Kent', 'A', 55, 2004, 'commercial', 'VRF design and install, chiller servicing, F-Gas', 'Professional brand but weak social proof around completed installations.', 'F-Gas certified, 20 years trading, two depots', 96, 4.6],
  ['GreenGrid Battery Services Ltd', 'Battery Storage', 'C&I BESS', 'Reading', 'RG1 8LS', 'Berkshire', 'A', 28, 2018, 'commercial', 'Containerised BESS, peak shaving, grid connection', 'Genuinely interesting projects and almost nothing published about any of them.', 'Grid connection experience, National Grid framework listed', 34, 4.9],
  ['Metro EV Infrastructure Ltd', 'Commercial EV Charging', 'Depot charging', 'Barking', 'IG11 7BT', 'Greater London', 'A', 64, 2015, 'commercial', 'Depot charging, fleet transition, DNO applications', 'Large installation operation with little founder-led content.', 'Fleet contracts, 30+ engineers, own DNO team', 121, 4.5],
  ['Thameside Heat Pump Company Ltd', 'Heat Pumps', 'ASHP retrofit', 'Kingston upon Thames', 'KT1 1JY', 'Greater London', 'B', 18, 2016, 'both', 'ASHP retrofit, heat loss surveys, BUS grant admin', 'Good Google reviews but an outdated website.', 'MCS registered, BUS grant approved installer', 212, 4.7],
  ['Beacon Commercial Heating Ltd', 'Commercial Heating', 'Boilers and plant', 'Watford', 'WD17 1AB', 'Hertfordshire', 'B', 33, 2009, 'commercial', 'Commercial boilers, plant rooms, LPHW systems', 'Active Instagram but inconsistent posting and weak project storytelling.', 'Gas Safe commercial, schools and NHS framework work', 58, 4.4],
  ['Kentish Renewables Group Ltd', 'Renewable Energy', 'Mixed technology', 'Maidstone', 'ME14 1XX', 'Kent', 'B', 24, 2013, 'both', 'Solar, batteries, EV, heat pumps', 'Four technologies and one page of website copy covering all of them.', 'Multiple accreditations, van fleet visible on site', 143, 4.6],
  ['Northgate Air Conditioning Ltd', 'Air Conditioning', 'Split systems', 'Enfield', 'EN1 1TP', 'Greater London', 'B', 15, 2012, 'both', 'Split systems, servicing contracts, ventilation', 'Doing good work in an unglamorous niche with zero visual content.', 'REFCOM registered, service contract base', 77, 4.3],
  ['Solent Solar Partners Ltd', 'Solar', 'Domestic and light commercial', 'Guildford', 'GU1 3UW', 'Surrey', 'B', 21, 2014, 'both', 'Domestic PV, light commercial, battery add-ons', 'Strong solar projects but no YouTube content at all.', 'MCS, 10 years trading, showroom premises', 165, 4.8],
  ['Fenwick HVAC Contracts Ltd', 'HVAC', 'Design and build', 'Basildon', 'SS14 1AA', 'Essex', 'A', 78, 2001, 'commercial', 'Design and build M&E, AHU replacement, BMS integration', 'Serious contractor with a brochure website from a decade ago.', 'Over 70 staff, main contractor relationships, CHAS accredited', 41, 4.5],
  ['Crown Point Cooling Ltd', 'Air Conditioning', 'Data centre cooling', 'Slough', 'SL1 1XY', 'Berkshire', 'A', 47, 2010, 'commercial', 'Precision cooling, data centre CRAC, 24/7 response', 'Niche technical work no one outside the industry knows they do.', 'Data centre clients, 24/7 contracts, ISO 9001', 29, 4.9],
  ['Harrow Green Energy Ltd', 'Renewable Energy', 'Commercial retrofit', 'Harrow', 'HA1 1BA', 'Greater London', 'B', 19, 2017, 'commercial', 'Commercial retrofit, LED, solar, controls', 'Sells on carbon savings and has no way to show them.', 'Public sector framework, case studies in PDF only', 63, 4.4],
  ['Dartford Heat and Power Ltd', 'Commercial Heating', 'CHP and district heat', 'Dartford', 'DA1 1RT', 'Kent', 'B', 31, 2008, 'commercial', 'CHP, district heating, plant maintenance', 'Complex projects explained nowhere.', 'District heating schemes, 15 years trading', 22, 4.2],
  ['Rivergate Solar Ltd', 'Commercial Solar', 'Ground mount', 'Chelmsford', 'CM1 1QW', 'Essex', 'C', 12, 2019, 'commercial', 'Ground mount arrays, agricultural PV', 'Small but doing the kind of projects that photograph well.', 'Agricultural client base, growing team', 18, 4.7],
  ['Elmbridge Climate Ltd', 'HVAC', 'Servicing', 'Esher', 'KT10 9AA', 'Surrey', 'C', 9, 2015, 'both', 'Servicing, small installs, maintenance contracts', 'Recurring service revenue and no content engine feeding it.', 'Steady service base, one office', 45, 4.5],
  ['Voltaic Fleet Charging Ltd', 'EV Infrastructure', 'Fleet and destination', 'St Albans', 'AL1 1AA', 'Hertfordshire', 'A', 38, 2016, 'commercial', 'Fleet charging, destination charging, load management', 'Winning big contracts quietly.', 'Named fleet clients, OZEV approved', 52, 4.6],
  ['Bexley Boiler Services Ltd', 'Commercial Heating', 'Boiler replacement', 'Bexleyheath', 'DA6 8AA', 'Greater London', 'C', 11, 2011, 'both', 'Boiler replacement, landlord certificates', 'Volume work, thin margins, worth a call but not first.', 'Gas Safe, local reputation', 134, 4.6],
  ['Aurora Energy Storage Ltd', 'Battery Storage', 'Domestic and C&I', 'Woking', 'GU21 6XX', 'Surrey', 'B', 16, 2020, 'both', 'Battery retrofit, hybrid inverters, EMS', 'New enough to need visibility, established enough to pay for it.', 'Tesla certified installer, growing fast', 39, 4.8],
  ['Pennine Air Systems Ltd', 'Air Conditioning', 'Industrial ventilation', 'Luton', 'LU1 2AA', 'Bedfordshire', 'C', 14, 2013, 'commercial', 'Industrial ventilation, LEV testing', 'Outside the priority region, but a real business.', 'LEV competency, industrial clients', 27, 4.3],
  ['Kingsway Renewables Ltd', 'Solar', 'Commercial rooftop', 'Bromley', 'BR1 1AA', 'Greater London', 'A', 35, 2012, 'commercial', 'Commercial rooftop PV, PPAs, monitoring', 'Sells PPAs, which is a story nobody has told for them.', 'PPA structures, commercial landlord clients', 71, 4.7],
];

const CONTACTS = [
  ['Marcus', 'Whitfield', 'Managing Director'],
  ['Priya', 'Raman', 'Commercial Director'],
  ['Tom', 'Ellery', 'Founder'],
  ['Sasha', 'Nkemelu', 'Head of Marketing'],
  ['Daniel', 'Okoro', 'Operations Director'],
  ['Rachel', 'Vane', 'Marketing Director'],
  ['Callum', 'Hartley', 'Owner'],
  ['Nina', 'Fairbrother', 'Managing Director'],
  ['Joseph', 'Adeyemi', 'Sales Director'],
  ['Elena', 'Kovacs', 'Founder'],
  ['Adam', 'Rushton', 'Managing Director'],
  ['Grace', 'Lindqvist', 'Head of Marketing'],
];

/** Ofcom reserves 01632 and 07700 900xxx for drama, so nothing here can ring a real line. */
const phoneAt = i => `01632 ${String(960000 + i * 137).slice(0, 6)}`;
const mobileAt = i => `07700 9${String(100000 + i * 411).slice(0, 5)}`;

const slug = s => s.toLowerCase().replace(/\b(ltd|limited|group)\b/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export async function isSeeded() {
  return (await count('companies', { where: [{ col: 'is_seed', op: 'eq', val: 1 }] })) > 0;
}

export async function seed({ userId } = {}) {
  if (await isSeeded()) return { skipped: true, message: 'Sample data is already loaded.' };

  const stamp = nowISO();
  const t = today();
  const companies = [];
  const contacts = [];

  COMPANIES.forEach((row, i) => {
    const [name, sector, subSector, location, postcode, region, quality, employees,
      founded, segment, services, opportunity, evidence, reviews, rating] = row;
    const id = globalThis.crypto.randomUUID();
    const domain = `${slug(name)}.example.co.uk`;
    const company = {
      id, name, sector, sub_sector: subSector, location, postcode, region,
      areas_served: `${region} and surrounding areas`,
      website: `https://${domain}`, domain,
      main_phone: phoneAt(i), phone_key: phoneAt(i).replace(/\D/g, '').slice(-10),
      general_email: `hello@${domain}`,
      linkedin_company: `https://www.linkedin.com/company/${slug(name)}`,
      instagram: i % 3 === 0 ? `https://instagram.com/${slug(name).replace(/-/g, '')}` : '',
      facebook: i % 4 === 0 ? `https://facebook.com/${slug(name)}` : '',
      employees, founded, years_trading: new Date().getUTCFullYear() - founded,
      google_reviews: reviews, google_rating: rating,
      segment, key_services: services,
      established_evidence: evidence,
      marketing_opportunity: opportunity,
      lead_quality: quality,
      source_urls: `https://${domain}/about`,
      date_verified: t,
      ask_for: employees >= 25 ? 'Marketing Director' : 'Managing Director',
      stage: STAGE.NEW, call_status: 'new', attempts: 0, no_answer_count: 0,
      excluded: 0, archived: 0, is_seed: 1, source: 'sample data',
      created_at: stamp, updated_at: stamp, created_by: userId || null,
    };
    company.search_blob = searchBlob(company, null);
    companies.push(company);

    // Two thirds have a researched decision maker. The rest are "ask for" only.
    if (i % 3 !== 2) {
      const [first, last, title] = CONTACTS[i % CONTACTS.length];
      contacts.push({
        company_id: id, first_name: first, last_name: last, job_title: title,
        direct_email: `${first.toLowerCase()}@${domain}`,
        direct_phone: i % 2 === 0 ? mobileAt(i) : '',
        linkedin: `https://www.linkedin.com/in/${first.toLowerCase()}-${last.toLowerCase()}`,
        is_primary: 1, archived: 0, is_seed: 1, updated_at: stamp,
      });
    }
  });

  await insertMany('companies', companies);
  await insertMany('contacts', contacts);

  /* A worked history so every screen has something honest to show. */
  const byName = Object.fromEntries(companies.map(c => [c.name, c]));
  const at = (dayOffset, hour = 10) =>
    new Date(`${addDays(t, dayOffset)}T${String(hour).padStart(2, '0')}:15:00Z`).toISOString();

  const story = [
    // company, [ [dayOffset, outcome, note] ]
    ['Apex Solar Solutions Ltd', [
      [-9, 'no_answer', ''],
      [-6, 'gatekeeper', 'Reception. Marcus is in on Tuesdays and Thursdays.'],
      [-2, 'decision_maker', 'Spoke to Marcus. Interested in project films, wants to see examples.'],
    ], { stage: STAGE.ENGAGED, call_status: 'contacted', attempts: 3 }],

    ['Metro EV Infrastructure Ltd', [
      [-11, 'no_answer', ''],
      [-7, 'decision_maker', 'Daniel picked up. Depot rollout starting September.'],
      [-3, 'meeting_booked', 'Meeting booked for the depot visit.'],
    ], { stage: STAGE.MEETING, call_status: 'contacted', attempts: 3 }],

    ['South East Climate Systems Ltd', [
      [-14, 'gatekeeper', 'Told to email first.'],
      [-8, 'decision_maker', 'Priya. Wants a proposal for monthly content.'],
      [-4, 'qualified', 'Budget confirmed as realistic. Sending proposal.'],
      [-1, 'proposal', 'Proposal sent for a monthly retainer.'],
    ], { stage: STAGE.OFFER, call_status: 'contacted', attempts: 4 }],

    ['GreenGrid Battery Services Ltd', [
      [-16, 'decision_maker', 'Tom, founder. Very keen on documenting the BESS builds.'],
      [-10, 'meeting_booked', ''],
      [-5, 'won', 'Signed a monthly content retainer.'],
    ], { stage: STAGE.WON, call_status: 'contacted', attempts: 3 }],

    ['Beacon Commercial Heating Ltd', [
      [-5, 'no_answer', ''],
      [-1, 'no_answer', ''],
    ], { stage: STAGE.REACHED_OUT, call_status: 'no_answer', attempts: 2, no_answer_count: 2 }],

    ['Northgate Air Conditioning Ltd', [
      [-3, 'gatekeeper', 'Call back after 4pm.'],
    ], { stage: STAGE.REACHED_OUT, call_status: 'gatekeeper', attempts: 1 }],

    ['Kentish Renewables Group Ltd', [
      [-6, 'decision_maker', 'Interested but reviewing budgets in the new quarter.'],
    ], { stage: STAGE.FOLLOW_UP, call_status: 'contacted', attempts: 1 }],

    ['Solent Solar Partners Ltd', [
      [-4, 'not_interested', 'Has an in-house marketer. Politely no.'],
    ], { stage: STAGE.NOT_NOW, call_status: 'not_interested', attempts: 1 }],

    ['Bexley Boiler Services Ltd', [
      [-2, 'wrong_number', 'Number reaches a taxi firm.'],
    ], { call_status: 'wrong_number', attempts: 1 }],

    ['Fenwick HVAC Contracts Ltd', [
      [-1, 'decision_maker', 'Adam. Send something over, call back in a fortnight.'],
    ], { stage: STAGE.FOLLOW_UP, call_status: 'contacted', attempts: 1 }],
  ];

  const activities = [];
  const updates = [];
  for (const [name, calls, patch] of story) {
    const c = byName[name];
    if (!c) continue;
    for (const [offset, outcome, note] of calls) {
      activities.push({
        company_id: c.id, user_id: userId || null, type: 'call', outcome,
        note, detail: outcome.replace(/_/g, ' '),
        occurred_at: at(offset, 9 + (Math.abs(offset) % 7)),
        is_seed: 1,
      });
    }
    const last = calls[calls.length - 1];
    updates.push([c.id, { ...patch, last_contacted_at: at(last[0]) }]);
  }
  await insertMany('activities', activities);

  const { update } = await import('./db.mjs');
  for (const [id, patch] of updates) await update('companies', id, patch);

  /* Follow-ups: one overdue, one today, one tomorrow, two later. */
  const followUps = [
    ['Kentish Renewables Group Ltd', addDays(t, -2), '10:00', 'call', 'Overdue. Budgets should be signed off by now.'],
    ['Apex Solar Solutions Ltd', t, '11:00', 'call', 'Marcus asked for a call back with examples.'],
    ['Fenwick HVAC Contracts Ltd', addDays(t, 1), '09:30', 'email', 'Send the M&E contractor case study.'],
    ['Northgate Air Conditioning Ltd', addWorkingDays(t, 3), '16:15', 'call', 'After 4pm, per reception.'],
    ['Aurora Energy Storage Ltd', addWorkingDays(t, 6), '', 'linkedin', 'Connect with the founder first.'],
  ];
  for (const [name, date, time, kind, note] of followUps) {
    const c = byName[name];
    if (!c) continue;
    await insert('follow_ups', {
      company_id: c.id, user_id: userId || null, due_date: date, due_time: time,
      kind, note, status: 'pending', is_seed: 1, updated_at: stamp,
    });
    await refreshNextFollowUp(c.id);
  }

  /* Meetings and money. */
  await insertMany('meetings', [
    {
      company_id: byName['Metro EV Infrastructure Ltd'].id,
      date: addWorkingDays(t, 2), time: '14:00', kind: 'On site',
      notes: 'Depot visit, Barking. Bring the drone.', is_seed: 1,
    },
    {
      company_id: byName['GreenGrid Battery Services Ltd'].id,
      date: addDays(t, -8), time: '10:30', kind: 'Video call',
      notes: 'Scoped a monthly retainer.', is_seed: 1,
    },
  ]);

  await insertMany('opportunities', [
    {
      company_id: byName['GreenGrid Battery Services Ltd'].id, service: 'Content Retainer',
      mrr: 1800, one_off: 0, close_date: addDays(t, -5), probability: 100, stage: STAGE.WON,
      notes: 'Monthly content retainer, signed.', is_seed: 1, updated_at: at(-5),
    },
    {
      company_id: byName['South East Climate Systems Ltd'].id, service: 'Content Retainer',
      mrr: 2400, one_off: 1200, close_date: addWorkingDays(t, 10), probability: 50, stage: STAGE.OFFER,
      notes: 'Monthly content plus a launch film.', is_seed: 1, updated_at: at(-1),
    },
    {
      company_id: byName['Metro EV Infrastructure Ltd'].id, service: 'Video Production',
      mrr: 3200, one_off: 0, close_date: addWorkingDays(t, 15), probability: 40, stage: STAGE.MEETING,
      notes: 'Depot rollout series.', is_seed: 1, updated_at: at(-3),
    },
    {
      company_id: byName['Apex Solar Solutions Ltd'].id, service: 'Video Production',
      mrr: 1600, one_off: 2000, close_date: addWorkingDays(t, 20), probability: 25, stage: STAGE.ENGAGED,
      notes: 'Project case study films.', is_seed: 1, updated_at: at(-2),
    },
  ]);

  return {
    skipped: false,
    companies: companies.length,
    contacts: contacts.length,
    activities: activities.length,
    followUps: followUps.length,
  };
}

/** Removes every seeded row. Anything you imported yourself is untouched. */
export async function clearSeed() {
  const tables = ['activities', 'follow_ups', 'opportunities', 'meetings', 'contacts', 'companies'];
  const out = {};
  const seedIds = (await select('companies', {
    columns: ['id'],
    where: [{ col: 'is_seed', op: 'eq', val: 1 }],
    limit: 5000,
  })).map(r => r.id);

  for (const table of tables) {
    out[table] = await remove(table, [{ col: 'is_seed', op: 'eq', val: 1 }]);
  }
  // Queue rows have no is_seed flag, so clear them by company.
  for (let i = 0; i < seedIds.length; i += 80) {
    const chunk = seedIds.slice(i, i + 80);
    if (chunk.length) await remove('call_queue', [{ col: 'company_id', op: 'in', val: chunk }]);
  }
  return out;
}
