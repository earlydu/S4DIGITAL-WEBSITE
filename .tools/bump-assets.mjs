// Cache busting without a build step.
//
// /assets is cached for a week, which is right for images but meant a returning
// visitor kept stale CSS and JS long after a deploy. Stamping the URL with a
// version means the long cache stays and updates land immediately, because a
// changed URL is simply a different file as far as the browser is concerned.
//
// Run this whenever site.css, site.js or work.js changes:
//   node .tools/bump-assets.mjs
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
const TARGET = /(\/assets\/(?:site|work|form|post|admin)\.(?:css|js))(\?v=[0-9]+)?/g;

// Root pages plus the server-rendered templates (blog, post, case study).
const pages = readdirSync('.').filter(f => f.endsWith('.html'))
  .concat(readdirSync('templates').filter(f => f.endsWith('.html')).map(f => 'templates/' + f));
let touched = 0, refs = 0;

for (const page of pages) {
  const before = readFileSync(page, 'utf8');
  const after = before.replace(TARGET, (_, path) => { refs++; return path + '?v=' + stamp; });
  if (after !== before) { writeFileSync(page, after); touched++; }
}

console.log(`stamped ${refs} references across ${touched} pages -> v=${stamp}`);
