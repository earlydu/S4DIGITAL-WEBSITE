# s4digital — Website

Marketing site for **s4digi.com**, a content agency producing professional photography, video and social media content for businesses, organisations and personal brands.

## Stack

- Static HTML, one shared CSS file, one shared JS file. No build step.
- [Satoshi](https://www.fontshare.com/fonts/satoshi) from Fontshare.
- [Cal.com](https://cal.com) booking in a modal (`data-cal-url` on `#bookModal`).
- [FormSubmit](https://formsubmit.co) for enquiry forms (all send to `earl@s4digi.com`).
- Two Vercel serverless functions for the admin, plus the PlanPulse one.

## Run locally

```bash
ADMIN_PASSWORD=something node serve.mjs   # http://localhost:4000
```

`serve.mjs` mirrors every Vercel rewrite, redirect and API route, so what you see locally is what deploys.

## Pages

| URL | File | Notes |
| --- | --- | --- |
| `/` | `index.html` | Home |
| `/services` | `services.html` | Three service levels, disciplines, add-ons, terms, FAQ |
| `/personal-brand-shoot` | `personal-brand-shoot.html` | The £795 + VAT one-off shoot |
| `/work` | `work.html` | Filterable case study index |
| `/work/<slug>` | `case-study.html` | One case study, rendered from `content/work.json` |
| `/about` | `about.html` | Studio story and how the team is set up |
| `/contact` | `index.html#contact` | Rewrite to the home page contact section |
| `/blog` | `blog.html` | Index, rendered from `content/posts.json` |
| `/blog/<slug>` | existing file, else `post.html` | The seven original posts still have their own files |
| `/admin` | `admin.html` | Password protected editor |
| `/planpulse` | `planpulse.html` | Unchanged |

Old URLs are kept: `/pricing`, `/faq`, `/calculator`, `/testimonials` and `/projects` all 301 to their new homes.

## Content

Everything editable lives in `content/`:

- `content/work.json` — case studies. Powers `/work`, every `/work/<slug>` page and the featured cards on the home page.
- `content/posts.json` — blog posts, including status (`published` / `draft`).

Both reach the browser through `GET /api/content?file=work|posts`, which filters out drafts. Edit the files directly, or use the admin.

## The admin

`/admin`, one password, no user accounts.

1. Set `ADMIN_PASSWORD` (see `.env.example`). **With no password set the admin is unreachable and nothing can be edited.**
2. Sign in at `/admin`.
3. Posts: write, format, insert images and video, embed YouTube or Vimeo, publish and unpublish. Drafts are never sent to the browser.
4. Case studies: edit every field, reorder, choose which appear on the home page.
5. Media: upload photos and video once, reuse anywhere.

Post HTML is sanitised on the server against an allowlist, so nothing pasted into the editor can inject a script.

### Making the admin save on the live site

Vercel's filesystem is read only, so saving needs external storage. The store has a Supabase driver ready:

1. Create a Supabase project and a **public** storage bucket (default name `s4digital`).
2. Set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and optionally `SUPABASE_BUCKET` in Vercel.
3. Redeploy. The admin then reads and writes `content/*.json` in the bucket and uploads media straight from the browser via signed URLs.

Until that is done the live site still renders fine, it just cannot be edited from the browser, and the admin says so on screen.

## Files

- `index.html`, `services.html`, `personal-brand-shoot.html`, `work.html`, `case-study.html`, `about.html`, `blog.html`, `post.html`, `admin.html`
- `assets/site.css` — the whole design system, shared by every page
- `assets/site.js` — nav, theme, booking modal, carousels, accordions, reveal
- `assets/work.js`, `assets/post.js`, `assets/form.js`, `assets/admin.js`, `assets/admin.css`
- `assets/work/` — photography and film stills used across the site
- `assets/uploads/` — local uploads (gitignored, the live site uses Supabase)
- `lib/api.mjs`, `lib/admin.mjs`, `lib/store.mjs` — the admin, written once and shared by the Vercel functions and `serve.mjs`
- `api/content.mjs`, `api/admin.mjs`, `api/generate.mjs`
- `_backup/` — snapshot of the site before the 2026 content repositioning (gitignored)

## Swap before going live

- Cal.com booking link — `data-cal-url` on `#bookModal`
- `ADMIN_PASSWORD`, and the Supabase variables if you want live editing

## Deploying

Push to GitHub, Vercel deploys from it. Never push without being asked.
