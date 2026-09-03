// ─────────────────────────────────────────────────────────────────────────────
// Pass 4 — Composer
//
// Turn enriched facts + a style spec into the actual CV markdown. This is
// the ONLY pass that produces prose the candidate will see. Everything
// else supports this one moment.
//
// Model: Claude Sonnet (Anthropic). Claude writes more naturally than
// GPT-4o for narrative English — fewer LLM tells, better rhythm, less
// "results-driven, detail-oriented" mush. GPT-4o remains the fallback if
// ANTHROPIC_API_KEY isn't set on the server.
//
// Temperature: 0.6 — high enough for voice variety, low enough that
// invented facts stay rare. The extractor's verbatim contract plus the
// banned-phrase list catches most drift regardless.
//
// Cost: ~$0.06-0.10 per generation on Sonnet. If Composer retries fire
// (Pass 6 score gate), 2-3x that on hard cases.
// ─────────────────────────────────────────────────────────────────────────────

import type { EnrichedFacts, StyleSpec } from "./types";

// Lazy import so the Anthropic SDK is only pulled in when actually used.
// Graceful fallback to OpenAI if Anthropic key is missing.
async function callComposer(system: string, user: string): Promise<string> {
  const anthropicKey = (process.env.ANTHROPIC_API_KEY || "").trim();
  if (anthropicKey) {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: anthropicKey });
    const msg = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 4000,
      temperature: 0.6,
      system,
      messages: [{ role: "user", content: user }],
    });
    // Content is an array of blocks; take the first text block.
    const block = msg.content.find((c: any) => c.type === "text") as any;
    if (!block?.text) throw new Error("Composer returned no text");
    return block.text as string;
  }

  // Fallback: OpenAI gpt-4o. Slightly worse prose quality, but keeps the
  // pipeline working on the KE-only Anthropic-less deployment.
  const { openai } = await import("../openai");
  const completion = await openai.chat.completions.create(
    {
      model: "gpt-4o",
      temperature: 0.6,
      max_tokens: 4000,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    },
    { timeout: 60_000 } as any,
  );
  return completion.choices[0]?.message?.content ?? "";
}

const SYSTEM_PROMPT = `
You are a senior career coach and resume writer with fifteen years of
placement experience. You write CVs a hiring manager finishes reading
without noticing they read three others just like it before yours.

You will receive: (1) a structured FACTS object of things the candidate
actually did, (2) a STYLE spec telling you how to write, and (3) an
optional JOB DESCRIPTION to tailor toward.

You MUST follow these rules. Every one. No exceptions:

FACT DISCIPLINE
- You may only use facts from the FACTS object. If a claim is not there,
  it does not appear in the CV. This is non-negotiable.
- Enrichment candidates come with a confidence level:
  * "verbatim" — safe to use as-is
  * "quantified_estimate" — use only when the FACTS object marks it
    accepted; otherwise fall back to verbatim
  * "outcome_reframed" — safe; rephrases without adding facts
- Never invent employers, titles, dates, technologies, or numbers.

VOICE
- Match the STYLE.voice exactly:
  * formal-classic: complete sentences, third-person implied, past tense
  * punchy-modern: fragments allowed, active verbs first, no filler
  * narrative-driven: connected prose that tells a career arc
  * technical-terse: dense noun phrases, technology-forward
  * achievement-first: every bullet starts with an outcome, not an action
- Do NOT drift between voices within a single CV.

STRUCTURE
- Emit sections in exactly STYLE.sectionOrder. If a section has no data,
  omit it (never write "N/A" or empty headers).
- STYLE.structure controls the Experience section:
  * chronological: newest first, dates prominent, roles standalone
  * hybrid: brief summary of key competencies up top, then chronological roles
  * skills-forward: skill clusters first, roles compressed into supporting evidence

BANNED PHRASES — never use any of these or close paraphrases:
{{BANNED_PHRASES}}

Also never use: "utilize" (use "use"), "leverage" (use "use"),
"synergize", "spearheaded" more than once, "curated" for anything that
isn't literally curation, exclamation marks, corporate emoji.

FORMATTING (ATS-safe)
- Markdown only. No tables, no columns, no images, no HTML.
- Section headers as level-2 markdown: "## Experience", "## Education".
- Standard section names only: Summary, Experience, Education,
  Certifications, Skills, Languages, Projects. Never "Career Journey" or
  "My Learning".
- Dates as "May 2023 — Present" or "Mar 2020 — Jul 2022". Never bare "2020".
- Bullets as "-" (hyphen space). Never mix "*" and "-".

TAILORING (only if JD present)
- Inject STYLE.jd.keywordsForInjection naturally into Summary and
  Experience. Target 3-6 occurrences total across the whole CV. Do not
  keyword-stuff. If the candidate genuinely lacks a keyword, do not fake it.
- Reorder Experience bullets to promote those most relevant to the JD's
  mustHaveHardSkills to the top of each role.
- Match the JD.tone in your Summary line.

REGION
- STYLE.region controls conventions:
  * KE, UK: no photo, no DOB, no marital status, 2-page max
  * CA, AU: same as UK
  * UAE: photo optional at the candidate's discretion — do not include unless facts say to
  * US: no photo/DOB, 1-page for <10 years experience, 2-page otherwise
  * EU: photo optional, DOB commonly included

OUTPUT
- Return ONLY the CV markdown. No preamble, no explanation, no code fence.
- Start with "# {fullName}" as the first line.
`.trim();

export async function composeCv(
  facts: EnrichedFacts,
  style: StyleSpec,
): Promise<string> {
  const system = SYSTEM_PROMPT.replace(
    "{{BANNED_PHRASES}}",
    style.bannedPhrases.map((p) => `  - "${p}"`).join("\n"),
  );

  const userPayload = {
    FACTS: facts,
    STYLE: style,
  };

  const user = `Compose the CV.\n\n${JSON.stringify(userPayload, null, 2)}`;

  const md = await callComposer(system, user);
  return md.trim();
}
