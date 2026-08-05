/* s4digital — contact form submit without leaving the page.
   Posts to FormSubmit so enquiries land in earl@s4digi.com. */
(function () {
  'use strict';
  document.querySelectorAll('form.cta__form[action]').forEach(form => {
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const btn = form.querySelector('button[type="submit"]');
      const label = btn ? btn.querySelector('span') : null;
      if (label) label.textContent = 'Sending…';
      if (btn) btn.disabled = true;
      try {
        const res = await fetch(form.action, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(Object.fromEntries(new FormData(form)))
        });
        if (!res.ok) throw new Error('submit failed');
        if (label) label.textContent = 'Sent. Talk soon ✓';
        form.reset();
      } catch (err) {
        if (label) label.textContent = 'Please email earl@s4digi.com';
        if (btn) btn.disabled = false;
      }
    });
  });
})();
