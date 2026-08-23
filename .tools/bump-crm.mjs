// Cache busting for the CRM module tree.
//
// bump-assets.mjs stamps the standalone site scripts. It cannot help here,
// because the CRM is a graph of ES modules that import each other by bare
// relative specifier. /assets is cached for a week, so bumping only
// `app.js?v=N` in sales.html busts app.js and nothing it imports: the browser
// happily keeps last week's nav.js, and a newly added view is simply never
// routed to. That is exactly what happened when the Email tab was added.
//
// So every intra-module specifier gets the same stamp. The same stamp matters
// as much as the stamp itself: a module's URL is its identity, so if app.js
// asked for './nav.js?v=8' while a view asked for './nav.js', the two would be
// separate instances with separate listeners. One number, applied everywhere.
//
//   node .tools/bump-crm.mjs          # stamp with today's date and time
//   node .tools/bump-crm.mjs 9        # or a number you choose
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'assets/crm';
const ENTRY = 'sales.html';
const stamp = process.argv[2] || new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');

// './thing.js' or './thing.js?v=anything', in both static and dynamic imports
const SPEC = /(['"])\.\/([a-z0-9-]+\.js)(?:\?v=[^'"]*)?\1/g;

let files = 0, refs = 0;
for (const name of readdirSync(DIR).filter(f => f.endsWith('.js'))) {
  const path = join(DIR, name);
  const before = readFileSync(path, 'utf8');
  let hits = 0;
  const after = before.replace(SPEC, (_m, q, file) => {
    hits++;
    return `${q}./${file}?v=${stamp}${q}`;
  });
  if (after !== before) {
    writeFileSync(path, after);
    files++;
    refs += hits;
  }
}

// and the one <script> tag that pulls the whole graph in
const page = readFileSync(ENTRY, 'utf8');
const updated = page.replace(/(\/assets\/crm\/app\.js)(\?v=[^"']*)?/g, `$1?v=${stamp}`);
if (updated !== page) writeFileSync(ENTRY, updated);

console.log(`stamped v=${stamp}`);
console.log(`  ${refs} import(s) across ${files} module(s)`);
console.log(`  ${updated !== page ? ENTRY + ' updated' : ENTRY + ' already current'}`);
console.log('');
console.log('Run this whenever anything in assets/crm changes, then commit the lot.');
