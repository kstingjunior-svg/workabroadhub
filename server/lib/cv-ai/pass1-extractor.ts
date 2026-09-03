// ─────────────────────────────────────────────────────────────────────────────
// Pass 1 — Extractor
//
// Turn a raw CV (uploaded PDF/DOCX text OR pasted text) into a strictly-typed
// CvFacts object. This is the ground-truth fact base — every later pass
// composes only from what appears here. If a fact isn't here, it can't
// appear in the final CV. That's the anti-hallucination guarantee.
//
// Model: gpt-4o-mini. Cheap, ~1-2s latency, structured output enforced via
// JSON schema. Extraction is a "no creativity" job — we spend the money on
// the Composer pass instead.
//
// Cost: ~$0.001 per CV. Trivial.
// ─────────────────────────────────────────────────────────────────────────────

import { openai } from "../openai";
import type { CvFacts } from "./types";

const SYSTEM_PROMPT = `
You are a CV parser. You extract structured facts from a CV. You NEVER invent
data. You NEVER paraphrase. If a fact is not clearly stated in the source,
either omit it or add it to gapsDetected.

Return a single JSON object matching this schema:

{
  "contact": {
    "fullName": string,
    "email"?: string,
    "phone"?: string,
    "location"?: string,
    "linkedin"?: string
  },
  "summarySourceText"?: string,   // if the CV has a summary/objective, include it verbatim
  "roles": [
    {
      "title": string,
      "employer": string,
      "location"?: string,
      "start": string,           // ISO month "YYYY-MM"; use "YYYY-01" if only year given
      "end": string | "present",
      "achievements": [string, ...],   // VERBATIM bullet points from the source
      "tools": [string, ...]     // technologies/tools mentioned in the role
    }
  ],
  "education": [{"qualification": string, "institution": string, "start"?: string, "end"?: string, "gradeOrNotes"?: string}],
  "certs": [{"name": string, "issuer"?: string, "year"?: string}],
  "skillsMentioned": [string, ...],
  "languages"?: [{"name": string, "level"?: string}],
  "gapsDetected": [string, ...]   // e.g. "no dates on the 2019-2021 role", "3 achievements have no quantified outcomes", "email address missing"
}

RULES:
1. Verbatim achievements only. If the source says "managed the team", you
   write exactly "managed the team". You do NOT expand it to "led a
   cross-functional team". That's the Enricher's job in Pass 2.
2. If a date is ambiguous ("2020" instead of "March 2020"), coerce to
   YYYY-01 and add a note in gapsDetected.
3. Never invent quantities. If the source doesn't say a number, don't
   supply one.
4. Skills mentioned means skills EXPLICITLY listed by the candidate,
   from a skills section or clearly named in achievement text. Do not
   infer skills from role titles.
5. gapsDetected is the single most important field for the pipeline
   downstream. Be honest and specific: "no phone number", "3 of 4 roles
   lack quantified achievements", "gap of 14 months between roles X and Y
   with no explanation".
6. If a resume clearly IS NOT a CV/resume (visa doc, cover letter alone,
   job ad, offer letter), return {"error": "NOT_A_CV", "detected": "..."}.
`.trim();

export async function extractFacts(rawCvText: string): Promise<CvFacts> {
  const clipped = rawCvText.slice(0, 20_000);   // guardrail for absurdly long inputs

  const completion = await openai.chat.completions.create(
    {
      model: "gpt-4o-mini",
      temperature: 0,                    // deterministic — this is parsing, not writing
      max_tokens: 4000,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Extract facts from this CV. Return JSON only.\n\n---\n\n${clipped}` },
      ],
    },
    { timeout: 30_000 } as any,
  );

  const raw = completion.choices[0]?.message?.content ?? "{}";
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    // GPT-4o-mini with response_format:json_object never returns non-JSON,
    // but be defensive — a single stray comma has cost us user trust before.
    throw new Error(`Extractor returned invalid JSON: ${(err as Error).message}`);
  }

  if (parsed.error === "NOT_A_CV") {
    const wrongDoc: any = new Error("The document you uploaded does not look like a CV.");
    wrongDoc.wrongDocument = true;
    wrongDoc.detected = parsed.detected;
    throw wrongDoc;
  }

  // Minimum viability check — no name, no CV.
  if (!parsed.contact?.fullName?.trim()) {
    throw new Error("Could not identify a candidate name in the source. Is this a real CV?");
  }

  return parsed as CvFacts;
}
