# S4 Digital — Website

Marketing site for **s4digital.com**, a digital growth studio for EV installers, service providers, suppliers, manufacturers and energy brands.

## Stack

- Static HTML, CSS, vanilla JS. No build step.
- [Satoshi](https://www.fontshare.com/fonts/satoshi) loaded from Fontshare.
- [jsPDF](https://github.com/parallax/jsPDF) loaded from CDN, used for the personalised "Lead Leak Breakdown" PDF.
- [Cal.com](https://cal.com) booking embedded in a modal.
- [FormSubmit](https://formsubmit.co) for the lead capture form (sends to `earl@s4digi.com`).

## Run locally

This is a static site, any HTTP server works. The repo includes a tiny PowerShell server (`.serve.ps1`, gitignored) that listens on `http://127.0.0.1:5173`. Other quick options:

```bash
# Python (any version >= 3)
python -m http.server 5173

# Node
npx serve -l 5173 .
```

Then open `http://127.0.0.1:5173/`.

## Files

- `index.html` — the home page (one big single-file site)
- `blog.html` — the blog listing page
- `assets/` — logos, brand asterisk, hero hub mockup, BBC Coffee gif, Earl photos, client logos
- `video_content/` — the three 9:16 videos shown in the FAQ iPhone carousel
- `EMAIL_SEQUENCE.md` — copy for the Lead Leak Calculator email funnel (drop into Mailchimp / Klaviyo / GoHighLevel)

## Configuration to swap before going live

- Cal.com booking link — `data-cal-url` attribute on `#bookModal` in `index.html`
- Lead form / breakdown email recipient — `formsubmit.co/ajax/earl@s4digi.com` in `index.html` (also in the booking and lead modals)
- Replace text wordmarks in `assets/clients/` with real logo PNGs if any are missing

## Deploying

The site is fully static, so any of these work without changes:

- **GitHub Pages** — easiest. After pushing, go to the repo's *Settings → Pages → Build from branch → main / root* and save. To use `s4digital.com`, drop a `CNAME` file at the root with `s4digital.com` as its only line, then point your DNS at GitHub Pages.
- **Cloudflare Pages** — connect the repo, build command empty, output directory `/`.
- **Netlify** / **Vercel** — connect the repo, no build settings needed.
