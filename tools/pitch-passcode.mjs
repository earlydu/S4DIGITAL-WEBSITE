// Set or change the passcode for a private pitch at /p/<slug>.
// Usage: node tools/pitch-passcode.mjs <slug> <passcode> ["Page title"]
// Changing a passcode signs out anyone who used the old one.
import { readFile, writeFile, appendFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashPasscode } from '../lib/pitch.mjs';

const [slug, code, title] = process.argv.slice(2);
if (!/^[a-z0-9-]+$/.test(slug || '') || !code) {
  console.error('Usage: node tools/pitch-passcode.mjs <slug> <passcode> ["Page title"]');
  process.exit(1);
}
const file = join(dirname(fileURLToPath(import.meta.url)), '..', 'private', 'pitches', 'pitches.json');
const all = JSON.parse(await readFile(file, 'utf8').catch(() => '{}'));
const salt = randomBytes(16).toString('hex');
all[slug] = { title: title || all[slug]?.title || 'Private pitch', salt, hash: hashPasscode(code, salt) };
await writeFile(file, JSON.stringify(all, null, 2) + '\n');

// Keep a readable copy of every PIN next to the repo, never inside it.
const pins = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'PITCH PINS.txt');
const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
await appendFile(pins, `${all[slug].title}  |  https://s4digi.com/p/${slug}  |  PIN ${code}  |  set ${date}\n`);
console.log(`Passcode set for /p/${slug} (saved in PITCH PINS.txt)`);
