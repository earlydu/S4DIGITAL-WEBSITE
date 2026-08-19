// The CRM data model, written once and rendered into two dialects.
//
// The same definitions produce SQLite DDL (local, node:sqlite) and Postgres DDL
// (the migration you paste into Supabase). Keeping one source stops the two
// databases drifting apart, which is the usual way a dual-driver app rots.
//
// Two rules keep the drivers interchangeable:
//   * ids are TEXT uuids generated in JS, never sequences
//   * flags are INTEGER 0/1 and timestamps are ISO TEXT, in both databases,
//     so a row read back through PostgREST looks identical to one read back
//     through SQLite. No per-driver coercion, no timezone surprises.

/** column types: 't' text, 'i' integer, 'r' real. Every table has id/created_at. */
export const TABLES = {
  users: {
    columns: {
      id: 't', email: 't', name: 't', password_hash: 't', pin_hash: 't',
      role: 't', token_version: 'i', active: 'i',
      created_at: 't', updated_at: 't', last_login_at: 't',
    },
    indexes: [['email']],
  },

  settings: {
    columns: { id: 't', value: 't', updated_at: 't' },
    indexes: [],
  },

  companies: {
    columns: {
      id: 't',
      name: 't', sector: 't', sub_sector: 't',
      location: 't', postcode: 't', region: 't', areas_served: 't',
      website: 't', domain: 't', logo_url: 't',
      main_phone: 't', phone_key: 't', general_email: 't',
      linkedin_company: 't', instagram: 't', facebook: 't',
      employees: 'i', founded: 'i', years_trading: 'i',
      google_reviews: 'i', google_rating: 'r',
      segment: 't',                    // commercial | residential | both
      key_services: 't',
      established_evidence: 't',
      marketing_opportunity: 't',
      lead_quality: 't',               // A | B | C
      source_urls: 't', source: 't', date_verified: 't',
      ask_for: 't',                    // job title to ask for when no name is known
      stage: 't',
      call_status: 't',                // new | no_answer | gatekeeper | contacted | wrong_number | not_interested
      closed_reason: 't',
      attempts: 'i', no_answer_count: 'i',
      last_contacted_at: 't', next_attempt_at: 't', next_follow_up_at: 't',
      est_mrr: 'r', est_one_off: 'r', probability: 'i',
      assigned_to: 't', notes: 't',
      excluded: 'i', exclusion_reason: 't', archived: 'i', is_seed: 'i',
      import_id: 't', search_blob: 't',
      created_at: 't', updated_at: 't', created_by: 't',
    },
    indexes: [
      ['stage'], ['lead_quality'], ['sector'], ['domain'], ['phone_key'],
      ['archived', 'excluded'], ['next_attempt_at'], ['is_seed'],
    ],
  },

  contacts: {
    columns: {
      id: 't', company_id: 't',
      first_name: 't', last_name: 't', job_title: 't',
      direct_phone: 't', direct_email: 't', linkedin: 't',
      is_primary: 'i', archived: 'i', is_seed: 'i', notes: 't',
      created_at: 't', updated_at: 't',
    },
    indexes: [['company_id'], ['is_seed']],
  },

  activities: {
    columns: {
      id: 't', company_id: 't', contact_id: 't', user_id: 't',
      type: 't',                       // call | email | linkedin | note | stage | meeting | system
      outcome: 't',
      note: 't', detail: 't',
      duration_s: 'i',
      recording_url: 't', transcript: 't',
      occurred_at: 't', created_at: 't', is_seed: 'i',
    },
    indexes: [['company_id'], ['occurred_at'], ['user_id'], ['is_seed']],
  },

  follow_ups: {
    columns: {
      id: 't', company_id: 't', contact_id: 't', user_id: 't',
      due_date: 't', due_time: 't', kind: 't',   // call | email | linkedin | other
      note: 't', status: 't',                    // pending | done | cancelled
      completed_at: 't', created_at: 't', updated_at: 't', is_seed: 'i',
    },
    indexes: [['due_date', 'status'], ['company_id'], ['is_seed']],
  },

  opportunities: {
    columns: {
      id: 't', company_id: 't', contact_id: 't',
      service: 't', mrr: 'r', one_off: 'r',
      close_date: 't', probability: 'i', stage: 't', notes: 't',
      created_at: 't', updated_at: 't', is_seed: 'i',
    },
    indexes: [['company_id'], ['stage'], ['is_seed']],
  },

  meetings: {
    columns: {
      id: 't', company_id: 't', contact_id: 't',
      date: 't', time: 't', kind: 't', notes: 't',
      created_at: 't', is_seed: 'i',
    },
    indexes: [['company_id'], ['date'], ['is_seed']],
  },

  exclusions: {
    columns: { id: 't', pattern: 't', reason: 't', created_at: 't' },
    indexes: [],
  },

  imports: {
    columns: {
      id: 't', filename: 't', user_id: 't',
      rows: 'i', added: 'i', updated: 'i', skipped: 'i',
      errors: 't', created_at: 't',
    },
    indexes: [['created_at']],
  },

  email_templates: {
    columns: {
      id: 't', name: 't', subject: 't', body: 't', sort: 'i',
      created_at: 't', updated_at: 't',
    },
    indexes: [],
  },

  call_queue: {
    columns: {
      id: 't', day: 't', user_id: 't', company_id: 't',
      position: 'i', reason: 't',
      status: 't',                     // pending | done | skipped
      completed_at: 't', created_at: 't',
    },
    indexes: [['day', 'user_id'], ['company_id']],
  },
};

/** Flags stored 0/1. Listed so the driver can normalise anything a browser sends. */
export const FLAG_COLUMNS = new Set([
  'active', 'excluded', 'archived', 'is_seed', 'is_primary',
]);

const SQLITE_TYPE = { t: 'TEXT', i: 'INTEGER', r: 'REAL' };
const PG_TYPE = { t: 'text', i: 'integer', r: 'double precision' };

const ddl = (types, quote) =>
  Object.entries(TABLES).map(([table, def]) => {
    const cols = Object.entries(def.columns)
      .map(([c, t]) => `  ${quote(c)} ${types[t]}${c === 'id' ? ' PRIMARY KEY' : ''}`)
      .join(',\n');
    const idx = def.indexes
      .map(cs => `CREATE INDEX IF NOT EXISTS ${'idx_' + table + '_' + cs.join('_')} ON ${quote(table)} (${cs.map(quote).join(', ')});`)
      .join('\n');
    return `CREATE TABLE IF NOT EXISTS ${quote(table)} (\n${cols}\n);\n${idx}`;
  }).join('\n\n');

const sqQuote = s => `"${s}"`;

export const sqliteDDL = () => ddl(SQLITE_TYPE, sqQuote);

/**
 * Postgres migration for Supabase. PostgREST cannot run DDL, so this is printed
 * by `node tools/crm.mjs migration` and pasted into the SQL editor once.
 * Row Level Security is enabled with no policies: the service role key bypasses
 * RLS, everything else (including the anon key the browser could reach) is denied.
 */
export function postgresDDL() {
  const tables = Object.keys(TABLES);
  return [
    '-- s4digital CRM schema. Run once in the Supabase SQL editor.',
    '-- The CRM talks to Postgres with the service role key from the server only.',
    '',
    ddl(PG_TYPE, sqQuote),
    '',
    '-- Deny everything that is not the service role.',
    ...tables.map(t => `ALTER TABLE "${t}" ENABLE ROW LEVEL SECURITY;`),
  ].join('\n');
}
