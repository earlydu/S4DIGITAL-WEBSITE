/* Ingest the finished Super Efficient social cuts into the case study.
 *
 * Drop the FINAL exports (the last version marked with a check in the Notion task)
 * into  video_content/Videos from notion/  then run:
 *
 *   node tools/ingest-se-socials.mjs
 *
 * Matching is on keywords in the filename, so the VA export names work as they are.
 * Each match is compressed for web, given a poster frame, and written into
 * content/work.json under the super-efficient-drainage case study.
 * Vertical files are flagged so the page lays them out as 9:16.
 */
import fs from 'fs';
import { execFileSync } from 'child_process';

const SRC_DIR = 'video_content/Videos from notion';
const OUT_DIR = 'video_content/gallery';
const SLUG = 'super-efficient-drainage';

// keyword (lowercase, matched against the filename) -> how it appears on the site
const PIECES = [
  { match: ['moment', 'clears'],       out: 'se-moment-it-clears',     title: 'The moment it clears' },
  { match: ['actually', 'down there'], out: 'se-what-was-down-there',  title: 'What was actually down there' },
  { match: ['asmr', 'sound on'],       out: 'se-sound-on',             title: 'Sound on, no music' },
  { match: ['big 3', 'big three'],     out: 'se-the-big-three',        title: 'The three things that block every drain' },
  { match: ['planned', 'emergency'],   out: 'se-planned-vs-emergency', title: 'Planned maintenance vs the emergency call' },
  { match: ['industry'],               out: 'se-the-industry',         title: 'The industry, from the two doing the job' },
];

const ff = (args) => execFileSync('ffmpeg', ['-loglevel', 'error', ...args], { stdio: 'inherit' });
const probe = (f) => execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0',
  '-show_entries', 'stream=width,height', '-of', 'csv=p=0', f]).toString().trim().split(',').map(Number);

if (!fs.existsSync(SRC_DIR)) { console.error('No source folder: ' + SRC_DIR); process.exit(1); }
const files = fs.readdirSync(SRC_DIR).filter(f => f.toLowerCase().endsWith('.mp4'));

const data = JSON.parse(fs.readFileSync('content/work.json', 'utf8'));
const item = data.items.find(x => x.slug === SLUG);
if (!item) { console.error('Case study not found: ' + SLUG); process.exit(1); }

const added = [];
for (const piece of PIECES) {
  // newest matching file wins, so a re-export supersedes an earlier one
  const hits = files
    .filter(f => piece.match.some(k => f.toLowerCase().includes(k)))
    .map(f => ({ f, m: fs.statSync(SRC_DIR + '/' + f).mtimeMs }))
    .sort((a, b) => b.m - a.m);
  if (!hits.length) { console.log('skip (not found): ' + piece.title); continue; }

  const src = SRC_DIR + '/' + hits[0].f;
  const [w, h] = probe(src);
  const vertical = h > w;
  const mp4 = OUT_DIR + '/' + piece.out + '.mp4';
  const jpg = OUT_DIR + '/' + piece.out + '.jpg';

  ff(['-i', src, '-vf', vertical ? 'scale=720:1280' : 'scale=1280:720',
      '-c:v', 'libx264', '-crf', '23', '-preset', 'slow',
      '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', mp4, '-y']);
  ff(['-ss', '00:00:01', '-i', mp4, '-frames:v', '1', '-q:v', '4', jpg, '-y']);

  const entry = { src: mp4, poster: jpg, title: piece.title };
  if (vertical) entry.vertical = true;

  item.videos = (item.videos || []).filter(v => v.src !== entry.src);
  item.videos.push(entry);
  added.push(piece.title + ' (' + (vertical ? '9:16' : '16:9') + ') from ' + hits[0].f);
}

fs.writeFileSync('content/work.json', JSON.stringify(data, null, 2) + '\n');
console.log('\nAdded ' + added.length + ':');
added.forEach(a => console.log('  ' + a));
