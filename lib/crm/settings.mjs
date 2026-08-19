// Everything configurable, with defaults that match how Earl actually works.
//
// Pipeline stages, sectors and services live here rather than in their own
// tables. They are short ordered lists that only ever get read whole, and a
// settings row makes them editable from the UI without a migration each time
// a stage is renamed. Companies store the stage as text, so a rename is a
// settings edit plus one bulk update, not a schema change.

import { first, put } from './db.mjs';

/**
 * Pipeline stages, named the way Alex Hormozi talks about a funnel: plain words
 * that say what is true about the person, not internal CRM jargon. A lead is a
 * lead until they engage, an engaged lead is not qualified until they have a
 * problem and the money to fix it, and a deal that does not close is usually
 * "not now" rather than lost.
 *
 * Referenced by name everywhere through this object, so a rename is one edit
 * here plus `node tools/crm.mjs migrate-stages`.
 */
export const STAGE = {
  NEW: 'New Lead',
  TO_CALL: 'To Call',
  REACHED_OUT: 'Reached Out',
  ENGAGED: 'Engaged',
  FOLLOW_UP: 'Follow Up',
  QUALIFIED: 'Qualified',
  MEETING: 'Meeting Booked',
  OFFER: 'Offer Made',
  WON: 'Client Won',
  NOT_NOW: 'Not Now',
};

export const STAGES = Object.values(STAGE);

/** Stages a prospect is no longer being dialled from. */
export const CLOSED_STAGES = [STAGE.WON, STAGE.NOT_NOW];

/**
 * What each stage means and what to do next. Shown on the board so the pipeline
 * reads as instructions rather than labels.
 */
export const STAGE_GUIDE = {
  [STAGE.NEW]: { means: 'Researched, never dialled', next: 'Call them' },
  [STAGE.TO_CALL]: { means: 'Queued up for today', next: 'Call them' },
  [STAGE.REACHED_OUT]: { means: 'Dialled, no human yet', next: 'Try again on the retry date' },
  [STAGE.ENGAGED]: { means: 'You spoke to a real person', next: 'Find out if they have a problem worth money' },
  [STAGE.FOLLOW_UP]: { means: 'Interested, wrong moment', next: 'Ring back on the date you agreed' },
  [STAGE.QUALIFIED]: { means: 'Real problem, real budget, decision maker', next: 'Book the meeting' },
  [STAGE.MEETING]: { means: 'Time in the diary', next: 'Turn up and diagnose' },
  [STAGE.OFFER]: { means: 'Price and scope are with them', next: 'Chase a yes or a no, not silence' },
  [STAGE.WON]: { means: 'Paying you', next: 'Deliver, then ask who else needs this' },
  [STAGE.NOT_NOW]: { means: 'No for now, rarely no forever', next: 'Park it and revisit in a few months' },
};

/** Rename map, so data written before a stage rename still lands in the right column. */
export const LEGACY_STAGES = {
  New: STAGE.NEW,
  Attempted: STAGE.REACHED_OUT,
  Contacted: STAGE.ENGAGED,
  Proposal: STAGE.OFFER,
  Won: STAGE.WON,
  Lost: STAGE.NOT_NOW,
};

export const SECTORS = [
  'HVAC',
  'Air Conditioning',
  'Commercial Heating',
  'Heat Pumps',
  'Solar',
  'Commercial Solar',
  'Battery Storage',
  'Renewable Energy',
  'EV Charging',
  'Commercial EV Charging',
  'EV Infrastructure',
];

/** Dashboard rollup. Every sector maps into one of four buckets. */
export const SECTOR_GROUPS = {
  HVAC: ['HVAC', 'Air Conditioning', 'Commercial Heating', 'Heat Pumps'],
  Solar: ['Solar', 'Commercial Solar', 'Renewable Energy'],
  Battery: ['Battery Storage'],
  EV: ['EV Charging', 'Commercial EV Charging', 'EV Infrastructure'],
};

export const SERVICES = [
  'Content Retainer', 'Social Media Management', 'Video Production',
  'Photography', 'Website', 'Paid Ads', 'SEO', 'Marketing Strategy', 'Custom',
];

/** Decision makers, best first. Drives "Ask for:" when no name was researched. */
export const CONTACT_PRIORITY = [
  'Founder', 'Owner', 'Managing Director', 'Commercial Director',
  'Marketing Director', 'Head of Marketing', 'Sales Director', 'Director',
];

export const PRIORITY_REGIONS = [
  'London', 'Greater London', 'Surrey', 'Kent', 'Essex', 'Hertfordshire', 'Berkshire',
];

/** Earl's current clients. Seeded once; editable from Settings afterwards. */
export const DEFAULT_EXCLUSIONS = [
  'Plug In Stations UK', 'Trade Electrical Distributors', 'TED', 'TED EV',
  'TED BMS', 'Super Efficient', 'TUK Ltd', 'NexBlue',
];

export const DEFAULTS = {
  targets: { daily: 100, weekly: 500, workingDays: [1, 2, 3, 4, 5] },

  retry: {
    noAnswerDays: 2,          // working days
    gatekeeperDays: 3,
    decisionMakerDays: 5,
    maxAttempts: 6,           // after this a prospect stops being surfaced
    skipReturnsAfterDays: 1,
  },

  script: {
    opener: 'Hi, is {{first_name}} around at all? It\'s Earl calling.',
    gatekeeper: 'No problem, when is the best time to catch {{first_name}}? I\'ll call back then.',
    decisionMaker: '{{first_name}}, Earl here from S4Digital. This is completely out of the blue, so I\'ll keep it short.',
    noName: 'Hi, could I speak to whoever looks after your marketing?',
  },

  stages: STAGES,
  sectors: SECTORS,
  services: SERVICES,
  priorityRegions: PRIORITY_REGIONS,

  leadQuality: {
    A: 'High priority. Established, strong fit, obvious marketing opportunity, looks capable of spending meaningful money on marketing.',
    B: 'Good prospect. Established legitimate company worth calling but fewer obvious buying signals.',
    C: 'Lower priority. Legitimate but smaller or a weaker fit.',
  },

  profile: {
    callerName: 'Earl',
    company: 'S4Digital',
    replyEmail: '',
    signature: 'Earl\nS4Digital',
  },

  ai: {
    // Off until keys exist and this is switched on. Both cost money per use.
    transcribeEnabled: false,
    draftEnabled: false,
    recordingNotice: 'Tell the other party the call is being recorded before you start. UK guidance expects it.',
  },
};

const KEY = 'app';

/** Shallow-merges each top level group so new defaults appear without a migration. */
export async function getSettings() {
  const row = await first('settings', { where: [{ col: 'id', op: 'eq', val: KEY }] });
  let saved = {};
  if (row && row.value) { try { saved = JSON.parse(row.value); } catch { saved = {}; } }
  const out = {};
  for (const [k, v] of Object.entries(DEFAULTS)) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v)
      ? { ...v, ...(saved[k] || {}) }
      : (saved[k] !== undefined ? saved[k] : v);
  }
  return out;
}

export async function saveSettings(patch) {
  const current = await getSettings();
  const next = { ...current };
  for (const [k, v] of Object.entries(patch || {})) {
    if (!(k in DEFAULTS)) continue;
    next[k] = v && typeof v === 'object' && !Array.isArray(v) ? { ...current[k], ...v } : v;
  }
  await put('settings', KEY, { value: JSON.stringify(next), updated_at: new Date().toISOString() });
  return next;
}

/** Which of the four dashboard buckets a sector falls in. */
export function sectorGroup(sector) {
  const s = String(sector || '').toLowerCase();
  for (const [group, members] of Object.entries(SECTOR_GROUPS)) {
    if (members.some(m => m.toLowerCase() === s)) return group;
  }
  if (/solar|renewab/.test(s)) return 'Solar';
  if (/batter|storage/.test(s)) return 'Battery';
  if (/\bev\b|charg/.test(s)) return 'EV';
  if (/hvac|air con|heat|climate|cooling/.test(s)) return 'HVAC';
  return 'Other';
}
