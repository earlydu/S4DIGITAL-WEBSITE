// The optional smart layer: call transcription and drafted follow-up emails.
//
// Both cost money per use, so both are off until a key exists AND the toggle in
// Settings is on. With neither, the CRM is completely unaffected: you still get
// the email templates, which are free and do most of the work.
//
//   Transcription   ELEVENLABS_API_KEY   scribe_v1, roughly $0.30-0.45 an audio hour
//   Drafting        ANTHROPIC_API_KEY    Sonnet 5 by default, roughly $0.014 an email
//
// UK note: you must tell the other party a call is being recorded. The CRM shows
// that reminder every time recording is armed. It is not decoration.

import { select, byId } from './db.mjs';
import { getSettings } from './settings.mjs';

export const transcribeReady = () => Boolean(process.env.ELEVENLABS_API_KEY);
export const draftReady = () => Boolean(process.env.ANTHROPIC_API_KEY);

export async function aiStatus() {
  const settings = await getSettings();
  return {
    transcribe: { keyed: transcribeReady(), enabled: Boolean(settings.ai.transcribeEnabled) && transcribeReady() },
    draft: { keyed: draftReady(), enabled: Boolean(settings.ai.draftEnabled) && draftReady() },
    model: process.env.CRM_AI_MODEL || 'claude-sonnet-5',
    notice: settings.ai.recordingNotice,
  };
}

/* ------------------------------------------------------------ transcription */

const MAX_AUDIO_BYTES = 24 * 1024 * 1024;   // ~25 minutes of opus. Plenty for a cold call.

export async function transcribe({ base64, mimeType = 'audio/webm' }) {
  const settings = await getSettings();
  if (!transcribeReady()) throw new Error('Transcription needs ELEVENLABS_API_KEY on the server.');
  if (!settings.ai.transcribeEnabled) throw new Error('Transcription is switched off in Settings.');

  const bytes = Buffer.from(String(base64 || ''), 'base64');
  if (!bytes.length) throw new Error('No audio was sent.');
  if (bytes.length > MAX_AUDIO_BYTES) throw new Error('That recording is too long to transcribe in one go.');

  const form = new FormData();
  form.append('file', new Blob([bytes], { type: mimeType }), 'call.webm');
  form.append('model_id', process.env.ELEVENLABS_STT_MODEL || 'scribe_v1');
  form.append('language_code', 'eng');
  form.append('diarize', 'true');

  const res = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
    method: 'POST',
    headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY },
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data && (data.detail?.message || data.detail || data.message)) || `Transcription failed (${res.status})`;
    const err = new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
    err.status = res.status;
    throw err;
  }

  const words = Array.isArray(data.words) ? data.words : [];
  const speakers = [...new Set(words.map(w => w.speaker_id).filter(Boolean))];
  return {
    text: data.text || '',
    speakers: speakers.length,
    seconds: words.length ? Math.round(words[words.length - 1].end || 0) : null,
  };
}

/* ---------------------------------------------------------------- drafting */

const EFFORT_MODELS = /^claude-(opus-5|opus-4-|sonnet-5|sonnet-4-6|fable-5)/;

async function callClaude({ system, user, maxTokens = 1200 }) {
  const model = process.env.CRM_AI_MODEL || 'claude-sonnet-5';
  const body = {
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: user }],
  };
  // Short factual emails do not need deep reasoning, and effort is what costs.
  if (EFFORT_MODELS.test(model)) body.output_config = { effort: 'low' };

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error((data && data.error && data.error.message) || `Claude error ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return (data.content || []).map(x => x.text || '').join('').trim();
}

const SYSTEM = `You write short follow-up emails for Earl at S4Digital, a UK content agency that produces photography, video and social media content for businesses.

Rules, all of them non-negotiable:
- British English. Never American spelling.
- Never use em dashes. Use a comma, a full stop, or " - " instead.
- 120 words maximum in the body. Shorter is better.
- Reference something specific and true from the call notes or transcript. If there is nothing specific, say less rather than inventing detail.
- Never invent facts, numbers, names, dates, prices or claims that are not in the material you were given.
- No marketing waffle, no "I hope this email finds you well", no "circling back", no bullet lists unless the call clearly called for one.
- Plain and direct, like one person writing to another. One clear next step at the end, phrased as a question.
- Do not sign off with a signature block. The signature is added afterwards.

Return strict JSON and nothing else: {"subject": "...", "body": "..."}. Use \\n for line breaks in the body.`;

/** Everything known about a prospect, compressed into a briefing. */
async function briefing(companyId, { limit = 12 } = {}) {
  const company = await byId('companies', companyId);
  if (!company) throw new Error('That prospect no longer exists.');
  const contacts = await select('contacts', {
    where: [{ col: 'company_id', op: 'eq', val: companyId }],
    order: [{ col: 'is_primary', dir: 'desc' }],
    limit: 5,
  });
  const activities = await select('activities', {
    where: [{ col: 'company_id', op: 'eq', val: companyId }],
    order: [{ col: 'occurred_at', dir: 'desc' }],
    limit,
  });
  return { company, contact: contacts[0] || null, activities: activities.reverse() };
}

export async function draftEmail({ companyId, purpose = 'follow up after the call', transcript, extra }) {
  const settings = await getSettings();
  if (!draftReady()) throw new Error('Email drafting needs ANTHROPIC_API_KEY on the server.');
  if (!settings.ai.draftEnabled) throw new Error('Email drafting is switched off in Settings.');

  const { company, contact, activities } = await briefing(companyId);
  const history = activities.map(a => {
    const when = (a.occurred_at || '').slice(0, 10);
    const parts = [`${when} ${a.detail || a.type}`];
    if (a.note) parts.push(`note: ${a.note}`);
    if (a.transcript) parts.push(`transcript: ${String(a.transcript).slice(0, 4000)}`);
    return parts.join(' | ');
  }).join('\n');

  const user = [
    `Purpose: ${purpose}`,
    '',
    `Company: ${company.name}`,
    company.sector && `Sector: ${company.sector}${company.sub_sector ? ' / ' + company.sub_sector : ''}`,
    company.location && `Location: ${company.location}`,
    company.key_services && `What they do: ${company.key_services}`,
    company.marketing_opportunity && `The angle Earl researched: ${company.marketing_opportunity}`,
    contact && `Writing to: ${[contact.first_name, contact.last_name].filter(Boolean).join(' ')}${contact.job_title ? ', ' + contact.job_title : ''}`,
    '',
    'Recent history, oldest first:',
    history || '(no history yet)',
    transcript ? `\nTranscript of the call just finished:\n${String(transcript).slice(0, 12000)}` : '',
    extra ? `\nEarl adds: ${extra}` : '',
  ].filter(Boolean).join('\n');

  const raw = await callClaude({ system: SYSTEM, user });

  let out;
  try {
    out = JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, ''));
  } catch {
    out = { subject: `Following up - ${company.name}`, body: raw };
  }

  const sig = (settings.profile && settings.profile.signature) || '';
  return {
    subject: String(out.subject || '').slice(0, 200),
    body: `${String(out.body || '').trim()}${sig ? `\n\n${sig}` : ''}`,
    to: (contact && contact.direct_email) || company.general_email || '',
  };
}

/** Short bullet notes from a transcript, for pasting into the activity note. */
export async function summariseCall({ transcript, companyId }) {
  if (!draftReady()) throw new Error('Call notes need ANTHROPIC_API_KEY on the server.');
  const settings = await getSettings();
  if (!settings.ai.draftEnabled) throw new Error('AI notes are switched off in Settings.');
  const { company } = await briefing(companyId, { limit: 3 });

  const text = await callClaude({
    maxTokens: 600,
    system: 'You summarise UK B2B sales calls. British English. No em dashes. Never invent anything that was not said. Reply with 2 to 5 short lines, each starting with "- ". No preamble.',
    user: `Company: ${company.name}\n\nTranscript:\n${String(transcript || '').slice(0, 14000)}`,
  });
  return { notes: text };
}
