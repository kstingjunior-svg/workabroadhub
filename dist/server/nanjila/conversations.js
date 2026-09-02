"use strict";
/**
 * Nanjila — conversation lifecycle.
 *
 * Read/write layer for nanjila_conversations. Records session-level metadata
 * for the admin analytics dashboard AND for Nanjila's own "welcome back"
 * memory.
 *
 * Lifecycle:
 *
 *   1. startConversation() at the first message of a session; returns a
 *      conversation id used as the FK for anything that gets attached to
 *      the session.
 *   2. recordTurn() after each user↔assistant exchange, appending to the
 *      intents/moods/tools arrays.
 *   3. endConversation() at session close with a terminal outcome.
 *   4. recordCsat() when the widget's post-session rating fires.
 *
 * All writes are best-effort — analytics failure never blocks a user reply.
 * See OS_EVOLUTION_PLAN.md §13.2 (Conversations table schema) and §17.3
 * (prompt-hash pinning for incident review).
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startConversation = startConversation;
exports.recordTurn = recordTurn;
exports.endConversation = endConversation;
exports.recordCsat = recordCsat;
exports.recentConversations = recentConversations;
exports.hashPrompt = hashPrompt;
const db_1 = require("../db");
const node_crypto_1 = __importDefault(require("node:crypto"));
// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle helpers
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Insert a new conversations row and return the id.
 * If a row for this session_id already exists (idempotent widget mounts),
 * return the existing id.
 */
async function startConversation(input) {
    try {
        // Idempotency: same session_id within a 30-min window returns the same row.
        const { rows: existing } = await db_1.pool.query(`SELECT id FROM nanjila_conversations
        WHERE session_id = $1
          AND started_at > NOW() - INTERVAL '30 minutes'
        ORDER BY started_at DESC
        LIMIT 1`, [input.sessionId]);
        if (existing.length > 0) {
            return { conversationId: existing[0].id };
        }
        const { rows } = await db_1.pool.query(`INSERT INTO nanjila_conversations
         (user_id, session_id, channel, prompt_hash)
       VALUES ($1, $2, $3, $4)
       RETURNING id`, [input.userId, input.sessionId, input.channel, input.promptHash ?? null]);
        return { conversationId: rows[0].id };
    }
    catch (err) {
        console.warn("[Nanjila/Conversations] startConversation failed:", err?.message);
        // Fallback: synthesize a session id so callers can keep going.
        return { conversationId: `synthetic_${node_crypto_1.default.randomUUID()}` };
    }
}
/**
 * Update a conversation with per-turn observations. Best-effort — never
 * throws. If patch.bumpMessage is true, increments message_count.
 */
async function recordTurn(conversationId, patch) {
    if (!conversationId || conversationId.startsWith("synthetic_"))
        return;
    try {
        const sets = [];
        const params = [conversationId];
        let i = 2;
        if (patch.addIntent) {
            sets.push(`detected_intents = detected_intents || $${i++}::jsonb`);
            params.push(JSON.stringify([patch.addIntent]));
        }
        if (patch.addMood) {
            sets.push(`detected_moods = detected_moods || $${i++}::jsonb`);
            params.push(JSON.stringify([patch.addMood]));
        }
        if (patch.addTool) {
            sets.push(`tools_invoked = tools_invoked || $${i++}::jsonb`);
            params.push(JSON.stringify([patch.addTool]));
        }
        if (patch.bumpMessage) {
            sets.push(`message_count = message_count + 1`);
        }
        if (sets.length === 0)
            return;
        await db_1.pool.query(`UPDATE nanjila_conversations SET ${sets.join(", ")} WHERE id = $1`, params);
    }
    catch (err) {
        console.warn("[Nanjila/Conversations] recordTurn failed:", err?.message);
    }
}
/**
 * Terminal write — sets ended_at + outcome. Idempotent (won't overwrite
 * an existing terminal state).
 */
async function endConversation(conversationId, outcome) {
    if (!conversationId || conversationId.startsWith("synthetic_"))
        return;
    try {
        await db_1.pool.query(`UPDATE nanjila_conversations
          SET ended_at = COALESCE(ended_at, NOW()),
              outcome  = COALESCE(outcome, $2)
        WHERE id = $1`, [conversationId, outcome]);
    }
    catch (err) {
        console.warn("[Nanjila/Conversations] endConversation failed:", err?.message);
    }
}
/**
 * Post-session CSAT rating (1-5). Widget calls this when the user rates.
 */
async function recordCsat(conversationId, score) {
    if (!conversationId || conversationId.startsWith("synthetic_"))
        return;
    if (!Number.isInteger(score) || score < 1 || score > 5)
        return;
    try {
        await db_1.pool.query(`UPDATE nanjila_conversations SET csat_score = $2 WHERE id = $1`, [conversationId, score]);
    }
    catch (err) {
        console.warn("[Nanjila/Conversations] recordCsat failed:", err?.message);
    }
}
/**
 * Return this user's most recent conversation summaries. Used by the
 * orchestrator's welcome-back logic: "Last time you were looking at UAE
 * caregiver roles — want to pick up there?"
 */
async function recentConversations(userId, limit = 5) {
    const capped = Math.max(1, Math.min(20, Math.floor(limit)));
    const { rows } = await db_1.pool.query(`SELECT id, started_at, ended_at, channel, message_count,
            detected_intents, detected_moods, tools_invoked, outcome, csat_score
       FROM nanjila_conversations
      WHERE user_id = $1
      ORDER BY started_at DESC
      LIMIT $2`, [userId, capped]);
    return rows.map((r) => ({
        conversationId: r.id,
        startedAt: r.started_at,
        endedAt: r.ended_at,
        channel: r.channel,
        messageCount: r.message_count,
        detectedIntents: Array.isArray(r.detected_intents) ? r.detected_intents : [],
        detectedMoods: Array.isArray(r.detected_moods) ? r.detected_moods : [],
        toolsInvoked: Array.isArray(r.tools_invoked) ? r.tools_invoked : [],
        outcome: r.outcome,
        csatScore: r.csat_score,
    }));
}
// ─────────────────────────────────────────────────────────────────────────────
// Prompt-hash helpers
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Compute a stable sha-256 hash of the system prompt for §17.3 pinning.
 * Store this on the conversation so incident triage can answer "which
 * prompt version was the user talking to?" without a full log dive.
 */
function hashPrompt(prompt) {
    return node_crypto_1.default.createHash("sha256").update(prompt).digest("hex").slice(0, 16);
}
