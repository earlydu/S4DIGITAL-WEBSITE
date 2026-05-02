# S4 Digital — Lead Leak Calculator Funnel Copy

This is the full set of copy for the calculator funnel. Drop it straight into your email tool (Mailchimp, Klaviyo, GoHighLevel, ConvertKit, ActiveCampaign — pick one). Use British English. Use merge tags listed in `{{curly braces}}` so each email is personalised.

Suggested merge tags (FormSubmit captures all of these for you when the form is submitted):

- `{{name}}` — visitor's first name
- `{{company}}` — their company
- `{{website}}` — their website
- `{{visitors}}` — monthly visitors
- `{{conv}}` — their conversion rate
- `{{resp}}` — their response time
- `{{close}}` — their close rate
- `{{deal}}` — their average deal value
- `{{missed}}` — estimated missed leads / month
- `{{revenue}}` — estimated lost revenue / month
- `{{cal_link}}` — `https://cal.eu/s4digital/30min`

---

## Lead capture modal copy (already on the site)

The form modal that opens when someone clicks **"Download the breakdown"**.

### Headline
**Get your full lead leak breakdown**

### Subhead
We will send a personalised PDF to your inbox using the numbers you entered, plus the priority fixes that recover the most revenue first.

### Live preview line (shows their actual numbers)
Your estimated leak **{{revenue}} per month**, **{{missed}}** missed leads.

### Form fields
- Your name
- Email
- Company
- Phone (optional)
- Website

### Submit button
Email me the breakdown

### Privacy line
We will only use this to send the report and the occasional growth note. Unsubscribe any time.

### Success screen
**Your breakdown is on its way.**
Check your inbox in the next minute or two, your personalised PDF has just downloaded too. Want to walk through the fixes together? Book a 30 minute call below.

Primary CTA: **Book my call** → opens Cal.com booking

---

## Email 1 — Immediate (sent on submission)

**From:** Earl Duncan <earl@s4digi.com>
**Subject:** Your lead leak breakdown is here, {{name}}
**Preview text:** {{revenue}} a month is more recoverable than you think.

---

Hi {{name}},

Your lead leak breakdown is attached.

Quick recap of what we found at {{company}}:

- **Estimated missed leads:** {{missed}} per month
- **Estimated lost revenue:** {{revenue}} per month
- **The biggest leak:** the conversion gap on {{website}}, paired with response time

Most of this is fixable in 30 to 60 days. Not because we're magicians, but because the same three things break in nearly every EV and energy business we audit:

1. The site does not convert as well as it could
2. Leads wait too long for a reply
3. The follow-up sequence is missing or too short

Page 2 of your PDF walks through exactly what to do about each one.

If you want to talk through it together, book a 30 minute call here. No pitch, just a working session on the priority fix for **{{company}}**:

→ {{cal_link}}

Earl
Founder, S4 Digital
earl@s4digi.com

P.S. Reply to this email if you'd like me to send a short Loom video walking through your specific numbers. I'm happy to do it for free.

---

## Email 2 — Day 2

**Subject:** The 60% rule (most installers ignore this)
**Preview text:** A small change in response time changes everything.

---

Hi {{name}},

Quick one.

Most EV installers and energy brands we work with are losing more than 60% of their inbound leads to a single thing: response time.

The HBR research is well-known but the numbers are blunt. Reply to a web enquiry in:

- under **5 minutes** → 21x more likely to qualify the lead
- 5 to 30 minutes → drops to 6x
- 30 minutes to 24 hours → drops to under 1x

Your number is **{{resp}} minutes**.

That's why your calculator output flagged response time as one of the leaks. It's also why this is usually the cheapest, fastest fix — it doesn't need new traffic, new ads or a redesign. It needs a CRM, an SMS automation, and someone or something that replies.

We deploy this stack in week one with our Growth System clients. The shift is normally visible inside two reporting cycles.

If you want to plug this in for {{company}}:
→ {{cal_link}}

Earl

---

## Email 3 — Day 5

**Subject:** A {{company}}-style installer doubled enquiries doing this
**Preview text:** Real numbers, real install, real timeline.

---

Hi {{name}},

Real story. We worked with an installer in the Midlands. Same setup as you on paper:

- mid 4-figure monthly visitors
- a website that "looked fine"
- a 4 to 6 hour reply time on web forms
- a small but eager team

Three changes, run alongside their normal operations:

1. Rebuilt the homepage and one campaign-specific landing page
2. Plugged in a CRM with SMS + email follow-ups (under 60 seconds reply)
3. Wrote a 14-day nurture sequence that explained the install process

Result over 90 days:

- enquiries up **+184%**
- close rate up from 18% to 28%
- £60k commercial install closed off a single LinkedIn post

That's the **S4 Growth System** in action. Same playbook would apply to {{company}}.

If you want to see what it looks like for your numbers specifically, book a 30 minute slot and I'll walk you through it on Loom afterwards:

→ {{cal_link}}

Earl

---

## Email 4 — Day 9

**Subject:** Worth a 30-min chat?
**Preview text:** Last nudge before I leave you alone.

---

Hi {{name}},

I'll keep this short.

You ran the numbers. We sent the breakdown. The estimated leak at {{company}} was **{{revenue}} a month**. Even if our model is half wrong, that's still a meaningful figure.

If now isn't the right time, no stress. I'll keep sending you a short note each Friday with one growth idea — you can unsubscribe any time and you won't hear from me daily.

But if you'd like to actually fix it:

→ Book a 30 minute call: {{cal_link}}
→ Or reply to this email with a single line: "send a Loom"

Earl

---

## Optional Email 5 — Day 14 (only if not booked)

**Subject:** What do you want me to send next?
**Preview text:** Three options. Pick one.

---

Hi {{name}},

I won't keep emailing about the breakdown — I know that's not why you signed up.

Pick one and reply with the number:

1. **A short Loom** walking through your specific lead leak numbers
2. **A 1-page proposal** for fixing your top leak (no commitment)
3. **The growth note** only — keep me in the loop, no sales

Whatever you pick, I'll respect it.

Earl

---

# PDF design notes

The PDF is generated client-side with **jsPDF** as soon as the form is submitted. It downloads automatically to the visitor's machine and you receive a copy of their inputs by email via FormSubmit, so you have the lead instantly.

## Page 1 — cover + diagnosis

- Black header band with the brand wordmark text and "Lead Leak Breakdown" eyebrow
- Personalised: `Where {{company}} is losing leads each month`
- Sub-line: `Prepared for {{name}} • {{date}}`
- The two headline numbers, large:
  - **{{revenue}} / month** (in S4 orange)
  - **{{missed}} missed leads every month**
- A clean table of "the numbers you gave us" with each input alongside the industry benchmark for context
- The adaptive "where the leaks are" bullet list, mirroring exactly what they saw on the site

## Page 2 — solution + soft pitch

- Eyebrow: "THE 30 TO 60 DAY PLAN"
- Title: "Three fixes that recover most of it"
- Three numbered sections, each with a fix and the expected uplift:
  1. Convert more of the traffic you already have
  2. Reply within 5 minutes, every time
  3. Tighten the sales follow-up sequence
- A soft offer block in light grey:
  - "If you want us to build this for you"
  - "The S4 Growth System covers all three fixes in one engagement"
  - "From £2,500 / month. Funnel build, paid ads, CRM and automations, weekly reporting, ongoing optimisation. Most clients see the gap closing within the first two reporting cycles."
- Footer: a clear "Next step → cal.eu/s4digital/30min" line, plus contact

## Tone

The PDF doesn't say "buy now". It diagnoses, shows the fix, and tells the reader exactly what the £2,500 product does in plain English. The £2.5k is anchored against the £X,000+ they're losing, so the price feels like a saving, not a cost.

## How to swap the PDF design

The PDF is built inside `index.html` in the `generatePDF` function. Edit the headline strings, the three fixes, and the offer block there. No backend required.

---

# Wiring the email sequence

The form posts to `https://formsubmit.co/ajax/earl@s4digi.com`. FormSubmit emails you each submission immediately so you have the lead in your inbox.

To run the actual drip sequence, point the form at your email tool's API instead. The two clean options:

**Option A — Mailchimp / Klaviyo / ConvertKit etc.**
Replace the FormSubmit action URL in `index.html` (search for `formsubmit.co/ajax/earl@s4digi.com`) with your provider's hosted form endpoint. Map fields: Name → first_name, Email → email, Company → company, Website → website, Phone → phone, plus the calculator hidden fields. Set the sequence above as a 5-email automation triggered when the contact is added.

**Option B — Zapier / Make**
Keep FormSubmit on the form. Add a Gmail filter or a Zap that watches `earl@s4digi.com` for the subject `New Lead Leak Calculator submission`, parses the email, and adds the contact + tags to your CRM, which then triggers the sequence.

Either way, the website does not need to change again to make the sequence run.
