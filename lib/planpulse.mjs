// Shared PlanPulse generation logic.
// Used by the Vercel serverless function (api/generate.mjs) and the local dev
// server (serve.mjs) so the prompt lives in exactly one place.

export const VALID_MODELS = ["claude-haiku-4-5-20251001", "claude-sonnet-4-6", "claude-opus-4-7"];
export const DEFAULT_MODEL = "claude-sonnet-4-6";

export function pickMaxTokens(durationLabel) {
  return /3\s*month/i.test(durationLabel || "") ? 32000 : 16000;
}

export function buildSystemPrompt() {
  return `You are an expert social media strategist and content planner. You specialise in creating actionable content calendars for UK-based service and trade businesses (including EV installers, plumbers, electricians, roofers, landscapers, builders, cafés and more). You understand seasonal UK events, public holidays, industry awareness days, and trending content formats across Instagram, Facebook, LinkedIn, TikTok, YouTube and Email.

When given a business brief, you produce a detailed, structured content calendar in valid JSON format only - no prose, no markdown, just a raw JSON array. Each item in the array is a single content post or piece of content.

Rules:
- ORIGINALITY IS NON-NEGOTIABLE. Never produce generic, templated content that every business posts. Banned: empty filler like "Did you know?", "Happy Monday", "Tag a friend", vague motivational quotes, obvious clichés and lazy stock ideas. Every single post must be specific to THIS business, using the actual services, brands, locations, project details, customer types and real scenarios from the brief. Favour concrete specifics, real numbers, strong scroll-stopping hooks, myth-busting and contrarian angles, genuine behind-the-scenes detail, and current native social formats. If you reference a trend, it must be current and truly relevant to this brand. A reader should think "only this company could have posted that".
- Only use the platforms the user has selected. Never schedule a post for a platform they did not pick.
- Match posting days to optimal days for the platform and niche (e.g. B2B LinkedIn = Tue/Wed/Thu; Instagram for consumer services = Mon/Wed/Fri/Sat).
- Respect any posting frequency the user states per platform.
- Write every caption in the requested tone of voice, and orient topics toward the stated business goals.
- Include relevant UK seasonal hooks and niche-specific awareness days where they fall in the date range.
- Vary post types: mix Reels, Carousels, Static Images, Polls, Behind-the-Scenes, Testimonials, Educational, Offers and CTAs. Use Shorts for YouTube. Do NOT use Stories as a post type under any circumstances.
- CROSSPOSTING: where the SAME content naturally suits other selected platforms, list them in "crosspost_to". Instagram and Facebook content can almost always be crossposted to each other. Short vertical video (Reels) usually works across Instagram, Facebook, TikTok and YouTube Shorts. BUT be careful: if a piece of content would NOT land well on one of the user's other selected platforms (e.g. a casual meme or trend on LinkedIn, or a long B2B explainer on TikTok), do NOT add that platform to crosspost_to, and instead briefly explain the mismatch in "crosspost_warning". Keep crosspost_to to genuinely suitable platforms only.
- Provide framing advice that helps a non-expert creator know HOW to shoot or write the post.
- Captions should sound natural, human and on-brand, not corporate or stiff.
- Never use em dashes in any caption, topic, tip or warning. Use commas, full stops or hyphens instead.
- Always output ONLY valid JSON, starting with [ and ending with ].`;
}

export function buildUserPrompt(b) {
  const platforms = Array.isArray(b.platforms) && b.platforms.length ? b.platforms : ["Instagram"];
  const goals = Array.isArray(b.goals) ? b.goals : [];
  const tones = Array.isArray(b.tone) ? b.tone : (b.tone ? [b.tone] : []);
  const toneLabel = tones.length ? tones.join(", ") : "Friendly";
  const awareList = b.awareList || "none in range";
  const refinement = b.refinement || "";
  return `Business brief: ${b.brief}

Start date: ${b.startISO}
Duration: ${b.durationLabel}
Platforms to use (ONLY these): ${platforms.join(", ")}
Tone of voice (blend these together): ${toneLabel}
Business goals: ${goals.length ? goals.join(", ") : "general growth"}
${refinement ? `\nExtra instructions from the user (apply these, they override defaults): ${refinement}\n` : ""}
Relevant UK awareness/seasonal days within this range (use as hooks where they fit the niche): ${awareList}

Please generate a content calendar for this business. Return a JSON array where each object has these exact keys:
- "date": "YYYY-MM-DD"
- "day": "Monday" (etc.)
- "platform": one of the selected platforms (${platforms.join(" | ")})
- "post_type": e.g. "Reel" | "Carousel" | "Static Image" | "YouTube Short" | "Email Newsletter" | "Poll" (never "Story")
- "topic": Short headline or topic (max 10 words)
- "caption": Suggested caption (2-4 sentences, in the requested tone)
- "hashtags": Array of 5-10 relevant hashtags (empty array for LinkedIn/Email)
- "framing_tip": One sentence of practical advice on how to create or frame this content
- "crosspost_to": Array of OTHER selected platforms this exact content also suits (empty array if none). Never include its own platform.
- "crosspost_warning": Short note if this content should NOT be crossposted to a particular selected platform and why, otherwise null
- "awareness_day": Name of relevant UK/niche awareness day if applicable, otherwise null
- "is_awareness_day": true | false

All dates must fall on or after ${b.startISO} and within the ${b.durationLabel} window. Return ONLY the JSON array. No other text.`;
}

// Calls Anthropic with the server-held key. The system prompt forces JSON-only
// output; the client parser tolerates any stray prose/fences/truncation.
export async function callAnthropic({ apiKey, model, system, user, maxTokens }) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system,
      messages: [
        { role: "user", content: user }
      ]
    })
  });
  let data;
  try { data = await res.json(); } catch (e) { data = {}; }
  if (!res.ok) {
    const err = new Error((data && data.error && data.error.message) || ("Anthropic error " + res.status));
    err.status = res.status;
    throw err;
  }
  const raw = (data.content || []).map(x => x.text || "").join("");
  return { text: raw, stop_reason: data.stop_reason || null };
}
