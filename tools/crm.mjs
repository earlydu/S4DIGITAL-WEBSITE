#!/usr/bin/env node
// CRM command line. Everything you need to set the thing up and look after it.
//
//   node tools/crm.mjs migration                 print the Postgres schema for Supabase
//   node tools/crm.mjs init                      create the local SQLite database
//   node tools/crm.mjs create-user               create an account (prompts, hidden input)
//   node tools/crm.mjs list-users
//   node tools/crm.mjs set-password <email>
//   node tools/crm.mjs set-pin <email>
//   node tools/crm.mjs seed                      load the fictional sample data
//   node tools/crm.mjs clear-seed                remove it again
//   node tools/crm.mjs import <file.csv> [--update]
//   node tools/crm.mjs stats
//
// It talks to whichever database the environment points at: Supabase if
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set, otherwise local SQLite.

import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { createInterface } from 'node:readline';
import { stdin, stdout, argv, exit, env } from 'node:process';

import { init, driver, select, count, first } from '../lib/crm/db.mjs';
import * as auth from '../lib/crm/auth.mjs';
import { postgresDDL } from '../lib/crm/schema.mjs';
import { seed, clearSeed } from '../lib/crm/seed.mjs';
import { runImport, FIELDS } from '../lib/crm/importer.mjs';

const [, , cmd, ...rest] = argv;

const say = (...a) => console.log(...a);
const die = m => { console.error(`\n  ${m}\n`); exit(1); };

/* --------------------------------------------------------------- prompting */

function ask(question, { hidden = false } = {}) {
  return new Promise(resolve => {
    const rl = createInterface({ input: stdin, output: stdout, terminal: true });
    if (!hidden) {
      rl.question(question, answer => { rl.close(); resolve(answer.trim()); });
      return;
    }
    // Hidden input: write the prompt, then suppress the echo of what is typed.
    stdout.write(question);
    const onData = () => { /* muted by the write override below */ };
    const original = stdout.write.bind(stdout);
    stdout.write = (chunk, ...args) => {
      const s = String(chunk);
      if (s.includes('\n') || s.includes('\r')) return original(chunk, ...args);
      return true;
    };
    stdin.on('data', onData);
    rl.question('', answer => {
      stdout.write = original;
      stdin.off('data', onData);
      stdout.write('\n');
      rl.close();
      resolve(answer.trim());
    });
  });
}

/* ------------------------------------------------------------------- CSV in */

/** Small RFC4180 reader. Handles quotes, embedded commas and newlines. */
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i += 1; }
        else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') { quoted = true; continue; }
    if (c === ',') { row.push(field); field = ''; continue; }
    if (c === '\r') continue;
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(v => String(v).trim() !== ''));
}

const normHeader = h => String(h || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Best guess at which CRM field each column is, using the alias table. */
function autoMap(headers) {
  const map = {};
  headers.forEach((h, i) => {
    const n = normHeader(h);
    if (!n) return;
    const exact = FIELDS.find(f => normHeader(f.key) === n || normHeader(f.label) === n);
    if (exact) { map[i] = exact.key; return; }
    const alias = FIELDS.find(f => (f.aliases || []).some(a => normHeader(a) === n));
    if (alias) map[i] = alias.key;
  });
  return map;
}

/* -------------------------------------------------------------- the commands */

async function main() {
  if (!cmd || cmd === 'help' || cmd === '--help') {
    say(`
  s4digital CRM

    node tools/crm.mjs migration              Postgres schema to paste into Supabase
    node tools/crm.mjs init                   create the local SQLite database
    node tools/crm.mjs create-user            create an account
    node tools/crm.mjs list-users
    node tools/crm.mjs set-password <email>
    node tools/crm.mjs set-pin <email>
    node tools/crm.mjs seed | clear-seed      fictional sample data
    node tools/crm.mjs import <file.csv> [--update]
    node tools/crm.mjs stats
`);
    return;
  }

  if (cmd === 'migration') { say(postgresDDL()); return; }

  const where = await init();
  if (cmd !== 'init') say(`  database: ${where}\n`);

  switch (cmd) {
    case 'init':
      say(`  Ready. Driver: ${driver()}.`);
      if (driver() === 'sqlite') say('  Local database at .data/crm.db (gitignored).');
      else say('  Talking to Supabase. Run "node tools/crm.mjs migration" first if you have not.');
      return;

    case 'create-user': {
      if (!auth.configured()) {
        die('Set CRM_SESSION_SECRET (or ADMIN_PASSWORD) first, or the sessions cannot be signed.');
      }
      const email = rest[0] || await ask('  Email: ');
      const name = await ask('  Name: ');
      const password = await ask('  Password (10+ characters, hidden): ', { hidden: true });
      const confirm = await ask('  Confirm password: ', { hidden: true });
      if (password !== confirm) die('Those passwords do not match.');
      const pin = await ask('  Quick unlock PIN, 4 to 8 digits (blank for none): ');
      const isFirst = !(await auth.anyUsers());
      const user = await auth.createUser({
        email, name, password, pin: pin || null, role: isFirst ? 'owner' : 'user',
      });
      say(`\n  Created ${user.email} (${user.role}). Sign in at /crm.\n`);
      return;
    }

    case 'list-users': {
      const users = await auth.listUsers();
      if (!users.length) { say('  No accounts yet. Run: node tools/crm.mjs create-user'); return; }
      for (const u of users) {
        say(`  ${u.active ? ' ' : 'x'} ${u.email.padEnd(32)} ${String(u.role).padEnd(6)} ` +
            `${u.pin_hash ? 'PIN' : '   '}  last in ${u.last_login_at ? u.last_login_at.slice(0, 16).replace('T', ' ') : 'never'}`);
      }
      return;
    }

    case 'set-password': {
      const email = rest[0] || await ask('  Email: ');
      const user = await auth.findByEmail(email);
      if (!user) die(`No account for ${email}.`);
      const password = await ask('  New password (10+ characters, hidden): ', { hidden: true });
      const confirm = await ask('  Confirm: ', { hidden: true });
      if (password !== confirm) die('Those passwords do not match.');
      await auth.setPassword(user.id, password);
      say('\n  Done. Every signed-in device has been signed out.\n');
      return;
    }

    case 'set-pin': {
      const email = rest[0] || await ask('  Email: ');
      const user = await auth.findByEmail(email);
      if (!user) die(`No account for ${email}.`);
      const pin = await ask('  New PIN, 4 to 8 digits (blank to remove): ');
      await auth.setPin(user.id, pin || null);
      say('\n  Done.\n');
      return;
    }

    case 'seed': {
      const owner = (await auth.listUsers())[0];
      const out = await seed({ userId: owner && owner.id });
      say(out.skipped ? `  ${out.message}` : `  Loaded ${out.companies} sample companies, ${out.contacts} contacts, ${out.activities} activities, ${out.followUps} follow-ups.`);
      return;
    }

    case 'clear-seed': {
      const out = await clearSeed();
      say('  Removed: ' + Object.entries(out).map(([k, v]) => `${v} ${k}`).join(', '));
      return;
    }

    case 'import': {
      const file = rest.find(a => !a.startsWith('--'));
      if (!file) die('Which file? node tools/crm.mjs import prospects.csv');
      const mode = rest.includes('--update') ? 'update' : 'add';
      const rows = parseCSV(readFileSync(file, 'utf8'));
      if (rows.length < 2) die('That file has no data rows.');

      const headers = rows[0];
      const map = autoMap(headers);
      const mapped = Object.entries(map);
      if (!mapped.some(([, k]) => k === 'name')) {
        say('  Columns found: ' + headers.join(' | '));
        die('No column looks like the company name. Rename it to "Company Name" and try again, or use the Import screen at /crm which lets you map columns by hand.');
      }

      say('  Mapping:');
      headers.forEach((h, i) => say(`    ${String(h).slice(0, 34).padEnd(36)} -> ${map[i] || '(ignored)'}`));

      const objects = rows.slice(1).map(r => {
        const o = {};
        for (const [i, key] of mapped) o[key] = r[Number(i)];
        return o;
      });

      const owner = (await auth.listUsers())[0];
      const out = await runImport({
        rows: objects, mode, filename: basename(file), userId: owner && owner.id,
      });
      say(`\n  ${out.rows} rows: ${out.added} added, ${out.updated} updated, ${out.skipped} skipped, ${out.errors.length} errors.\n`);
      return;
    }

    case 'stats': {
      const rows = [
        ['prospects', await count('companies', {})],
        ['  callable', await count('companies', { where: [
          { col: 'archived', op: 'eq', val: 0 },
          { col: 'excluded', op: 'eq', val: 0 },
          { col: 'stage', op: 'nin', val: ['Won', 'Lost'] },
        ] })],
        ['  excluded', await count('companies', { where: [{ col: 'excluded', op: 'eq', val: 1 }] })],
        ['  archived', await count('companies', { where: [{ col: 'archived', op: 'eq', val: 1 }] })],
        ['  sample data', await count('companies', { where: [{ col: 'is_seed', op: 'eq', val: 1 }] })],
        ['contacts', await count('contacts', {})],
        ['activities', await count('activities', {})],
        ['follow-ups pending', await count('follow_ups', { where: [{ col: 'status', op: 'eq', val: 'pending' }] })],
        ['opportunities', await count('opportunities', {})],
        ['accounts', await count('users', {})],
      ];
      for (const [k, v] of rows) say(`  ${String(k).padEnd(22)} ${v}`);
      return;
    }

    default:
      die(`Unknown command: ${cmd}. Try "node tools/crm.mjs help".`);
  }
}

main().catch(err => die(err.stack || err.message));
