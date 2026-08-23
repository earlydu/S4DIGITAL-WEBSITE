# -*- coding: utf-8 -*-
"""Build the s4digital sales desk.

Same pipeline as the EV desk, which works: a daily slate at the top, everything else
moving itself between stages as you work. Three touches instead of two, geography
first because the work is in person, and a creature that grows as you land things.

Points are weighted to what actually earns money, not to activity. Sending an email
is worth one. A client is worth a hundred.
"""
import csv, json, html, os, sys
sys.stdout.reconfigure(encoding='utf-8')

rows = json.load(open('sequence.json', encoding='utf-8'))

DAILY_TARGET   = 5
CHASE_1_DAYS   = 4      # first follow-up
CHASE_2_DAYS   = 7      # second, counted from the first follow-up
WORKDIR        = os.getcwd()
WORKDIR_JS     = WORKDIR.replace(chr(92), chr(92) * 2)

POINTS = {'sent': 1, 'chase': 1, 'reply': 5, 'interested': 15, 'call': 30, 'client': 100}

# what the creature is called as it grows, and what it gains at each stage
STAGES = [
    (0,    'Speck',      'a dot with ambition'),
    (25,   'Flicker',    'it has eyes now'),
    (75,   'Lumen',      'up on its feet'),
    (175,  'Beam',       'reaching for things'),
    (350,  'Beacon',     'people can see it coming'),
    (700,  'Floodlight', 'lights the whole room'),
]

PIPE = [
    ('today',   'Today',      'Nothing left today. Come back tomorrow.'),
    ('waiting', 'Waiting',    'Nothing out with anyone yet.'),
    ('later',   'Later',      'Nobody left to contact.'),
    ('won',     'Interested', 'No yeses yet.'),
    ('lost',    'No thanks',  'Nobody has said no.'),
]

NOTES = {
    'today':   'Chases first, then the next best names. Clear it and stop.',
    'waiting': 'Sent, no answer yet. The chase clock is running.',
    'later':   'Queued behind today. London first, because you shoot in person.',
    'won':     'Get a date in. Do not talk price over email.',
    'lost':    'Closed off. Kept so you do not approach them twice.',
}

CSS = """
:root{
  --paper:#EFEFEC; --raised:#F7F7F5; --ink:#16181A; --ink-soft:#4E5356; --ink-faint:#83888B;
  --rule:#D2D3CE; --rule-soft:#E2E3DF;
  --blue:#2E9CFF; --blue-soft:#DCEDFF;
  --plum:#6B4C7A; --moss:#4F6B45; --moss-soft:#DFE8DA;
  --amber:#9A6B18; --amber-soft:#F4E9D2;
}
@media (prefers-color-scheme: dark){
  :root:not([data-theme="light"]){
    --paper:#141618; --raised:#1C1F22; --ink:#E8EAEA; --ink-soft:#A6ACAF; --ink-faint:#7B8184;
    --rule:#2C3134; --rule-soft:#232729;
    --blue:#59B0FF; --blue-soft:#16283A;
    --plum:#B58FC4; --moss:#9CB88E; --moss-soft:#1D2619;
    --amber:#D9A94E; --amber-soft:#2C2415;
  }
}
:root[data-theme="dark"]{
  --paper:#141618; --raised:#1C1F22; --ink:#E8EAEA; --ink-soft:#A6ACAF; --ink-faint:#7B8184;
  --rule:#2C3134; --rule-soft:#232729;
  --blue:#59B0FF; --blue-soft:#16283A;
  --plum:#B58FC4; --moss:#9CB88E; --moss-soft:#1D2619;
  --amber:#D9A94E; --amber-soft:#2C2415;
}
*{box-sizing:border-box}
body{margin:0; background:var(--paper); color:var(--ink);
  font-family:"Satoshi","Inter",-apple-system,"Segoe UI",Helvetica,Arial,sans-serif;
  font-size:16px; line-height:1.55; -webkit-font-smoothing:antialiased}
.wrap{max-width:1060px; margin:0 auto; padding:0 24px 110px}
h1{font-family:"Satoshi",sans-serif; font-size:clamp(28px,4.2vw,42px); font-weight:900;
  letter-spacing:-.03em; line-height:1.02; margin:0}
.mono{font-family:ui-monospace,"SF Mono",Consolas,monospace}

header.top{padding:38px 0 0}
.eyebrow{font-family:ui-monospace,Consolas,monospace; font-size:11px; letter-spacing:.16em;
  text-transform:uppercase; color:var(--blue); margin-bottom:13px; font-weight:600}
.lede{max-width:58ch; margin:13px 0 0; color:var(--ink-soft); font-size:15px}
.lede strong{color:var(--ink); font-weight:600}

/* ---------- the creature ---------- */
#pet{margin:26px 0 0; border:1px solid var(--rule); border-radius:3px; background:var(--raised);
  display:grid; grid-template-columns:180px minmax(0,1fr); gap:0}
#pet-art{border-right:1px solid var(--rule-soft); display:flex; align-items:center;
  justify-content:center; padding:18px 10px; background:
  radial-gradient(circle at 50% 62%, var(--blue-soft), transparent 66%)}
#pet-art svg{width:130px; height:130px; overflow:visible}
.pet-body{padding:20px 24px}
.pet-name{font-family:"Satoshi",sans-serif; font-size:26px; font-weight:800; letter-spacing:-.02em;
  line-height:1.05; margin:0}
.pet-sub{font-size:13.5px; color:var(--ink-faint); margin:2px 0 14px; font-style:italic}
.xp-row{display:flex; align-items:baseline; gap:10px; margin-bottom:7px}
.xp-now{font-family:"Satoshi",sans-serif; font-size:22px; font-weight:800;
  font-variant-numeric:tabular-nums; color:var(--blue)}
.xp-goal{font-family:ui-monospace,Consolas,monospace; font-size:11.5px; color:var(--ink-faint);
  letter-spacing:.05em}
.xp-track{height:9px; background:var(--rule); border-radius:5px; overflow:hidden}
.xp-fill{height:100%; background:var(--blue); width:0%; transition:width .5s cubic-bezier(.2,.8,.2,1)}
#pet[data-max="1"] .xp-fill{background:var(--moss)}
#pet[data-max="1"] .xp-now{color:var(--moss)}
.pet-stats{display:flex; gap:22px; margin-top:15px; flex-wrap:wrap}
.pet-stat b{display:block; font-family:"Satoshi",sans-serif; font-size:19px; font-weight:800;
  font-variant-numeric:tabular-nums; line-height:1.1}
.pet-stat i{font-style:normal; font-family:ui-monospace,Consolas,monospace; font-size:10px;
  letter-spacing:.09em; text-transform:uppercase; color:var(--ink-faint)}

/* ---------- today ---------- */
#board{margin:12px 0 0; border:1px solid var(--rule); border-left:4px solid var(--blue);
  background:var(--raised); padding:20px 24px; display:flex; flex-wrap:wrap; gap:24px;
  align-items:flex-end; justify-content:space-between}
#board[data-done="1"]{border-left-color:var(--moss)}
#t-head{font-family:"Satoshi",sans-serif; font-size:clamp(21px,2.9vw,29px); font-weight:800;
  letter-spacing:-.02em; margin:0 0 4px; line-height:1.08}
#board[data-done="1"] #t-head{color:var(--moss)}
#t-sub{font-size:14px; color:var(--ink-soft); margin:0; max-width:50ch}
.ticks{display:flex; gap:4px; margin-bottom:8px}
.tick{width:16px; height:6px; border-radius:1px; background:var(--rule)}
.tick.on{background:var(--blue)}
#board[data-done="1"] .tick.on{background:var(--moss)}
.target{display:flex; gap:5px; align-items:center; margin-top:12px}
.target span{font-family:ui-monospace,Consolas,monospace; font-size:10px; letter-spacing:.09em;
  text-transform:uppercase; color:var(--ink-faint); margin-right:2px}
button.t{font-family:ui-monospace,Consolas,monospace; font-size:11px; padding:4px 9px;
  border:1px solid var(--rule); background:transparent; color:var(--ink-soft); border-radius:2px;
  cursor:pointer; font-variant-numeric:tabular-nums}
button.t[aria-pressed="true"]{background:var(--ink); border-color:var(--ink); color:var(--paper)}

.pipe{display:flex; gap:5px; margin:12px 0 0; flex-wrap:wrap}
.seg{flex:1 1 118px; border:1px solid var(--rule); border-radius:2px; background:transparent;
  padding:11px 13px; text-align:left; cursor:pointer; font:inherit; color:inherit; transition:.15s}
.seg:hover{border-color:var(--ink-faint)}
.seg b{display:block; font-family:"Satoshi",sans-serif; font-size:26px; font-weight:800;
  line-height:1; font-variant-numeric:tabular-nums; margin-bottom:6px}
.seg i{font-style:normal; font-family:ui-monospace,Consolas,monospace; font-size:10px;
  letter-spacing:.09em; text-transform:uppercase; color:var(--ink-faint)}
.seg[data-empty="1"]{opacity:.4}
.seg[data-seg="today"] b{color:var(--blue)}
.seg[data-seg="waiting"] b{color:var(--plum)}
.seg[data-seg="won"] b{color:var(--moss)}
.seg[data-seg="later"] b, .seg[data-seg="lost"] b{color:var(--ink-faint)}

.filters{display:flex; gap:6px; flex-wrap:wrap; margin-top:14px; align-items:center}
button.f{font-family:ui-monospace,Consolas,monospace; font-size:10.5px; letter-spacing:.07em;
  text-transform:uppercase; padding:6px 11px; border:1px solid var(--rule); background:transparent;
  color:var(--ink-soft); border-radius:2px; cursor:pointer}
button.f[aria-pressed="true"]{background:var(--ink); border-color:var(--ink); color:var(--paper)}

section.stage{margin-top:40px; scroll-margin-top:16px}
section.stage > h2{font-family:"Satoshi",sans-serif; font-size:21px; font-weight:800;
  letter-spacing:-.02em; margin:0 0 3px; display:flex; align-items:baseline; gap:9px}
section.stage > h2 span{font-family:ui-monospace,Consolas,monospace; font-size:12px;
  font-weight:400; color:var(--ink-faint)}
.stage-note{font-size:14px; color:var(--ink-soft); margin:0 0 4px; max-width:62ch}
.empty{font-family:ui-monospace,Consolas,monospace; font-size:11.5px; color:var(--ink-faint);
  padding:13px 0; border-top:1px solid var(--rule-soft)}
ol.stack{list-style:none; margin:9px 0 0; padding:0; border-top:1px solid var(--rule)}

li.row{display:grid; grid-template-columns:34px minmax(0,1fr); gap:0 14px; padding:15px 0;
  border-bottom:1px solid var(--rule-soft); align-items:start}
.rank{font-family:ui-monospace,Consolas,monospace; font-size:12px; color:var(--ink-faint);
  font-variant-numeric:tabular-nums; padding-top:3px}
.name{font-family:"Satoshi",sans-serif; font-size:17.5px; font-weight:700; letter-spacing:-.012em;
  margin-bottom:3px}
.meta{font-family:ui-monospace,Consolas,monospace; font-size:11px; color:var(--ink-faint);
  margin-bottom:6px}
.meta .to{color:var(--blue)}
.meta .reg{color:var(--moss); font-weight:600}
.meta .far{color:var(--amber)}
.obs{font-size:14.5px; color:var(--ink-soft); margin:0 0 10px; max-width:60ch}
.obs b{color:var(--ink); font-weight:600}
.state{font-family:ui-monospace,Consolas,monospace; font-size:10.5px; letter-spacing:.07em;
  text-transform:uppercase; margin:0 0 8px; color:var(--ink-faint)}
.state b{font-weight:700}
.state.awaiting b{color:var(--plum)}
.state.due b{color:var(--amber)}
.state.won b{color:var(--moss)}
li.row.compact .obs, li.row.compact details{display:none}
li.row.compact{padding:11px 0}
li.row.lost{opacity:.45}
li.row.lost .name{text-decoration:line-through}
li.row.won-row{background:linear-gradient(90deg,var(--moss-soft),transparent 60%)}

.acts{display:flex; flex-wrap:wrap; gap:6px; align-items:center}
.acts .sep{width:1px; height:18px; background:var(--rule); margin:0 3px}
a.go,button.go{font-family:ui-monospace,Consolas,monospace; font-size:10.5px; letter-spacing:.06em;
  text-transform:uppercase; padding:7px 12px; border-radius:2px; border:1px solid transparent;
  cursor:pointer; text-decoration:none; white-space:nowrap; transition:.14s}
a.go.primary{background:var(--blue); color:#08131D; font-weight:700}
a.go.chase{background:var(--amber); color:var(--paper); font-weight:700}
a.go:hover{filter:brightness(1.1)}
button.go.ghost,a.go.ghost{background:transparent; border-color:var(--rule); color:var(--ink-soft)}
button.go.ghost:hover,a.go.ghost:hover{border-color:var(--ink-faint); color:var(--ink)}
button.go.win[aria-pressed="true"]{background:var(--moss); border-color:var(--moss); color:var(--paper); font-weight:700}
button.go.no[aria-pressed="true"]{background:var(--ink); border-color:var(--ink); color:var(--paper)}
button.go.on[aria-pressed="true"]{background:var(--plum); border-color:var(--plum); color:var(--paper); font-weight:700}

details{margin-top:9px; max-width:64ch}
summary{font-family:ui-monospace,Consolas,monospace; font-size:10.5px; letter-spacing:.06em;
  text-transform:uppercase; color:var(--ink-faint); cursor:pointer}
summary:hover{color:var(--ink)}
details pre{background:var(--raised); border-left:3px solid var(--rule); margin:9px 0 0;
  padding:13px 15px; font-family:ui-monospace,Consolas,monospace; font-size:12px; line-height:1.6;
  white-space:pre-wrap; overflow-x:auto; color:var(--ink-soft)}

.toast{position:fixed; left:50%; bottom:24px; transform:translateX(-50%) translateY(12px);
  background:var(--ink); color:var(--paper); padding:10px 18px; border-radius:3px;
  font-family:ui-monospace,Consolas,monospace; font-size:12px; opacity:0; pointer-events:none;
  transition:.18s; z-index:30}
.toast.on{opacity:1; transform:translateX(-50%) translateY(0)}
.levelup{position:fixed; inset:0; display:none; align-items:center; justify-content:center;
  background:rgba(0,0,0,.55); z-index:40}
.levelup.on{display:flex}
.levelup-card{background:var(--raised); border:1px solid var(--rule); border-radius:4px;
  padding:34px 40px; text-align:center; max-width:360px}
.levelup-card svg{width:150px; height:150px; overflow:visible}
.levelup-card h3{font-family:"Satoshi",sans-serif; font-size:28px; font-weight:900; margin:12px 0 4px;
  letter-spacing:-.02em}
.levelup-card p{color:var(--ink-soft); margin:0 0 18px; font-size:14px}

footer{margin-top:60px; padding-top:16px; border-top:1px solid var(--rule); display:flex; gap:8px;
  flex-wrap:wrap}
@media (max-width:760px){
  #pet{grid-template-columns:1fr}
  #pet-art{border-right:0; border-bottom:1px solid var(--rule-soft)}
  li.row{grid-template-columns:26px minmax(0,1fr)}
}
@media (prefers-reduced-motion:reduce){*{transition:none !important; animation:none !important}}
"""


def esc(x):
    return html.escape(str(x or ''))


def row_html(r):
    rank = r['rank']
    far = r['region'] == 'Too far'
    reg_cls = 'far' if far else 'reg'
    meta = ' &nbsp;/&nbsp; '.join(x for x in [
        '<span class="%s">%s</span>' % (reg_cls, esc(r['region'])),
        esc(r['location']) or esc(r['postcode']),
        esc(r['sector']),
        'Grade ' + esc(r['quality']),
        '<span class="to">%s</span>' % esc(r['email']),
    ] if x)

    obs = '<p class="obs"><b>%s</b></p>' % esc(r['observation']) if r['observation'] else ''

    acts = [
        '<a class="go primary" href="#" data-open="1" data-rank="%d">Draft email</a>' % rank,
        '<a class="go chase" href="#" data-open="2" data-rank="%d" data-role="c1" hidden>'
        'Follow-up 1</a>' % rank,
        '<a class="go chase" href="#" data-open="3" data-rank="%d" data-role="c2" hidden>'
        'Follow-up 2</a>' % rank,
        '<button class="go ghost" data-cmd="%d">Copy command</button>' % rank,
    ]
    if r['website']:
        acts.append('<a class="go ghost" href="%s" target="_blank" rel="noopener">Site</a>'
                    % esc(r['website']))
    if r['instagram']:
        acts.append('<a class="go ghost" href="https://instagram.com/%s" target="_blank" '
                    'rel="noopener">IG</a>' % esc(r['instagram']))
    acts += [
        '<span class="sep"></span>',
        '<button class="go ghost on" data-set="replied" data-rank="%d" aria-pressed="false">'
        'Replied</button>' % rank,
        '<button class="go ghost win" data-set="interested" data-rank="%d" aria-pressed="false">'
        'Interested</button>' % rank,
        '<button class="go ghost win" data-set="client" data-rank="%d" aria-pressed="false">'
        'Client</button>' % rank,
        '<button class="go ghost no" data-set="no" data-rank="%d" aria-pressed="false">'
        'No</button>' % rank,
    ]

    pre = ('<details><summary>Read all three</summary>'
           '<pre>%s\n\n%s</pre><pre>FOLLOW-UP 1\n\n%s</pre><pre>FOLLOW-UP 2\n\n%s</pre></details>'
           % (esc(r['touch1']['subject']), esc(r['touch1']['body']),
              esc(r['touch2']['body']), esc(r['touch3']['body'])))

    return ('<li class="row" data-rank="%d" data-region="%s" data-grade="%s" data-sector="%s">'
            '<div class="rank">%03d</div>'
            '<div><div class="name">%s</div><div class="meta">%s</div>'
            '<p class="state" data-state></p>%s'
            '<div class="acts">%s</div>%s</div></li>'
            ) % (rank, esc(r['region']), esc(r['quality']), esc(r['sector']), rank,
                 esc(r['company']), meta, obs, ''.join(acts), pre)


payload = {r['rank']: {'to': r['email'], 'company': r['company'],
                       's1': r['touch1']['subject'], 'b1': r['touch1']['body'],
                       's2': r['touch2']['subject'], 'b2': r['touch2']['body'],
                       's3': r['touch3']['subject'], 'b3': r['touch3']['body']}
           for r in rows}

pipe_html = ''.join(
    '<button class="seg" data-seg="%s" data-empty="1"><b id="n-%s">0</b><i>%s</i></button>'
    % (k, k, esc(lbl)) for k, lbl, _ in PIPE)

sections = ''.join(
    '<section class="stage" id="stage-%s" data-empty="1"><h2>%s <span id="c-%s"></span></h2>'
    '<p class="stage-note">%s</p><ol class="stack" id="list-%s"></ol>'
    '<p class="empty" id="e-%s">%s</p></section>'
    % (k, esc(lbl), k, esc(NOTES[k]), k, k, esc(empty)) for k, lbl, empty in PIPE)

regions = ['London', 'Day trip', 'Too far']
region_btns = ''.join('<button class="f" data-k="region" data-v="%s" aria-pressed="false">%s</button>'
                      % (esc(x), esc(x)) for x in regions)
grade_btns = ''.join('<button class="f" data-k="grade" data-v="%s" aria-pressed="false">Grade %s</button>'
                     % (g, g) for g in ('A', 'B', 'C'))

SCRIPT = r"""
var WORKDIR = "__DIR__";
var NL = String.fromCharCode(10), BS = String.fromCharCode(92);
var DATA = __DATA__;
var POINTS = __POINTS__;
var LEVELS = __LEVELS__;
var CHASE1 = __C1__, CHASE2 = __C2__, DEFAULT_TARGET = __TARGET__;
var KEY = 's4-sales-desk-v1', TKEY = 's4-sales-target', LKEY = 's4-sales-seen-level';

var st = {};
try { st = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { st = {}; }

var pool = document.getElementById('pool');
var allRows = Array.prototype.slice.call(pool.querySelectorAll('li.row'));
var toastEl = document.getElementById('toast');
var active = {}, toastTimer = null;
var KEYS = ['today','waiting','later','won','lost'];

function save(){ try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} }
function toast(m){ toastEl.textContent = m; toastEl.classList.add('on');
  clearTimeout(toastTimer); toastTimer = setTimeout(function(){ toastEl.classList.remove('on'); }, 1900); }
function copy(t, m){
  if (navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(t).then(function(){ toast(m); }, function(){ toast('Copy failed'); });
  } else { toast('Copy not available'); }
}
function days(iso){ return iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : null; }
function ago(d){ return d === 0 ? 'today' : d === 1 ? 'yesterday' : d + ' days ago'; }
function today(){ return new Date().toISOString().slice(0,10); }
function mailto(to, s, b){
  window.location.href = 'mailto:' + encodeURIComponent(to) + '?subject=' + encodeURIComponent(s)
    + '&body=' + encodeURIComponent(b);
}

/* ---------- points ---------- */
function score(){
  var xp = 0;
  Object.keys(st).forEach(function(k){
    var s = st[k];
    if (s.sentAt)   { xp += POINTS.sent; }
    if (s.c1At)     { xp += POINTS.chase; }
    if (s.c2At)     { xp += POINTS.chase; }
    if (s.replied)  { xp += POINTS.reply; }
    if (s.outcome === 'interested') { xp += POINTS.interested; }
    if (s.outcome === 'client')     { xp += POINTS.client; }
  });
  return xp;
}
function levelFor(xp){
  var idx = 0;
  for (var i = 0; i < LEVELS.length; i++){ if (xp >= LEVELS[i][0]) { idx = i; } }
  return idx;
}

/* the creature. every stage keeps what came before and gains something visible. */
function creature(level, size){
  var s = size || 130, c = s / 2;
  var grow = 0.30 + level * 0.10;               // body swells with each stage
  var r = s * grow / 2;
  var p = [];
  p.push('<defs><radialGradient id="g' + level + '" cx="42%" cy="35%">'
       + '<stop offset="0%" stop-color="var(--blue)" stop-opacity=".95"/>'
       + '<stop offset="100%" stop-color="var(--plum)" stop-opacity=".9"/></radialGradient></defs>');
  if (level >= 4){                                // aura
    p.push('<circle cx="' + c + '" cy="' + c + '" r="' + (r * 1.7) + '" fill="var(--blue)" opacity=".10"/>');
  }
  if (level >= 2){                                // legs
    p.push('<path d="M' + (c - r * .5) + ',' + (c + r * .85) + ' l-' + (r * .3) + ',' + (r * .55)
         + '" stroke="var(--ink)" stroke-width="3" stroke-linecap="round" fill="none"/>');
    p.push('<path d="M' + (c + r * .5) + ',' + (c + r * .85) + ' l' + (r * .3) + ',' + (r * .55)
         + '" stroke="var(--ink)" stroke-width="3" stroke-linecap="round" fill="none"/>');
  }
  if (level >= 3){                                // arms reaching out
    p.push('<path d="M' + (c - r) + ',' + (c + r * .1) + ' q-' + (r * .55) + ',-' + (r * .35) + ' -'
         + (r * .5) + ',-' + (r * .8) + '" stroke="var(--ink)" stroke-width="3" stroke-linecap="round" fill="none"/>');
    p.push('<path d="M' + (c + r) + ',' + (c + r * .1) + ' q' + (r * .55) + ',-' + (r * .35) + ' '
         + (r * .5) + ',-' + (r * .8) + '" stroke="var(--ink)" stroke-width="3" stroke-linecap="round" fill="none"/>');
  }
  p.push('<circle cx="' + c + '" cy="' + c + '" r="' + r + '" fill="url(#g' + level + ')"/>');
  if (level >= 1){                                // eyes
    var ex = r * .34, ey = r * .18, er = Math.max(2.4, r * .13);
    p.push('<circle cx="' + (c - ex) + '" cy="' + (c - ey) + '" r="' + er + '" fill="#0B1116"/>');
    p.push('<circle cx="' + (c + ex) + '" cy="' + (c - ey) + '" r="' + er + '" fill="#0B1116"/>');
    p.push('<circle cx="' + (c - ex + er * .3) + '" cy="' + (c - ey - er * .3) + '" r="' + (er * .34) + '" fill="#fff"/>');
    p.push('<circle cx="' + (c + ex + er * .3) + '" cy="' + (c - ey - er * .3) + '" r="' + (er * .34) + '" fill="#fff"/>');
  } else {
    p.push('<circle cx="' + c + '" cy="' + c + '" r="' + Math.max(2, r * .2) + '" fill="#0B1116"/>');
  }
  if (level >= 5){                                // crown of light
    for (var a = 0; a < 8; a++){
      var ang = (Math.PI * 2 / 8) * a - Math.PI / 2;
      var x1 = c + Math.cos(ang) * r * 1.25, y1 = c + Math.sin(ang) * r * 1.25;
      var x2 = c + Math.cos(ang) * r * 1.6,  y2 = c + Math.sin(ang) * r * 1.6;
      p.push('<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2
           + '" stroke="var(--blue)" stroke-width="2.5" stroke-linecap="round" opacity=".8"/>');
    }
  }
  if (level >= 1){                                // antenna
    p.push('<line x1="' + c + '" y1="' + (c - r) + '" x2="' + c + '" y2="' + (c - r * 1.5)
         + '" stroke="var(--ink)" stroke-width="2.5" stroke-linecap="round"/>');
    p.push('<circle cx="' + c + '" cy="' + (c - r * 1.62) + '" r="' + Math.max(2.5, r * .13)
         + '" fill="var(--blue)"/>');
  }
  return '<svg viewBox="0 0 ' + s + ' ' + s + '" role="img" aria-label="your progress creature">'
       + p.join('') + '</svg>';
}

function paintPet(){
  var xp = score(), lvl = levelFor(xp), cur = LEVELS[lvl], nxt = LEVELS[lvl + 1];
  document.getElementById('pet-art').innerHTML = creature(lvl, 130);
  document.getElementById('pet-name').textContent = cur[1];
  document.getElementById('pet-sub').textContent = cur[2];
  document.getElementById('xp-now').textContent = xp;
  var pet = document.getElementById('pet');
  if (nxt){
    var span = nxt[0] - cur[0], into = xp - cur[0];
    document.getElementById('xp-fill').style.width = Math.min(100, (into / span) * 100) + '%';
    document.getElementById('xp-goal').textContent = (nxt[0] - xp) + ' more to become ' + nxt[1];
    pet.dataset.max = '0';
  } else {
    document.getElementById('xp-fill').style.width = '100%';
    document.getElementById('xp-goal').textContent = 'fully grown';
    pet.dataset.max = '1';
  }
  var seen = parseInt(localStorage.getItem(LKEY) || '0', 10);
  if (lvl > seen){
    localStorage.setItem(LKEY, String(lvl));
    showLevelUp(lvl);
  }
}

function showLevelUp(lvl){
  document.getElementById('lu-art').innerHTML = creature(lvl, 150);
  document.getElementById('lu-name').textContent = LEVELS[lvl][1];
  document.getElementById('lu-sub').textContent = LEVELS[lvl][2];
  document.getElementById('levelup').classList.add('on');
}

/* ---------- pipeline ---------- */
function chaseDue(s){
  if (!s.sentAt || s.outcome || s.replied) { return 0; }
  if (!s.c1At) { return days(s.sentAt) >= CHASE1 ? 1 : 0; }
  if (!s.c2At) { return days(s.c1At) >= CHASE2 ? 2 : 0; }
  return 0;
}
function actionDays(){
  var d = {};
  Object.keys(st).forEach(function(k){
    [st[k].sentAt, st[k].c1At, st[k].c2At].forEach(function(t){
      if (t) { var k2 = t.slice(0,10); d[k2] = (d[k2] || 0) + 1; }
    });
  });
  return d;
}
function doneToday(){ return actionDays()[today()] || 0; }
function streak(){
  var d = actionDays(), x = new Date(), n = 0;
  if (!d[x.toISOString().slice(0,10)]) { x.setDate(x.getDate() - 1); }
  while (d[x.toISOString().slice(0,10)]) { n++; x.setDate(x.getDate() - 1); }
  return n;
}
function getTarget(){ var t = parseInt(localStorage.getItem(TKEY), 10); return t > 0 ? t : DEFAULT_TARGET; }

function buildSlate(){
  var slate = {}, budget = Math.max(0, getTarget() - doneToday()), q = 0;
  allRows.forEach(function(li){ if (chaseDue(st[li.dataset.rank] || {})) { slate[li.dataset.rank] = 1; } });
  allRows.forEach(function(li){
    var s = st[li.dataset.rank] || {};
    if (s.sentAt || s.outcome) { return; }
    if (q < budget) { slate[li.dataset.rank] = 1; q++; }
  });
  return slate;
}

function paint(){
  var n = { today:0, waiting:0, later:0, won:0, lost:0 }, slate = buildSlate();

  allRows.forEach(function(li){
    var rank = li.dataset.rank, s = st[rank] || {}, due = chaseDue(s);
    var stage = s.outcome === 'no' ? 'lost'
              : (s.outcome === 'interested' || s.outcome === 'client') ? 'won'
              : slate[rank] ? 'today'
              : s.sentAt ? 'waiting' : 'later';
    n[stage]++;

    li.classList.toggle('compact', stage !== 'today');
    li.classList.toggle('lost', stage === 'lost');
    li.classList.toggle('won-row', stage === 'won');

    var el = li.querySelector('[data-state]'), cls = 'state', txt = '';
    if (s.outcome === 'client'){ cls += ' won'; txt = '<b>Client</b> &middot; nice one'; }
    else if (s.outcome === 'interested'){ cls += ' won'; txt = '<b>Interested</b> &middot; get a date in'; }
    else if (s.outcome === 'no'){ txt = '<b>Not interested</b>'; }
    else if (due){ cls += ' due'; txt = 'Sent ' + ago(days(s.sentAt)) + ' &middot; <b>follow-up ' + due + ' due</b>'; }
    else if (s.replied){ cls += ' awaiting'; txt = '<b>Replied</b> &middot; answer them'; }
    else if (s.c2At){ cls += ' awaiting'; txt = 'Two follow-ups sent &middot; <b>last one was ' + ago(days(s.c2At)) + '</b>'; }
    else if (s.c1At){ cls += ' awaiting'; txt = 'Followed up ' + ago(days(s.c1At)); }
    else if (s.sentAt){ cls += ' awaiting'; txt = 'Sent ' + ago(days(s.sentAt))
      + ' &middot; <b>chase in ' + Math.max(0, CHASE1 - days(s.sentAt)) + 'd</b>'; }
    el.className = cls; el.innerHTML = txt;

    var c1 = li.querySelector('[data-role="c1"]'), c2 = li.querySelector('[data-role="c2"]');
    if (c1) { c1.hidden = !(s.sentAt && !s.c1At && !s.outcome); }
    if (c2) { c2.hidden = !(s.c1At && !s.c2At && !s.outcome); }

    li.querySelectorAll('button[data-set]').forEach(function(b){
      var w = b.dataset.set;
      var on = w === 'replied' ? !!s.replied : s.outcome === w;
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });

    var ok = Object.keys(active).every(function(k){ return active[k].indexOf(li.dataset[k]) !== -1; });
    li.hidden = !ok;
    var tgt = document.getElementById('list-' + stage);
    if (ok && li.parentNode !== tgt) { tgt.appendChild(li); }
    else if (!ok && li.parentNode !== pool) { pool.appendChild(li); }
  });

  KEYS.forEach(function(k){
    document.getElementById('n-' + k).textContent = n[k];
    document.getElementById('c-' + k).textContent = n[k] || '';
    document.getElementById('e-' + k).hidden = n[k] > 0;
    document.querySelector('.seg[data-seg="' + k + '"]').dataset.empty = n[k] ? '0' : '1';
    document.getElementById('stage-' + k).dataset.empty = n[k] ? '0' : '1';
  });

  var t = getTarget(), d = doneToday(), bar = '';
  for (var i = 0; i < t; i++) { bar += '<span class="tick' + (i < d ? ' on' : '') + '"></span>'; }
  document.getElementById('ticks').innerHTML = bar;
  document.getElementById('d-count').textContent = d;
  document.getElementById('d-target').textContent = t;
  document.getElementById('d-streak').textContent = streak();
  var board = document.getElementById('board');
  if (n.today === 0){
    document.getElementById('t-head').textContent = d >= t ? 'Today is done' : 'Nothing left to send';
    document.getElementById('t-sub').textContent = n.waiting + ' out there waiting on a reply.';
    board.dataset.done = '1';
  } else {
    document.getElementById('t-head').textContent = n.today + ' to do today';
    var due = 0; Object.keys(st).forEach(function(k){ if (chaseDue(st[k])) { due++; } });
    document.getElementById('t-sub').textContent = due
      ? due + ' follow-up' + (due === 1 ? '' : 's') + ' due, then the next best names.'
      : 'The next best names, London first.';
    board.dataset.done = '0';
  }
  paintPet();
}

document.body.addEventListener('click', function(ev){
  var seg = ev.target.closest('.seg');
  if (seg){ document.getElementById('stage-' + seg.dataset.seg)
    .scrollIntoView({behavior:'smooth', block:'start'}); return; }

  var open = ev.target.closest('a[data-open]');
  if (open){
    ev.preventDefault();
    var rank = open.dataset.rank, which = open.dataset.open, d = DATA[rank];
    mailto(d.to, d['s' + which], d['b' + which]);
    st[rank] = st[rank] || {};
    if (which === '1' && !st[rank].sentAt) { st[rank].sentAt = new Date().toISOString(); }
    if (which === '2') { st[rank].c1At = new Date().toISOString(); }
    if (which === '3') { st[rank].c2At = new Date().toISOString(); }
    save(); paint(); return;
  }

  var cmd = ev.target.closest('button[data-cmd]');
  if (cmd){ copy('cd "' + WORKDIR + '"' + NL + '.' + BS + 'draft-sales.ps1 -Ranks ' + cmd.dataset.cmd,
                 'Command copied'); return; }

  var set = ev.target.closest('button[data-set]');
  if (set){
    var k = set.dataset.rank, w = set.dataset.set;
    st[k] = st[k] || {};
    if (w === 'replied'){ st[k].replied = !st[k].replied; }
    else { st[k].outcome = st[k].outcome === w ? null : w;
           if (st[k].outcome && !st[k].sentAt) { st[k].sentAt = new Date().toISOString(); } }
    save(); paint(); return;
  }

  var f = ev.target.closest('button.f[data-k]');
  if (f){
    var kk = f.dataset.k, vv = f.dataset.v, on = f.getAttribute('aria-pressed') === 'true';
    f.setAttribute('aria-pressed', on ? 'false' : 'true');
    var list = active[kk] || [];
    if (on) { list = list.filter(function(x){ return x !== vv; }); } else { list.push(vv); }
    if (list.length) { active[kk] = list; } else { delete active[kk]; }
    paint(); return;
  }

  var tb = ev.target.closest('button[data-target]');
  if (tb){
    localStorage.setItem(TKEY, tb.dataset.target);
    document.querySelectorAll('button[data-target]').forEach(function(b){
      b.setAttribute('aria-pressed', b === tb ? 'true' : 'false'); });
    paint(); return;
  }

  if (ev.target.id === 'lu-close' || ev.target.id === 'levelup'){
    document.getElementById('levelup').classList.remove('on'); return;
  }
  if (ev.target.id === 'reset'){
    active = {};
    document.querySelectorAll('button.f[data-k]').forEach(function(b){ b.setAttribute('aria-pressed','false'); });
    paint(); return;
  }
  if (ev.target.id === 'wipe'){
    if (!confirm('Clear all tracking and points? The emails are untouched.')) { return; }
    st = {}; save(); localStorage.removeItem(LKEY); paint(); toast('Cleared');
  }
});

document.querySelectorAll('button[data-target]').forEach(function(b){
  b.setAttribute('aria-pressed', parseInt(b.dataset.target,10) === getTarget() ? 'true' : 'false');
});
paint();
"""

PAGE = """<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sales desk - s4digital</title>
<link rel="preconnect" href="https://api.fontshare.com" crossorigin>
<link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=satoshi@400,500,700,900&display=swap">
<style>%(css)s</style>
</head>
<body>
<div class="wrap">
<header class="top">
  <div class="eyebrow">s4digital &middot; sales desk</div>
  <h1>%(n)d businesses,<br>three touches each</h1>
  <p class="lede">London first, because you shoot in person. Every email opens with something
  true about that specific company, pulled off their own website. <strong>Draft email</strong>
  fills Outlook in, you press send.</p>

  <div id="pet" data-max="0">
    <div id="pet-art"></div>
    <div class="pet-body">
      <p class="pet-name" id="pet-name">Speck</p>
      <p class="pet-sub" id="pet-sub">a dot with ambition</p>
      <div class="xp-row"><span class="xp-now" id="xp-now">0</span>
        <span class="xp-goal" id="xp-goal"></span></div>
      <div class="xp-track"><div class="xp-fill" id="xp-fill"></div></div>
      <div class="pet-stats">
        <div class="pet-stat"><b><span id="d-count">0</span><span
          style="color:var(--ink-faint);font-weight:400">/<span id="d-target">5</span></span></b>
          <i>done today</i></div>
        <div class="pet-stat"><b id="d-streak">0</b><i>day streak</i></div>
        <div class="pet-stat"><b>1 / 5 / 15 / 100</b><i>send / reply / interested / client</i></div>
      </div>
    </div>
  </div>

  <div id="board" data-done="0">
    <div style="flex:1 1 300px">
      <h2 id="t-head">&nbsp;</h2>
      <p id="t-sub">&nbsp;</p>
      <div class="target"><span>A day</span>%(targets)s</div>
    </div>
    <div>
      <div class="ticks" id="ticks"></div>

    </div>
  </div>

  <div class="pipe">%(pipe)s</div>
  <div class="filters">%(regions)s%(grades)s
    <button class="f" id="reset">Reset filters</button></div>
</header>

%(sections)s

<footer><button class="f" id="wipe">Clear tracking</button></footer>
</div>

<ol id="pool" hidden>
%(rows)s
</ol>

<div class="toast" id="toast"></div>
<div class="levelup" id="levelup">
  <div class="levelup-card">
    <div id="lu-art"></div>
    <h3 id="lu-name"></h3>
    <p id="lu-sub"></p>
    <button class="go primary" id="lu-close">Nice</button>
  </div>
</div>
<script>%(script)s</script>
</body>
</html>
"""

out = PAGE % {
    'css': CSS,
    'n': len(rows),
    'pipe': pipe_html,
    'sections': sections,
    'regions': region_btns,
    'grades': grade_btns,
    'targets': ''.join('<button class="t" data-target="%d" aria-pressed="false">%d</button>' % (x, x)
                       for x in (3, 5, 10)),
    'rows': '\n'.join(row_html(r) for r in rows),
    'script': (SCRIPT.replace('__DATA__', json.dumps(payload, ensure_ascii=False))
                     .replace('__POINTS__', json.dumps(POINTS))
                     .replace('__LEVELS__', json.dumps(STAGES))
                     .replace('__C1__', str(CHASE_1_DAYS))
                     .replace('__C2__', str(CHASE_2_DAYS))
                     .replace('__TARGET__', str(DAILY_TARGET))
                     .replace('__DIR__', WORKDIR_JS)),
}

open('sales-desk.html', 'w', encoding='utf-8').write(out)
print('sales-desk.html written:', len(out), 'bytes |', len(rows), 'prospects')
