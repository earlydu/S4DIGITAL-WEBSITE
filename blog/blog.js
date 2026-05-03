// Theme: auto by default, fades between modes based on local time of day. Manual click locks the choice.
(function(){
  const root = document.documentElement;
  const legacy = localStorage.getItem('s4-theme');
  if (legacy && !localStorage.getItem('s4-theme-mode')) { localStorage.setItem('s4-theme-mode', legacy); localStorage.removeItem('s4-theme'); }
  const getMode = () => localStorage.getItem('s4-theme-mode') || 'auto';
  const setMode = (m) => localStorage.setItem('s4-theme-mode', m);
  const SUN = [[8.0,16.25],[7.5,17.0],[6.5,18.0],[6.25,19.83],[5.5,20.5],[4.75,21.25],[5.0,21.25],[5.75,20.5],[6.5,19.5],[7.25,18.5],[7.5,16.5],[8.0,16.0]];
  const isDarkHours = (d = new Date()) => { const [r,s] = SUN[d.getMonth()]; const h = d.getHours()+d.getMinutes()/60; return h<r||h>=s; };
  const fadeTo = (theme) => { if (root.getAttribute('data-theme') === theme) return; root.classList.add('is-themeing'); root.setAttribute('data-theme', theme); setTimeout(() => root.classList.remove('is-themeing'), 700); };
  const mode = getMode();
  if (mode === 'auto') root.setAttribute('data-theme', isDarkHours() ? 'dark' : 'light'); else root.setAttribute('data-theme', mode);
  setInterval(() => { if (getMode() === 'auto') fadeTo(isDarkHours() ? 'dark' : 'light'); }, 5*60*1000);
  document.querySelectorAll('.theme-toggle').forEach(b => b.addEventListener('click', () => {
    const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    fadeTo(next); setMode(next);
  }));
})();

// Mobile menu drawer
(function(){
  const burger = document.getElementById('navBurger');
  const menu = document.getElementById('mnav');
  const closeBtn = document.getElementById('mnavClose');
  if (!burger || !menu || !closeBtn) return;
  const open = () => { menu.classList.add('is-open'); document.body.classList.add('is-no-scroll'); };
  const close = () => { menu.classList.remove('is-open'); document.body.classList.remove('is-no-scroll'); };
  burger.addEventListener('click', open);
  closeBtn.addEventListener('click', close);
  menu.querySelectorAll('[data-mnav-link]').forEach(a => a.addEventListener('click', close));
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && menu.classList.contains('is-open')) close(); });
})();

// Year stamp
const yearEl = document.getElementById('year'); if (yearEl) yearEl.textContent = new Date().getFullYear();

// ============= Booking + Leak Finder modals on every blog page =============
// CTA buttons (.btn) on blog posts that point at "../index.html#contact" or "#calculator"
// open these modals in-page instead of redirecting to the home page.
(function(){
  if (document.getElementById('blogBook')) return;
  const CAL_URL = 'https://cal.eu/s4digital/30min';

  const html = `
<div class="bmodal" id="blogBook" role="dialog" aria-modal="true" aria-hidden="true">
  <div class="bmodal__panel">
    <button class="bmodal__close" id="blogBookClose" type="button" aria-label="Close">&times;</button>
    <iframe class="bmodal__iframe" id="blogBookFrame" src="about:blank" title="Book a 30 minute call" loading="lazy" allow="fullscreen *; clipboard-write"></iframe>
  </div>
</div>
<div class="lmodal" id="blogLeak" role="dialog" aria-modal="true" aria-hidden="true">
  <div class="lmodal__panel">
    <button class="lmodal__close" id="blogLeakClose" type="button" aria-label="Close">&times;</button>
    <div class="lmodal__grid">
      <div class="lmodal__inputs">
        <span class="eyebrow"><span class="dot"></span>Leak Finder &middot; free tool</span>
        <h3 style="margin-top:10px">Find out what your funnel is <span class="kw">costing you</span></h3>
        <p class="lmodal__sub">Plug in five numbers. We will show you the leak in real time and email a personalised PDF if you want it.</p>
        <div class="lmodal__field"><label for="lf_visitors">Monthly website visitors</label><input id="lf_visitors" type="number" min="0" step="100" value="5000" /></div>
        <div class="lmodal__field"><label for="lf_conv">Conversion rate (%)</label><input id="lf_conv" type="number" min="0" max="100" step="0.1" value="1.5" /></div>
        <div class="lmodal__field"><label for="lf_resp">Lead response time (min)</label><input id="lf_resp" type="number" min="0" step="1" value="240" /></div>
        <div class="lmodal__field"><label for="lf_close">Close rate (%)</label><input id="lf_close" type="number" min="0" max="100" step="1" value="20" /></div>
        <div class="lmodal__field"><label for="lf_deal">Average deal value (£)</label><input id="lf_deal" type="number" min="0" step="100" value="2500" /></div>
      </div>
      <div class="lmodal__results">
        <span class="lmodal__lbl">Your estimated leak</span>
        <div class="lmodal__big"><span class="num" id="lf_missed">135</span><span class="cap">Missed leads / month</span></div>
        <div class="lmodal__big lmodal__big--rev"><span class="num" id="lf_revenue">£67,500</span><span class="cap">Lost revenue / month</span></div>
        <span class="lmodal__lbl">Where leads are leaking</span>
        <ul class="lmodal__areas" id="lf_areas">
          <li>Website conversion below 3% benchmark</li>
          <li>Response time over 5 minutes</li>
          <li>Close rate suggests follow-up gaps</li>
        </ul>
        <div class="lmodal__bridge">You could be losing <strong id="lf_bridge">£67,500</strong> per month. Most of this is fixable in 30 to 60 days.</div>
        <div class="lmodal__ctas">
          <button class="btn btn--orange" type="button" id="lf_fix"><span>Fix my lead leaks</span><span class="arrow">&rarr;</span></button>
          <button class="btn lmodal__ghost" type="button" id="lf_download"><span>Email me the breakdown</span><span class="arrow">&rarr;</span></button>
        </div>
      </div>
    </div>
  </div>
</div>
<div class="lmodal lcap" id="blogLead" role="dialog" aria-modal="true" aria-hidden="true">
  <div class="lmodal__panel lcap__panel">
    <button class="lmodal__close" id="blogLeadClose" type="button" aria-label="Close">&times;</button>
    <div class="lmodal__inputs">
      <span class="eyebrow"><span class="dot"></span>Personalised report</span>
      <h3 style="margin-top:10px">Get your <span class="kw">leak breakdown</span></h3>
      <p class="lmodal__sub">We will email you the report using the numbers you entered. No spam.</p>
      <form id="lf_form" action="https://formsubmit.co/ajax/earl@s4digi.com" method="POST">
        <input type="hidden" name="_subject" value="New Lead Leak (blog)" />
        <input type="hidden" name="_template" value="table" />
        <input type="hidden" name="_captcha" value="false" />
        <input type="hidden" name="_honey" value="" tabindex="-1" autocomplete="off" />
        <input type="hidden" name="Source" value="Blog Leak Finder" />
        <div class="lmodal__row">
          <div class="lmodal__field"><label for="lc_name">Name</label><input id="lc_name" name="Name" type="text" required placeholder="Jane Doe" /></div>
          <div class="lmodal__field"><label for="lc_email">Email</label><input id="lc_email" name="Email" type="email" required placeholder="jane@company.com" /></div>
        </div>
        <div class="lmodal__row">
          <div class="lmodal__field"><label for="lc_company">Company</label><input id="lc_company" name="Company" type="text" required placeholder="Voltage&amp;Co" /></div>
          <div class="lmodal__field"><label for="lc_phone">Phone (optional)</label><input id="lc_phone" name="Phone" type="tel" placeholder="07000 000000" /></div>
        </div>
        <div class="lmodal__field"><label for="lc_website">Website</label><input id="lc_website" name="Website" type="url" required placeholder="https://your-company.com" /></div>
        <input type="hidden" name="Monthly visitors" id="h_visitors" />
        <input type="hidden" name="Conversion rate" id="h_conv" />
        <input type="hidden" name="Response time" id="h_resp" />
        <input type="hidden" name="Close rate" id="h_close" />
        <input type="hidden" name="Average deal value" id="h_deal" />
        <input type="hidden" name="Estimated missed leads" id="h_missed" />
        <input type="hidden" name="Estimated lost revenue" id="h_revenue" />
        <button class="btn btn--orange" type="submit" id="lf_submit"><span>Email me the breakdown</span><span class="arrow">&rarr;</span></button>
        <p class="lmodal__priv">We will only use this to send the report and the occasional growth note. Unsubscribe any time.</p>
      </form>
      <div class="lmodal__success" id="lf_success">
        <div class="check">&#10003;</div>
        <h4>Your breakdown is on its way</h4>
        <p>Check your inbox in the next minute or two. Want to walk through the priority fixes together?</p>
        <button class="btn btn--orange" type="button" id="lf_book"><span>Book a 30-min call</span><span class="arrow">&rarr;</span></button>
      </div>
    </div>
  </div>
</div>`;

  document.body.insertAdjacentHTML('beforeend', html);

  const root = document.documentElement;
  const bookModal = document.getElementById('blogBook');
  const bookFrame = document.getElementById('blogBookFrame');
  const bookClose = document.getElementById('blogBookClose');
  const leakModal = document.getElementById('blogLeak');
  const leakClose = document.getElementById('blogLeakClose');
  const leadModal = document.getElementById('blogLead');
  const leadClose = document.getElementById('blogLeadClose');

  const lock = () => document.body.classList.add('is-no-scroll');
  const unlock = () => document.body.classList.remove('is-no-scroll');

  const openBook = (e) => {
    if (e) e.preventDefault();
    const themed = CAL_URL + (CAL_URL.includes('?') ? '&' : '?') + 'theme=' + (root.getAttribute('data-theme') || 'light');
    if (bookFrame.src === 'about:blank' || !bookFrame.src.startsWith(CAL_URL)) bookFrame.src = themed;
    bookModal.classList.add('is-open'); bookModal.setAttribute('aria-hidden','false'); lock();
  };
  const closeBook = () => { bookModal.classList.remove('is-open'); bookModal.setAttribute('aria-hidden','true'); unlock(); };
  const openLeak = (e) => { if (e) e.preventDefault(); leakModal.classList.add('is-open'); leakModal.setAttribute('aria-hidden','false'); lock(); render(); };
  const closeLeak = () => { leakModal.classList.remove('is-open'); leakModal.setAttribute('aria-hidden','true'); unlock(); };
  const openLead = () => {
    document.getElementById('h_visitors').value = visitorsEl.value;
    document.getElementById('h_conv').value = convEl.value + '%';
    document.getElementById('h_resp').value = respEl.value + ' min';
    document.getElementById('h_close').value = closeEl.value + '%';
    document.getElementById('h_deal').value = '£' + dealEl.value;
    document.getElementById('h_missed').value = missedEl.textContent;
    document.getElementById('h_revenue').value = revenueEl.textContent;
    leadModal.classList.add('is-open'); leadModal.setAttribute('aria-hidden','false'); lock();
  };
  const closeLead = () => { leadModal.classList.remove('is-open'); leadModal.setAttribute('aria-hidden','true'); unlock(); };

  bookClose.addEventListener('click', closeBook);
  leakClose.addEventListener('click', closeLeak);
  leadClose.addEventListener('click', closeLead);
  bookModal.addEventListener('click', e => { if (e.target === bookModal) closeBook(); });
  leakModal.addEventListener('click', e => { if (e.target === leakModal) closeLeak(); });
  leadModal.addEventListener('click', e => { if (e.target === leadModal) closeLead(); });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (bookModal.classList.contains('is-open')) closeBook();
    else if (leadModal.classList.contains('is-open')) closeLead();
    else if (leakModal.classList.contains('is-open')) closeLeak();
  });

  // Calculator state + render
  const visitorsEl = document.getElementById('lf_visitors');
  const convEl = document.getElementById('lf_conv');
  const respEl = document.getElementById('lf_resp');
  const closeEl = document.getElementById('lf_close');
  const dealEl = document.getElementById('lf_deal');
  const missedEl = document.getElementById('lf_missed');
  const revenueEl = document.getElementById('lf_revenue');
  const bridgeEl = document.getElementById('lf_bridge');
  const areasEl = document.getElementById('lf_areas');
  const fmt = (n) => Math.max(0, Math.round(n)).toLocaleString('en-GB');
  const render = () => {
    const visitors = parseFloat(visitorsEl.value) || 0;
    const conv = (parseFloat(convEl.value) || 0) / 100;
    const resp = parseFloat(respEl.value) || 0;
    const close = (parseFloat(closeEl.value) || 0) / 100;
    const deal = parseFloat(dealEl.value) || 0;
    const bConv = 0.03, bResp = 5, bClose = 0.25;
    const actualLeads = visitors * conv;
    const convGap = Math.max(0, visitors * bConv - actualLeads);
    const slowFactor = Math.min(0.8, Math.max(0, (resp - bResp) / 55) * 0.8);
    const slowLoss = actualLeads * slowFactor;
    const closeGap = actualLeads * Math.max(0, bClose - close);
    const missedLeads = convGap + slowLoss;
    const lostRevenue = (missedLeads * Math.max(close, 0.05) * deal) + (closeGap * deal);
    missedEl.textContent = fmt(missedLeads);
    revenueEl.textContent = '£' + fmt(lostRevenue);
    if (bridgeEl) bridgeEl.textContent = '£' + fmt(lostRevenue);
    const items = [];
    if (conv < bConv) items.push(`Website conversion is ${(conv*100).toFixed(1)}% (below the 3% benchmark)`);
    if (resp > bResp) items.push(`${resp} min response time, fast leads going to competitors`);
    if (close < bClose) items.push(`Close rate of ${(close*100).toFixed(0)}% suggests sales follow-up gaps`);
    if (visitors < 1000) items.push('Traffic volume is low, paid acquisition can move the needle fast');
    if (items.length === 0) items.push('Strong fundamentals across the board');
    areasEl.innerHTML = items.map(t => `<li>${t}</li>`).join('');
  };
  [visitorsEl, convEl, respEl, closeEl, dealEl].forEach(el => el.addEventListener('input', render));
  render();

  // Inner CTAs
  document.getElementById('lf_fix').addEventListener('click', () => { closeLeak(); openBook(); });
  document.getElementById('lf_download').addEventListener('click', () => { closeLeak(); openLead(); });
  document.getElementById('lf_book').addEventListener('click', () => { closeLead(); openBook(); });

  // Lead form submission
  const leadForm = document.getElementById('lf_form');
  const submitBtn = document.getElementById('lf_submit');
  const successEl = document.getElementById('lf_success');
  leadForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    submitBtn.disabled = true;
    submitBtn.querySelector('span').textContent = 'Sending…';
    try { await fetch(leadForm.action, { method:'POST', body: new FormData(leadForm), headers:{Accept:'application/json'} }); } catch(_) {}
    leadForm.style.display = 'none';
    successEl.classList.add('is-shown');
    submitBtn.disabled = false;
    submitBtn.querySelector('span').textContent = 'Email me the breakdown';
  });

  // Auto-wire CTA buttons across the blog page
  // Any .btn link pointing at the home page #contact or #calculator anchors opens the matching modal in-page.
  document.querySelectorAll('a.btn[href*="#contact"]').forEach(a => a.addEventListener('click', openBook));
  document.querySelectorAll('a.btn[href*="#calculator"]').forEach(a => a.addEventListener('click', openLeak));
})();

// Back to top button
(function(){
  const existing = document.getElementById('toTop');
  const btn = existing || (() => {
    const b = document.createElement('button');
    b.className = 'to-top';
    b.id = 'toTop';
    b.type = 'button';
    b.setAttribute('aria-label', 'Back to top');
    b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 14 12 8 18 14"/></svg>';
    document.body.appendChild(b);
    return b;
  })();
  const onScroll = () => { btn.classList.toggle('is-visible', window.scrollY > 400); };
  window.addEventListener('scroll', onScroll, { passive: true });
  btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  onScroll();
})();
