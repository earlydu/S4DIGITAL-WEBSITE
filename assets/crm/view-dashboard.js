// The sales command centre. Today at the top, the week under it, then the
// conversion rates and the sector split that say which niche is worth more time.

import { api, loadSettings } from './api.js';
import { $, $$, esc, money, pct, humanDate, loading } from './ui.js';

let settings = null;

export async function render(host) {
  settings = await loadSettings();
  host.innerHTML = loading('Counting');
  const d = await api('dashboard');
  host.innerHTML = view(d);
  $$('[data-goto]', host).forEach(b => {
    b.onclick = async () => { (await import('./nav.js')).go(b.dataset.goto); };
  });
}

/** The gamified strip: points, rank, streak and personal best. */
function scoreCard(sc) {
  const pctDone = Math.min(100, (sc.calls / sc.target) * 100);
  const toNextRank = sc.nextRank ? sc.nextRank.at - sc.points : 0;
  return `
    <div class="score">
      <div class="score__ring" style="--pct:${pctDone}">
        <b class="num">${sc.calls}</b><span>/ ${sc.target}</span>
      </div>
      <div class="score__bits">
        <div class="score__pts">
          <b class="num">${sc.points}</b> pts today
          <span class="badge badge--purple">${esc(sc.rank)}</span>
          ${sc.nextRank ? `<span style="font-size:12px;color:var(--muted)">${toNextRank} to ${esc(sc.nextRank.name)}</span>` : ''}
        </div>
        <div class="score__meta">
          ${sc.streak ? `<span>🔥 <b>${sc.streak}</b> day streak</span>` : "<span>No streak yet, hit today's target to start one</span>"}
          ${sc.best && sc.best.calls ? `<span>Best day: <b>${sc.best.calls}</b> calls</span>` : ''}
          <span><b>${sc.weekPoints}</b> pts this week</span>
        </div>
        <div class="score__dots">
          ${sc.milestones.map(m => `<i class="${m.hit ? 'is-hit' : ''}" title="${m.at} calls"></i>`).join('')}
        </div>
      </div>
    </div>`;
}

const stat = (k, v, sub, extra = '') =>
  `<div class="stat">
     <div class="stat__k">${esc(k)}</div>
     <div class="stat__v num">${v}</div>
     ${sub ? `<div class="stat__sub">${esc(sub)}</div>` : ''}${extra}
   </div>`;

function view(d) {
  const t = d.today;
  const w = d.thisWeek;
  const dayPct = t.assigned ? (t.completed / t.assigned) * 100 : 0;
  const weekPct = Math.min(100, (w.calls / d.targets.weekly) * 100);

  return `
    <div class="head">
      <div>
        <h1>Dashboard</h1>
        <p>${esc(humanDate(d.day))} &middot; week of ${esc(humanDate(d.week.start))}</p>
      </div>
      <div class="head__acts">
        <button class="btn btn--orange" data-goto="today">Go to today's calls</button>
      </div>
    </div>

    ${d.scoreboard ? scoreCard(d.scoreboard) : ''}

    <h2 class="sec">Today</h2>
    <div class="stats">
      <div class="stat stat--hero">
        <div class="stat__k">Calls completed</div>
        <div class="stat__v num">${t.completed}<small> / ${t.assigned || d.targets.daily}</small></div>
        <div class="meter"><i class="${dayPct >= 100 ? 'is-full' : ''}" style="width:${dayPct}%"></i></div>
        <div class="stat__sub" style="color:#8e8fa0">${t.remaining} left on the list</div>
      </div>
      ${stat('Decision makers', t.decisionMakers, 'reached today')}
      ${stat('Conversations', t.conversations, '')}
      ${stat('Follow-ups', t.followUps, 'created today')}
      ${stat('Meetings', t.meetings, 'booked today')}
      ${stat('No answer', t.noAnswer, '')}
      ${stat('Gatekeeper', t.gatekeeper, '')}
    </div>

    <h2 class="sec">This week</h2>
    <div class="stats">
      <div class="stat stat--hero">
        <div class="stat__k">Calls this week</div>
        <div class="stat__v num">${w.calls}<small> / ${d.targets.weekly}</small></div>
        <div class="meter"><i class="${weekPct >= 100 ? 'is-full' : ''}" style="width:${weekPct}%"></i></div>
        <div class="stat__sub" style="color:#8e8fa0">${w.uniqueBusinesses} unique businesses, ${w.attempts} total attempts</div>
      </div>
      ${stat('Decision makers', w.decisionMakers, '')}
      ${stat('Conversations', w.conversations, '')}
      ${stat('Follow-ups', w.followUps, '')}
      ${stat('Meetings', w.meetings, '')}
      ${stat('Proposals', w.proposals, '')}
      ${stat('Won', w.won, '')}
      ${stat('Lost', w.lost, '')}
    </div>

    <div class="stats" style="margin-top:10px">
      ${stat('Pipeline', money(w.pipelineMrr) + '<small>/mo</small>', 'open opportunities')}
      ${stat('One-off in pipeline', money(w.pipelineOneOff), '')}
      ${stat('Won', money(w.wonMrr) + '<small>/mo</small>', 'recurring, all time')}
      ${stat('Won this week', money(w.wonMrrThisWeek) + '<small>/mo</small>', '')}
    </div>

    <h2 class="sec">Calls per day</h2>
    <div class="card">
      <div class="bars">
        ${d.perDay.map(p => {
          const max = Math.max(...d.perDay.map(x => x.calls), d.targets.daily);
          const h = max ? (p.calls / max) * 100 : 0;
          return `<div>
            <b>${p.calls}</b>
            <i class="${p.day === d.day ? 'is-today' : ''}" style="height:${Math.max(h, 2)}%"></i>
            ${esc(humanDate(p.day).slice(0, 3))}
          </div>`;
        }).join('')}
      </div>
    </div>

    <h2 class="sec">Conversion</h2>
    <div class="card">
      <table class="tbl">
        <thead><tr><th>Step</th><th class="r">This week</th><th class="r">Rate</th></tr></thead>
        <tbody>
          <tr><td class="lead">Calls to conversations</td><td class="r num">${w.conversations} of ${w.calls}</td><td class="r num">${pct(w.rates.callsToConversations)}</td></tr>
          <tr><td class="lead">Conversations to meetings</td><td class="r num">${w.meetings} of ${w.conversations}</td><td class="r num">${pct(w.rates.conversationsToMeetings)}</td></tr>
          <tr><td class="lead">Meetings to proposals</td><td class="r num">${w.proposals} of ${w.meetings}</td><td class="r num">${pct(w.rates.meetingsToProposals)}</td></tr>
          <tr><td class="lead">Proposals to won</td><td class="r num">${w.won} of ${w.proposals}</td><td class="r num">${pct(w.rates.proposalsToWon)}</td></tr>
        </tbody>
      </table>
    </div>

    <h2 class="sec">By sector</h2>
    <div class="card">
      ${Object.keys(d.bySector).length ? `
      <table class="tbl">
        <thead><tr>
          <th>Sector</th><th class="r">Calls</th><th class="r">Conversations</th>
          <th class="r">Meetings</th><th class="r">Won</th><th class="r">Call to conversation</th>
        </tr></thead>
        <tbody>
          ${Object.entries(d.bySector).sort((a, b) => b[1].calls - a[1].calls).map(([g, s]) => `
            <tr>
              <td class="lead">${esc(g)}</td>
              <td class="r num">${s.calls}</td>
              <td class="r num">${s.conversations}</td>
              <td class="r num">${s.meetings}</td>
              <td class="r num">${s.won}</td>
              <td class="r num">${pct(s.rates.callsToConversations)}</td>
            </tr>`).join('')}
        </tbody>
      </table>` : '<p style="color:var(--muted);font-size:14px">No calls logged this week yet.</p>'}
    </div>

    <h2 class="sec">Pipeline</h2>
    <div class="stats">
      ${settings.stages.map(s => stat(s, d.stageCounts[s] || 0, '')).join('')}
    </div>

    <h2 class="sec">Database</h2>
    <div class="stats">
      ${stat('Prospects', d.totals.prospects, 'not archived')}
      ${stat('Callable', d.totals.callable, 'in play right now')}
      ${stat('Excluded', d.totals.excluded, 'clients and blocked')}
      ${stat('Follow-ups due', d.totals.followUpsDue, 'today or overdue')}
    </div>`;
}
