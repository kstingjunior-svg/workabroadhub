"use strict";
// ─────────────────────────────────────────────────────────────────────────────
// Voice Mock Interview — adaptive, AI-driven interview simulator.
//
// FLOW:
//   1. User picks target country + role -> startSession()
//   2. AI generates question #1, ElevenLabs voices it to /audio/<uuid>.mp3
//   3. User records audio response -> client sends to respondToSession()
//   4. Whisper transcribes -> GPT scores the answer + generates question #2
//   5. Repeat until 5 questions answered -> getSummary() returns
//      transcript + 4-dimension scores (relevance, structure, specificity,
//      confidence) plus a one-paragraph coaching recap.
//
// COSTS (per session, gpt-4o-mini + Whisper + ElevenLabs):
//   ~$0.02 in tokens, ~$0.03 in TTS audio, ~$0.005 in transcription
//   = ~$0.06 per full session. Well under the KES 999 we'd charge once
//   this becomes a paid SKU.
//
// PRIVACY:
//   We do NOT store the raw audio after transcription — only the text
//   transcripts. interview_sessions table has a JSONB transcript column
//   shaped as: [{ q, a, scores }] per question.
// ─────────────────────────────────────────────────────────────────────────────
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.transcribeAudio = transcribeAudio;
exports.startSession = startSession;
exports.respondToSession = respondToSession;
exports.getSession = getSession;
const db_1 = require("../db");
const openai_1 = require("../lib/openai");
const elevenlabs_1 = require("../lib/elevenlabs");
const crypto_1 = __importDefault(require("crypto"));
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const TOTAL_QUESTIONS = 5;
const SCHEMA_INIT = { done: false };
async function ensureSchema() {
    if (SCHEMA_INIT.done)
        return;
    try {
        await db_1.pool.query(`
      CREATE TABLE IF NOT EXISTS interview_sessions (
        id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id          VARCHAR      NOT NULL,
        country          VARCHAR(60)  NOT NULL,
        role             VARCHAR(200) NOT NULL,
        status           VARCHAR(20)  NOT NULL DEFAULT 'in_progress',
        question_number  INTEGER      NOT NULL DEFAULT 0,
        transcript       JSONB        NOT NULL DEFAULT '[]'::jsonb,
        final_score      INTEGER      NULL,
        final_summary    TEXT         NULL,
        created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        completed_at     TIMESTAMPTZ  NULL
      );
    `);
        await db_1.pool.query(`CREATE INDEX IF NOT EXISTS idx_interview_sessions_user ON interview_sessions (user_id, created_at DESC);`);
        SCHEMA_INIT.done = true;
    }
    catch (err) {
        console.error("[voiceInterview] ensureSchema failed:", err?.message ?? err);
    }
}
// ─── AI prompts ──────────────────────────────────────────────────────────────
function questionPrompt(country, role, history) {
    const transcript = history.map((t, i) => `Q${i + 1}: ${t.q}\nA${i + 1}: ${t.a}`).join("\n\n");
    const questionNumber = history.length + 1;
    return `You are a seasoned recruiter interviewing a Kenyan candidate for a ${role} role in ${country}.

This is question ${questionNumber} of ${TOTAL_QUESTIONS}. Generate ONE concise interview question (one sentence, max 25 words).

Make the question:
- Realistic for a ${country} hiring panel
- Appropriate difficulty (start gentle, increase by question)
- Specific to ${role} responsibilities
- Adaptive — if the candidate's previous answer was weak, probe deeper; if strong, push harder.

Previous answers in this interview so far:
${transcript || "(none yet — this is question 1)"}

Output ONLY the question text. No numbering, no preamble, no quotation marks.`;
}
function scoringPrompt(country, role, question, answer) {
    return `You are scoring a Kenyan candidate's interview answer for a ${role} role in ${country}.

Question: ${question}
Answer: ${answer}

Score the answer on FOUR dimensions, each 0-10:
  relevance   — does it directly answer the question?
  structure   — is it well-organised (STAR method, clear flow)?
  specificity — concrete examples + numbers vs vague platitudes?
  confidence  — does the tone project capability without overclaiming?

Also write a one-sentence coaching note (max 25 words) explaining the strongest and weakest aspect.

Output STRICT JSON with no commentary:
{"relevance":N,"structure":N,"specificity":N,"confidence":N,"feedback":"..."}`;
}
function finalSummaryPrompt(country, role, transcript) {
    const trail = transcript.map((t, i) => {
        const s = t.scores;
        return `Q${i + 1}: ${t.q}\nA${i + 1}: ${t.a}\nScores: relevance=${s?.relevance ?? "?"}, structure=${s?.structure ?? "?"}, specificity=${s?.specificity ?? "?"}, confidence=${s?.confidence ?? "?"}`;
    }).join("\n\n");
    return `Write a 4-sentence coaching summary for a Kenyan candidate who just completed a mock interview for a ${role} role in ${country}.

Their answers and per-question scores:
${trail}

Cover:
  1. Their single biggest strength across the session
  2. Their single biggest area to improve before the real interview
  3. One concrete tactic they should practice (e.g. "rehearse STAR examples for behavioural questions")
  4. A short encouragement that respects their effort without being saccharine

Output plain prose. No lists, no headers, no markdown.`;
}
// ─── Helpers ─────────────────────────────────────────────────────────────────
async function generateQuestionWithAudio(country, role, history) {
    const completion = await openai_1.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: questionPrompt(country, role, history) }],
        temperature: 0.7,
        max_tokens: 80,
    });
    const text = completion.choices[0]?.message?.content?.trim() || "Tell me about yourself.";
    let audioUrl = null;
    if (process.env.ELEVENLABS_API_KEY) {
        try {
            const filename = await (0, elevenlabs_1.generateVoiceFile)(text);
            if (filename)
                audioUrl = `/audio/${filename}`;
        }
        catch (err) {
            console.warn("[voiceInterview] TTS failed:", err?.message);
        }
    }
    return { text, audioUrl };
}
async function scoreAnswer(country, role, question, answer) {
    const completion = await openai_1.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: scoringPrompt(country, role, question, answer) }],
        temperature: 0.2,
        max_tokens: 200,
        response_format: { type: "json_object" },
    });
    const raw = completion.choices[0]?.message?.content?.trim() || "{}";
    try {
        const parsed = JSON.parse(raw);
        return {
            relevance: Math.max(0, Math.min(10, Number(parsed.relevance ?? 5))),
            structure: Math.max(0, Math.min(10, Number(parsed.structure ?? 5))),
            specificity: Math.max(0, Math.min(10, Number(parsed.specificity ?? 5))),
            confidence: Math.max(0, Math.min(10, Number(parsed.confidence ?? 5))),
            feedback: String(parsed.feedback ?? "Keep practicing — more specific examples help.").slice(0, 200),
        };
    }
    catch {
        return { relevance: 5, structure: 5, specificity: 5, confidence: 5, feedback: "Scoring unavailable — try again." };
    }
}
/**
 * Transcribe an uploaded audio file via Whisper. Returns the text or
 * throws on failure. Caller must clean up the file regardless.
 */
async function transcribeAudio(filePath) {
    const file = await promises_1.default.readFile(filePath);
    const blob = new Blob([file]);
    const formData = new FormData();
    formData.append("file", blob, path_1.default.basename(filePath));
    formData.append("model", "whisper-1");
    formData.append("language", "en");
    const apiKey = (process.env.OPENAI_API_KEY || "").trim();
    if (!apiKey)
        throw new Error("OPENAI_API_KEY not configured");
    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: formData,
    });
    if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`Whisper transcription failed: ${res.status} ${body.slice(0, 200)}`);
    }
    const data = await res.json();
    return (data.text ?? "").trim();
}
// ─── Public API ──────────────────────────────────────────────────────────────
async function startSession(args) {
    await ensureSchema();
    const id = crypto_1.default.randomUUID();
    const first = await generateQuestionWithAudio(args.country, args.role, []);
    await db_1.pool.query(`INSERT INTO interview_sessions (id, user_id, country, role, transcript, question_number)
     VALUES ($1, $2, $3, $4, $5::jsonb, 0)`, [id, args.userId, args.country, args.role, JSON.stringify([{ q: first.text, a: "" }])]);
    return {
        id,
        userId: args.userId,
        country: args.country,
        role: args.role,
        status: "in_progress",
        questionNumber: 1,
        transcript: [{ q: first.text, a: "" }],
        nextQuestion: first.text,
        nextAudioUrl: first.audioUrl ?? undefined,
        createdAt: new Date().toISOString(),
    };
}
async function respondToSession(args) {
    await ensureSchema();
    const { rows } = await db_1.pool.query(`SELECT * FROM interview_sessions WHERE id = $1`, [args.sessionId]);
    const sess = rows[0];
    if (!sess)
        throw new Error("Session not found");
    if (sess.user_id !== args.userId)
        throw new Error("Not your session");
    if (sess.status === "completed")
        throw new Error("Session already completed");
    // Score the current answer (the last entry in transcript whose .a is empty).
    const transcript = Array.isArray(sess.transcript) ? sess.transcript : [];
    const currentIdx = transcript.findIndex((t) => !t.a);
    if (currentIdx < 0)
        throw new Error("No pending question");
    const currentQ = transcript[currentIdx].q;
    const cleanAnswer = (args.answerText ?? "").trim().slice(0, 4000);
    if (!cleanAnswer)
        throw new Error("Answer is empty");
    const scores = await scoreAnswer(sess.country, sess.role, currentQ, cleanAnswer);
    transcript[currentIdx] = { q: currentQ, a: cleanAnswer, scores };
    const answered = transcript.filter((t) => t.a).length;
    let nextQ = null;
    let status = "in_progress";
    let finalScore = null;
    let finalSummary = null;
    if (answered >= TOTAL_QUESTIONS) {
        // Session complete — compute final averaged score and a coaching summary.
        const sum = transcript.reduce((acc, t) => {
            const s = t.scores;
            if (!s)
                return acc;
            return acc + s.relevance + s.structure + s.specificity + s.confidence;
        }, 0);
        finalScore = Math.round(sum / (TOTAL_QUESTIONS * 4) * 10); // 0-100
        status = "completed";
        try {
            const completion = await openai_1.openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [{ role: "user", content: finalSummaryPrompt(sess.country, sess.role, transcript) }],
                temperature: 0.5,
                max_tokens: 220,
            });
            finalSummary = (completion.choices[0]?.message?.content ?? "").trim();
        }
        catch {
            finalSummary = "Strong effort overall. Practice more concrete STAR-style examples before the real interview.";
        }
    }
    else {
        // Generate the next question and append a blank turn for it.
        nextQ = await generateQuestionWithAudio(sess.country, sess.role, transcript);
        transcript.push({ q: nextQ.text, a: "" });
    }
    await db_1.pool.query(`UPDATE interview_sessions
        SET transcript      = $2::jsonb,
            question_number = $3,
            status          = $4,
            final_score     = $5,
            final_summary   = $6,
            completed_at    = CASE WHEN $4 = 'completed' THEN NOW() ELSE completed_at END
      WHERE id = $1`, [args.sessionId, JSON.stringify(transcript), answered, status, finalScore, finalSummary]);
    return {
        id: sess.id,
        userId: sess.user_id,
        country: sess.country,
        role: sess.role,
        status,
        questionNumber: answered + (status === "in_progress" ? 1 : 0),
        transcript,
        nextQuestion: nextQ?.text,
        nextAudioUrl: nextQ?.audioUrl ?? undefined,
        finalScore: finalScore ?? undefined,
        finalSummary: finalSummary ?? undefined,
        createdAt: sess.created_at.toISOString(),
    };
}
async function getSession(sessionId, userId) {
    await ensureSchema();
    const { rows } = await db_1.pool.query(`SELECT * FROM interview_sessions WHERE id = $1`, [sessionId]);
    const sess = rows[0];
    if (!sess || sess.user_id !== userId)
        return null;
    return {
        id: sess.id,
        userId: sess.user_id,
        country: sess.country,
        role: sess.role,
        status: sess.status,
        questionNumber: sess.question_number,
        transcript: sess.transcript ?? [],
        finalScore: sess.final_score ?? undefined,
        finalSummary: sess.final_summary ?? undefined,
        createdAt: new Date(sess.created_at).toISOString(),
        completedAt: sess.completed_at ? new Date(sess.completed_at).toISOString() : null,
    };
}
