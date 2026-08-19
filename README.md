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
| `/sales` | `crm.html` | The private sales CRM (`/crm` redirects here) |
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

---

# The sales CRM

A private prospecting tool at **`/sales`**, built for one job: 100 outbound calls a
day, 500 a week, without losing track of anyone. It is part of this site, not a
separate app: same Vercel project, same serverless pattern, same typeface and
colours. Nothing about the public site changed.

## What it does

| Screen | What it is for |
| --- | --- |
| Dashboard | Today and this week against target, conversion rates, and which sector is actually producing |
| Today | The generated call list, and calling mode: one prospect at a time, one keystroke per outcome |
| Pipeline | Ten-stage Kanban. Drag a card, the stage saves |
| Prospects | Search, filter and export the whole database |
| Follow Ups | Overdue, today, tomorrow, this week, later |
| Import | CSV or XLSX with column mapping and duplicate checking |
| Settings | Targets, retry rules, call script, email templates, exclusions, accounts |

## The daily 100

The call list is **generated, not assigned**, so an unused day never burns a
hundred leads. Priority, highest first:

1. Follow-ups due today or overdue
2. No-answer prospects whose retry date has arrived
3. Gatekeeper and spoke-to-them retries
4. New prospects, scored on rating, then closeness to London, then whether there
   is a named contact, a direct number, and a researched angle

Once generated for a day it is stored, which is what keeps "38 of 100" stable
while you work down it, and lets a skipped prospect come back tomorrow rather
than vanish.

Never in a call list: excluded companies, archived ones, Won, Lost, wrong
numbers, anyone with no phone number, and anyone past the attempt limit.

## Retry rules

Working days, weekends skipped, all editable in Settings.

| Outcome | What happens |
| --- | --- |
| No Answer | Attempted, retry in **2** working days |
| Gatekeeper | Attempted, retry in **3** |
| Spoke to Decision Maker | Contacted, retry in **5**, and you are asked for a follow-up straight away |
| Follow Up | Follow Up stage, your chosen date replaces any automatic retry |
| Meeting Booked | Meeting Booked, meeting recorded |
| Not Interested / Lost | Lost, out of the queue, history kept |
| Wrong Number | Out of the queue until the number is corrected |
| Won | Won, out of the queue |

Nothing ever overwrites history. Every attempt is a row in `activities`.

## Getting set up

### 1. Environment variables

See `.env.example`. The short version:

| Variable | Needed | What for |
| --- | --- | --- |
| `CRM_SESSION_SECRET` | **yes** | Signs the session cookie. No value, no CRM |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | **yes, live** | The database. Already used by the site admin |
| `CRM_SETUP_KEY` | optional | Lets you create the first account from the browser |
| `CRM_TIMEZONE` | optional | Defaults to `Europe/London` |
| `ELEVENLABS_API_KEY` | optional | Call transcription. Costs money |
| `ANTHROPIC_API_KEY` | optional | Drafting follow-up emails. Costs money |

### 2. The database

Locally there is nothing to do: it uses SQLite at `.data/crm.db`, which is
gitignored. On Vercel the filesystem is read only, so it needs Postgres:

```bash
node tools/crm.mjs migration        # prints the schema
```

Paste that into the Supabase SQL editor and run it once. It is also saved at
`tools/crm-schema.sql`. Every table gets Row Level Security **on with no
policies**, so the service role key (server side only) is the only thing that
can read a row. The anon key cannot.

The schema is generated from `lib/crm/schema.mjs`, which is also what creates
the SQLite tables, so the two databases cannot drift apart.

### 3. Your admin account

Forgot it later? With `RESEND_API_KEY` and `CRM_FROM_EMAIL` set, the sign-in
screen can email a reset link that lasts 30 minutes and works once. Without
them it says so, and the way back in is:

```bash
node --env-file=.env.production.local tools/crm.mjs set-password you@example.com
```


```bash
CRM_SESSION_SECRET=... node tools/crm.mjs create-user
```

It asks for email, name, password (10 characters minimum, hidden while typing)
and an optional unlock PIN. The first account created is the owner.

Or, if you would rather do it in the browser: set `CRM_SETUP_KEY`, open `/sales`,
and fill in the setup screen. That screen closes permanently the moment one
account exists, key or no key.

To add someone later: Settings, Accounts, Add someone. Or run the command again.
They get their own call list, their own follow-ups and their own numbers.

### 4. Your first real list

1. `/sales`, then **Import**
2. Drop the CSV or XLSX. Column headings are matched automatically against a
   long alias list, so "Phone", "Tel", "Company Phone" and "Main Number" all
   find Main Phone. Anything it cannot place is set to *(ignore)* and you fix it
   on screen.
3. **Check for duplicates.** It matches on website domain first, then phone
   number, then a normalised company name, against everything already stored
   *and* the rest of the file. You see what is new, what already exists and why
   before anything is written.
4. Choose whether existing prospects are skipped or updated. Updating never
   blanks a filled-in field with an empty cell.
5. Import. You get counts for processed, added, updated, skipped and errors.

Anything matching your exclusion list is imported but flagged excluded, so it
never reaches a call list and you still have the record.

There is a command line route too, for big files:

```bash
node tools/crm.mjs import prospects.csv           # add new only
node tools/crm.mjs import prospects.csv --update  # refresh existing as well
```

Only Company Name is mandatory. Everything else is optional.

### 5. Sample data

Twenty invented companies with a worked history, so every screen has something
to show before you import anything real. Nothing in it is a real business, and
every phone number is in Ofcom's reserved drama range.

```bash
node tools/crm.mjs seed
node tools/crm.mjs clear-seed     # or Settings, Sample data
```

**Clear it before you start calling for real**, or invented companies end up in
your numbers.

## Deploying

Same as the rest of the site: push to GitHub, Vercel deploys. Before the first
deploy, set `CRM_SESSION_SECRET` in Vercel and run the migration in Supabase.
The CRM says so on screen if it is running without a durable database, rather
than pretending to save.

## Security

- Real accounts in a `users` table. Passwords and PINs are scrypt hashes with
  per-value salts, never stored or logged in the clear.
- Sessions are HMAC-signed cookies (HttpOnly, SameSite=Strict, Secure), 12
  hours. Each carries a token version, so changing a password signs every
  device out.
- The PIN is a **lock**, not a login. It only reopens a session that already
  exists and is still valid. A PIN with no cookie is worthless. It is verified
  on the server, never in the browser.
- `/api/crm` is POST only, same-origin only, and every action except `status`,
  `login` and `bootstrap` fails closed without a session.
- `noindex` on the page, `X-Robots-Tag` on the route and the API,
  `Referrer-Policy: no-referrer`, and `robots.txt` disallows `/sales`.
- Prospect data never touches git. `.data/` is ignored.
- Archiving is the default. Permanent delete only works on something already
  archived, and says exactly what it will destroy.

## The smart features

Both cost money per use. Both are off until a key exists **and** you turn them
on in Settings, so nothing starts billing you the moment a key appears.

**Call recording and transcription** records through your microphone during a
call, transcribes it, drops a summary into the note field and saves the full
transcript on the activity. Roughly $0.30 to $0.45 an audio hour.
**UK law expects you to tell the other party they are being recorded**, and the
CRM says so every time you arm it.

**Drafted follow-up emails** add "Write it for me" to the email window, which
writes from that company's history and the transcript of the call you just had.
Roughly a penny an email.

Free and always on: the email templates with merge fields, browser dictation for
call notes, and `tel:` links that dial from a phone.

### What is deliberately not here

**True auto-dialling.** Browser JavaScript cannot place a phone call. It needs a
VoIP carrier, which is about £40 to £60 a month at 500 calls a week plus
per-minute charges. What is here instead is hands-free dialling: the queue
auto-advances, 1 to 5 log the common outcomes, S skips, arrow keys move. Outcome
logging is deliberately separate from the interface, so a Twilio layer can be
added later without touching it.

## Layout

```
crm.html                     the shell: sign in, lock, app
assets/crm.css               the design system for the tool
assets/crm/app.js            sign in, theme, lock, search, shortcuts
assets/crm/nav.js            routing, kept apart from app.js on purpose
assets/crm/view-*.js         one file per screen
assets/crm/record.js         the prospect drawer
assets/crm/dialogs.js        follow-up, meeting, opportunity and email modals
assets/crm/sheet.js          CSV and XLSX, read and write, no library
lib/crm/schema.mjs           the data model, and both dialects of it
lib/crm/db.mjs               one query interface, SQLite and Supabase behind it
lib/crm/auth.mjs             accounts, hashing, sessions, PIN
lib/crm/queue.mjs            the daily 100, retry rules, what an outcome does
lib/crm/metrics.mjs          the dashboard numbers
lib/crm/importer.mjs         normalising, matching, importing
lib/crm/settings.mjs         defaults and the settings document
lib/crm/ai.mjs               transcription and email drafting, both optional
lib/crm/scoreboard.mjs       points, pace, streaks and milestones
lib/crm/seed.mjs             the fictional sample data
lib/crm/api.mjs              the API, shared by the function and serve.mjs
api/crm.mjs                  POST /api/crm?action=...
tools/crm.mjs                the command line
tools/crm-schema.sql         the Postgres migration, ready to paste
```

Two decisions worth knowing about. **Pipeline stages, sectors and services live
in `settings` rather than their own tables**: they are short ordered lists only
ever read whole, and a settings row makes them editable from the UI without a
migration every time a stage is renamed. And **aggregation happens in JavaScript
over bounded row sets rather than in SQL**, because 500 calls a week is a couple
of thousand rows, and it means SQLite and Postgres cannot disagree about what a
conversion rate is.

## The scoreboard

Cold calling gives almost no feedback of its own: most calls end in nothing and
the wins are weeks apart. So Today and the Dashboard carry a scoreboard that
counts the things you actually control.

- **Points** per outcome, weighted towards what moves a deal: a dial is 1, a
  gatekeeper 2, a real conversation 5, a follow-up 8, qualified 15, a meeting
  25, an offer 30, a win 100.
- **Pace** against the clock, 9am to 5pm, so "37 calls" reads as ahead or behind
  rather than just a number.
- **Streak** of consecutive working days that hit target. Today only counts once
  it is actually hit, so it never flatters you mid-morning, and it does not break
  until tomorrow.
- **Milestones** at 10, 25, 50, 75 and 100 percent of target, which fire a toast
  as you cross them. Never a modal, because nothing should interrupt a call run.
- **Ranks**: Warming up, Dialled in, On a roll, Closer, Machine.

It is read-only over the activities that already exist, so it cannot distort the
numbers it is reporting.

## Light and dark

A toggle in the header, and `Ctrl+J`. Three states: an explicit choice wins, and
with no choice it follows your system and keeps following it. The choice is
applied before first paint, so there is no flash of the wrong theme on load.

## Keyboard

| Key | Does |
| --- | --- |
| `1` to `5` | No Answer, Gatekeeper, Spoke to DM, Follow Up, Meeting Booked |
| `S` | Skip (comes back tomorrow) |
| Left / Right | Previous and next prospect |
| `Esc` | Leave calling mode, or close a drawer |
| `/` | Global search |
| `g` then `d t p r f i s` | Jump to Dashboard, Today, Pipeline, pRospects, Follow ups, Import, Settings |
| `Ctrl+L` | Lock |
| `Ctrl+J` | Light, dark, or follow the system |
