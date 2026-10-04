/* Brand film budget calculator. Every rate below comes from the "Line by line" and "budget bands"
   tables in the free playbook (Before the Camera Comes Out, section 5). Day counts are stated assumptions. */
(function () {
  'use strict';
  var form = document.getElementById('fbForm');
  var $ = function (id) { return document.getElementById(id); };

  // Rates from the playbook's line-by-line table (typical UK market ranges).
  var R = {
    pre: { light: [500, 1500], proper: [1500, 3000] },  // playbook: £500 to £3,000+
    director: [400, 1000],      // per day
    camera: [400, 1200],        // per day incl. basic kit
    sound: [350, 650],          // per day with kit
    second: [350, 800],         // per day
    kit: [150, 1000],           // per day
    drone: [400, 1200],         // per day
    edit: [300, 600],           // per day
    grade: [400, 1000],         // per day, half a day to two days
    mix: [300, 800],            // per day, half a day to two days
    library: [0, 500],          // per track
    mograph: [200, 1500],
    subs: [0, 300],             // per film
    cut: [150, 600],            // per cut
    contingency: [0.05, 0.10]
  };
  // Edit days: our assumption per film type. A documentary edit takes one to three weeks (playbook).
  var EDIT_DAYS = {
    simple: { social: [1, 3], interview: [2, 4], doc: [3, 5] },
    doc: { social: [3, 6], interview: [4, 8], doc: [5, 15] }
  };
  var DEFAULTS = {
    doc: { days: '2', crew: 'small', pre: 'proper', edit: 'doc', subs: true, cuts: true },
    interview: { days: '1', crew: 'small', pre: 'light', edit: 'simple', subs: true, cuts: false },
    social: { days: '1', crew: 'solo', pre: 'light', edit: 'simple', subs: true, cuts: true }
  };
  var BANDS = [
    { max: 2000, name: 'Under £2,000', text: 'A freelancer, a day or less on site, an interview and some B-roll, a short edit, library music. Fine for social content and simple talking heads.' },
    { max: 8000, name: '£2,000 to £8,000', text: 'A small production company or experienced freelance team. One or two shoot days, a scripted or interview-led piece, a proper edit, often a couple of cut-downs. Most corporate video sits here.' },
    { max: 30000, name: '£8,000 to £30,000', text: 'Documentary brand films and higher-end brand content. Real research, multi-day shoots, a crew, a specialist grade and mix, a full set of cuts.' },
    { max: Infinity, name: '£30,000 and up', text: 'Agency-led campaigns, scripted work with cast and art direction, built sets, broadcast advertising.' }
  ];

  var gbp = function (n) { return '£' + Math.round(n).toLocaleString('en-GB'); };
  var dd = function (n) { return n === 0.5 ? 'half a day' : (n + (n === 1 ? ' day' : ' days')); };
  var rate = function (r) { return gbp(r[0]) + ' to ' + gbp(r[1]); };

  function val(name) { var el = form.querySelector('[name="' + name + '"]:checked'); return el ? el.value : null; }
  function on(name) { var el = form.querySelector('[name="' + name + '"]'); return !!(el && el.checked); }

  function applyDefaults(type) {
    var d = DEFAULTS[type];
    ['days', 'crew', 'pre', 'edit'].forEach(function (k) { var el = form.querySelector('[name="' + k + '"][value="' + d[k] + '"]'); if (el) el.checked = true; });
    form.querySelector('[name="subs"]').checked = d.subs;
    form.querySelector('[name="cuts"]').checked = d.cuts;
  }

  function calc() {
    var type = val('type'), days = parseInt(val('days'), 10), crew = val('crew'), pre = val('pre'), edit = val('edit');
    var cutCount = Math.min(12, Math.max(1, parseInt($('fbCutCount').value, 10) || 1));
    var rows = [];
    var add = function (line, how, lo, hi) { rows.push({ line: line, how: how, lo: lo, hi: hi }); };
    var note = function (line, how, text) { rows.push({ line: line, how: how, note: text }); };
    var perDay = function (line, r, n, extra) { add(line, dd(n) + ' at ' + rate(r) + ' a day' + (extra ? '. ' + extra : ''), r[0] * n, r[1] * n); };

    add('Pre-production and research', pre === 'proper' ? 'Story conversations, a recce, pre-interviews, planning and call sheets' : 'A planning call, scheduling and a call sheet', R.pre[pre][0], R.pre[pre][1]);
    if (crew !== 'solo') perDay('Director / producer', R.director, days, 'Responsible for the story and the day');
    perDay(crew === 'solo' ? 'Shooter (camera, directing, sound)' : 'Camera operator / DoP', R.camera, days, 'Including basic kit');
    if (crew !== 'solo') perDay('Sound recordist', R.sound, days, 'With kit');
    if (crew === 'full') perDay('Second camera', R.second, days);
    if (crew !== 'solo') perDay('Kit hire', R.kit, days, 'Cinema camera, lenses, lights, grip');
    if (on('drone')) perDay('Drone', R.drone, 1, 'Licensed operator');
    note('Locations', 'Assumes your own premises', '£0');
    note('Travel and expenses', 'Mileage, trains, parking, hotels, food', 'Varies');

    var ed = EDIT_DAYS[edit][type];
    add('Edit', ed[0] + ' to ' + ed[1] + ' days at ' + rate(R.edit) + ' a day', R.edit[0] * ed[0], R.edit[1] * ed[1]);
    if (edit === 'doc') {
      add('Colour grade', 'Half a day to two days at ' + rate(R.grade) + ' a day', R.grade[0] * 0.5, R.grade[1] * 2);
      add('Sound mix', 'Half a day to two days at ' + rate(R.mix) + ' a day', R.mix[0] * 0.5, R.mix[1] * 2);
    } else {
      note('Grade and mix', 'A basic pass done by the editor', 'In the edit');
    }
    if (on('music')) note('Music licence', 'A commercial track runs into thousands and is priced per track, so it isn’t in the total', 'Thousands');
    else add('Music licence', 'One library track', R.library[0], R.library[1]);
    if (on('mograph')) add('Motion graphics', 'Titles, lower thirds, simple animated elements', R.mograph[0], R.mograph[1]);
    if (on('subs')) add('Captions and subtitles', 'For the main film', R.subs[0], R.subs[1]);
    if (on('cuts')) add('Vertical cut-downs', cutCount + ' at ' + rate(R.cut) + ' each', R.cut[0] * cutCount, R.cut[1] * cutCount);
    note('Insurance', 'Public liability and equipment cover', 'In the rates');

    var lo = 0, hi = 0;
    rows.forEach(function (r) { if (r.note === undefined) { lo += r.lo; hi += r.hi; } });
    var cLo = Math.round(lo * R.contingency[0] / 10) * 10, cHi = Math.round(hi * R.contingency[1] / 10) * 10;
    add('Contingency', '5% on the low figure, 10% on the high', cLo, cHi);
    lo += cLo; hi += cHi;

    return { rows: rows, lo: lo, hi: hi, commercialMusic: on('music'), cutCount: cutCount };
  }

  function bandFor(n) { for (var i = 0; i < BANDS.length; i++) if (n < BANDS[i].max) return i; return BANDS.length - 1; }

  var last = '';
  function render() {
    var r = calc();
    var tbody = $('fbRows');
    tbody.innerHTML = r.rows.map(function (row) {
      var how = '<small>' + row.how + '</small>';
      if (row.note !== undefined) return '<tr class="is-note"><td>' + row.line + how + '</td><td class="num" colspan="2">' + row.note + '</td></tr>';
      return '<tr><td>' + row.line + how + '</td><td class="num">' + gbp(row.lo) + '</td><td class="num">' + gbp(row.hi) + '</td></tr>';
    }).join('');
    $('fbFootLow').textContent = gbp(r.lo);
    $('fbFootHigh').textContent = gbp(r.hi);

    var total = $('fbTotal'), txt = gbp(r.lo) + ' to ' + gbp(r.hi);
    if (txt !== last) { total.textContent = txt; total.classList.remove('fb-flash'); void total.offsetWidth; total.classList.add('fb-flash'); last = txt; }
    $('fbTotalSub').textContent = 'Excluding VAT. About ' + gbp(r.lo * 1.2) + ' to ' + gbp(r.hi * 1.2) + ' with VAT at 20%, plus travel' +
      (r.commercialMusic ? ' and the commercial music licence' : '') + '.';

    var a = bandFor(r.lo), b = bandFor(r.hi), html;
    if (a === b) html = 'That&rsquo;s in the <strong>' + BANDS[a].name + '</strong> band. ' + BANDS[a].text;
    else {
      html = 'That range runs across the <strong>' + BANDS[a].name + '</strong> and <strong>' + BANDS[b].name + '</strong> bands. ' +
        'At the lower end: ' + BANDS[a].text.charAt(0).toLowerCase() + BANDS[a].text.slice(1) + ' At the upper end: ' + BANDS[b].text.charAt(0).toLowerCase() + BANDS[b].text.slice(1);
    }
    $('fbBand').innerHTML = html;
    form.dataset.lo = r.lo; form.dataset.hi = r.hi;
  }

  form.addEventListener('change', function (e) {
    if (e.target.name === 'type') applyDefaults(e.target.value);
    if (e.target.name === 'cutCount' && !form.querySelector('[name="cuts"]').checked) form.querySelector('[name="cuts"]').checked = true;
    render();
  });
  $('fbCutCount').addEventListener('input', render);
  applyDefaults(val('type'));
  render();
})();
