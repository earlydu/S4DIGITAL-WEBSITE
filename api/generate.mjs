// Vercel serverless function: POST /api/generate
// Holds the Anthropic API key server-side (env var) so visitors never see or need one.
import { buildSystemPrompt, buildUserPrompt, callAnthropic, pickMaxTokens, VALID_MODELS, DEFAULT_MODEL } from "../lib/planpulse.mjs";

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }

  // Soft origin guard: only block calls that arrive with a foreign origin/referer.
  const ref = req.headers.origin || req.headers.referer || "";
  let host = "";
  try { host = ref ? new URL(ref).hostname : ""; } catch (e) { host = ""; }
  const allowed = !host || host === "s4digi.com" || host.endsWith(".s4digi.com") || host === "localhost" || host === "127.0.0.1";
  if (!allowed) { res.status(403).json({ error: "Forbidden" }); return; }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) { res.status(503).json({ error: "PlanPulse is not fully set up yet (missing API key). Please check back soon." }); return; }

  try {
    const b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    if (!b.brief || typeof b.brief !== "string" || !b.brief.trim()) {
      res.status(400).json({ error: "Please describe your business first." }); return;
    }
    if (b.brief.length > 6000) { res.status(400).json({ error: "That brief is a bit long, please trim it down." }); return; }

    // Model is server-controlled (cost), via env override or default. Client cannot force it.
    const model = VALID_MODELS.includes(process.env.ANTHROPIC_MODEL) ? process.env.ANTHROPIC_MODEL : DEFAULT_MODEL;

    const out = await callAnthropic({
      apiKey: key,
      model,
      system: buildSystemPrompt(),
      user: buildUserPrompt(b),
      maxTokens: pickMaxTokens(b.durationLabel)
    });
    res.status(200).json(out);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || "Generation failed" });
  }
}
