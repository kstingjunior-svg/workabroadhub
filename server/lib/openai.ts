import OpenAI from "openai";

// Restored Batch H: routes.ts has ~10 dynamic imports of askGPT that were
// silently failing after the migration.

const _openaiApiKey =
  (process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY || "").trim();

// Coerce empty/whitespace baseURL to undefined so the SDK falls back to its
// default https://api.openai.com/v1. If we pass "", the SDK treats it as a
// literal URL and every request fails with a generic "Connection error".
const _openaiBaseUrl =
  (process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || "").trim() || undefined;

if (!_openaiApiKey) {
  console.warn(
    "[OpenAI] No API key configured (OPENAI_API_KEY / AI_INTEGRATIONS_OPENAI_API_KEY both empty). " +
    "All AI tools will return Connection error until a key is set."
  );
} else {
  console.log(
    `[OpenAI] Client initialised | keyPrefix=${_openaiApiKey.slice(0, 7)}*** baseURL=${_openaiBaseUrl ?? "default(api.openai.com)"}`
  );
}

export const openai = new OpenAI({
  apiKey: _openaiApiKey || "MISSING_KEY_SEE_LOGS",  // SDK throws on empty — provide sentinel so error is descriptive
  baseURL: _openaiBaseUrl,
});

export async function askGPT(prompt: string): Promise<string> {
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "You are a professional career assistant." },
      { role: "user", content: prompt },
    ],
    temperature: 0.4,
  });
  return res.choices[0].message.content ?? "";
}
