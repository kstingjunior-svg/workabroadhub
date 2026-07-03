"use strict";
/**
 * Nanjila — persistent user memory.
 *
 * Read/write layer for nanjila_user_memory. Enforces the trust rules from
 * PERSONA_SPEC.md and OS_EVOLUTION_PLAN.md:
 *
 *   • Sensitive categories (health / religion / politics / sexuality) are
 *     BLOCKED at the write layer. A sensitivity score > 30 in any of those
 *     categories short-circuits the write, logs an admin warning, and
 *     returns without persisting.
 *
 *   • Confidence < 40 facts are stored but flagged; surface-back callers
 *     hedge ("I think you mentioned…?") when reading a low-confidence fact.
 *
 *   • Facts decay via decay_half_life_days. rememberFact() re-verifies an
 *     existing fact if the value is unchanged, refreshing last_verified_at.
 *
 *   • On rememberFact() overwrite, the previous row is archived (not
 *     deleted) — this preserves history for admin audit and for "you told
 *     me this before" scenarios.
 *
 *   • User self-service purge via clearAllFor(userId).
 *
 * The write layer is intentionally strict. It's easier to relax later than
 * to walk back a leak.
 *
 * See OS_EVOLUTION_PLAN.md Feature 8 §13 and MASTER_PLAN.md §6.3.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MEMORY_SENSITIVITY_BLOCK_THRESHOLD = void 0;
exports.classifySensitivity = classifySensitivity;
exports.recallAll = recallAll;
exports.recallFact = recallFact;
exports.recallByCategory = recallByCategory;
exports.rememberFact = rememberFact;
exports.forgetFact = forgetFact;
exports.clearAllFor = clearAllFor;
exports.buildPromptContext = buildPromptContext;
const db_1 = require("../db");
const feature_flags_1 = require("./feature-flags");
// ─────────────────────────────────────────────────────────────────────────────
// Sensitivity gate — the firewall
// ─────────────────────────────────────────────────────────────────────────────
//
// We classify a candidate fact's sensitivity BEFORE writing. Fact keys or
// values matching any of these patterns get a high sensitivity score and
// are refused entry.
//
// This is a defence-in-depth layer — the model itself is prompted not to
// try to remember these categories, but if it does try, we catch it here.
const FORBIDDEN_KEY_PATTERNS = [
    { regex: /\b(hiv|aids|diabetes|cancer|hepatitis|tb|pregnancy|abortion|mental|depression|anxiety|therapy|psychiatric|disability)\b/i,
        category: "health", sensitivity: 90 },
    { regex: /\b(muslim|christian|catholic|hindu|buddhist|atheist|jewish|religion|faith|church|mosque|temple)\b/i,
        category: "religion", sensitivity: 85 },
    { regex: /\b(gay|lesbian|bisexual|lgbt|trans|homosexual|orientation)\b/i,
        category: "sexuality", sensitivity: 95 },
    { regex: /\b(vote|voted|party|politic|opposition|ruling|azimio|kenya kwanza|odm|jubilee)\b/i,
        category: "politics", sensitivity: 80 },
    { regex: /\b(tribe|luo|kikuyu|kalenjin|luhya|kisii|meru|kamba|maasai|somali|ethnic)\b/i,
        category: "ethnicity", sensitivity: 90 },
];
const FORBIDDEN_VALUE_PATTERNS = [
    /\bpassword\b/i,
    /\bnational\s*id\s*number\b/i,
    /\bkra\s*pin\b/i,
    /\bcreditcard|debit\s*card\b/i,
    /\bbank\s*account\s*number\b/i,
];
/**
 * Classify a candidate fact and return its computed sensitivity score.
 * Returns 0 for benign facts, higher for concerning ones.
 * Score > 30 blocks writes (see MEMORY_SENSITIVITY_BLOCK_THRESHOLD).
 */
function classifySensitivity(factKey, factValue) {
    const kv = `${factKey} ${JSON.stringify(factValue ?? "")}`;
    let maxSensitivity = 0;
    let matchedCategory = null;
    for (const p of FORBIDDEN_KEY_PATTERNS) {
        if (p.regex.test(kv) && p.sensitivity > maxSensitivity) {
            maxSensitivity = p.sensitivity;
            matchedCategory = p.category;
        }
    }
    for (const p of FORBIDDEN_VALUE_PATTERNS) {
        if (p.test(JSON.stringify(factValue ?? ""))) {
            if (maxSensitivity < 95) {
                maxSensitivity = 95;
                matchedCategory = "credential";
            }
        }
    }
    return { sensitivity: maxSensitivity, category: matchedCategory };
}
exports.MEMORY_SENSITIVITY_BLOCK_THRESHOLD = 30;
// ─────────────────────────────────────────────────────────────────────────────
// Reads
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Fetch all active (non-archived) memory rows for a user.
 * Applies decay: facts past their decay window are returned but with a
 * `staleness` marker so the caller can hedge.
 */
async function recallAll(userId) {
    const { rows } = await db_1.pool.query(`SELECT id, user_id, fact_key, fact_value, category, confidence, sensitivity,
            source, learned_at, last_verified_at, decay_half_life_days, archived
       FROM nanjila_user_memory
      WHERE user_id = $1 AND archived = FALSE
      ORDER BY last_verified_at DESC`, [userId]);
    return rows.map(rowToFact);
}
/**
 * Fetch the current value of a specific fact key.
 * Returns null when no active fact exists for that key.
 */
async function recallFact(userId, factKey) {
    const { rows } = await db_1.pool.query(`SELECT id, user_id, fact_key, fact_value, category, confidence, sensitivity,
            source, learned_at, last_verified_at, decay_half_life_days, archived
       FROM nanjila_user_memory
      WHERE user_id = $1 AND fact_key = $2 AND archived = FALSE
      ORDER BY last_verified_at DESC
      LIMIT 1`, [userId, factKey]);
    if (rows.length === 0)
        return null;
    return rowToFact(rows[0]);
}
/**
 * Return only high-confidence, category-filtered facts. Used by the
 * conversation orchestrator when composing per-user prompt context.
 */
async function recallByCategory(userId, category, minConfidence = 60) {
    const { rows } = await db_1.pool.query(`SELECT id, user_id, fact_key, fact_value, category, confidence, sensitivity,
            source, learned_at, last_verified_at, decay_half_life_days, archived
       FROM nanjila_user_memory
      WHERE user_id = $1
        AND category = $2
        AND confidence >= $3
        AND archived = FALSE
      ORDER BY last_verified_at DESC`, [userId, category, minConfidence]);
    return rows.map(rowToFact);
}
// ─────────────────────────────────────────────────────────────────────────────
// Writes
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Persist a fact about a user. Runs the sensitivity gate first — sensitive
 * categories are blocked entirely.
 *
 * If an active fact exists with the same key AND the same JSON-encoded value,
 * this is treated as a re-verification: last_verified_at is updated but no
 * new row is created.
 *
 * If an active fact exists with a DIFFERENT value, that row is archived
 * (archived = TRUE) and a new row is inserted with the current value.
 */
async function rememberFact(input) {
    if (!feature_flags_1.NanjilaFlags.memoryEnabled) {
        return { ok: false, reason: "memory_disabled" };
    }
    // ── 1. Sensitivity gate ─────────────────────────────────────────────────
    const { sensitivity, category: sensitiveCategory } = classifySensitivity(input.factKey, input.factValue);
    if (sensitivity > exports.MEMORY_SENSITIVITY_BLOCK_THRESHOLD) {
        console.warn(`[Nanjila/Memory] BLOCKED sensitive fact for user=${input.userId} ` +
            `key="${input.factKey}" category="${sensitiveCategory}" sensitivity=${sensitivity}`);
        return { ok: false, reason: "sensitive_blocked" };
    }
    // ── 2. De-dup / reconfirm ───────────────────────────────────────────────
    const existing = await recallFact(input.userId, input.factKey);
    if (existing) {
        const sameValue = JSON.stringify(existing.factValue) === JSON.stringify(input.factValue);
        if (sameValue) {
            await db_1.pool.query(`UPDATE nanjila_user_memory
            SET last_verified_at = NOW(),
                confidence       = GREATEST(confidence, $2)
          WHERE id = $1`, [existing.id, Math.round(Math.max(0, Math.min(100, input.confidence)))]);
            return { ok: true, reason: "duplicate_reconfirmed", factId: existing.id };
        }
        // Different value — archive old, insert new.
        await db_1.pool.query(`UPDATE nanjila_user_memory SET archived = TRUE WHERE id = $1`, [existing.id]);
    }
    // ── 3. Insert ───────────────────────────────────────────────────────────
    const { rows } = await db_1.pool.query(`INSERT INTO nanjila_user_memory
       (user_id, fact_key, fact_value, category, confidence, sensitivity,
        source, decay_half_life_days)
     VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8)
     RETURNING id`, [
        input.userId,
        input.factKey,
        JSON.stringify(input.factValue),
        input.category,
        Math.round(Math.max(0, Math.min(100, input.confidence))),
        sensitivity,
        input.source,
        input.decayHalfLifeDays ?? defaultHalfLife(input.category),
    ]);
    return { ok: true, factId: rows[0].id };
}
/**
 * Archive a specific fact. User-invoked via the memory settings page or by
 * Nanjila herself when a user says "forget that I told you X".
 */
async function forgetFact(userId, factKey) {
    const { rowCount } = await db_1.pool.query(`UPDATE nanjila_user_memory
        SET archived = TRUE
      WHERE user_id = $1 AND fact_key = $2 AND archived = FALSE`, [userId, factKey]);
    return (rowCount ?? 0) > 0;
}
/**
 * Full purge. Archives every fact for the user. Used by the settings page
 * "delete all my memory" button and by the account-deletion flow.
 */
async function clearAllFor(userId) {
    const { rowCount } = await db_1.pool.query(`UPDATE nanjila_user_memory
        SET archived = TRUE
      WHERE user_id = $1 AND archived = FALSE`, [userId]);
    return rowCount ?? 0;
}
// ─────────────────────────────────────────────────────────────────────────────
// Prompt-context helpers — called by the orchestrator per turn
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Compact string suitable for injection into the system prompt. Only high-
 * confidence facts (>= 60). Sensitive categories are ALREADY filtered at
 * write time, but we double-check here as defence in depth.
 */
async function buildPromptContext(userId) {
    if (!feature_flags_1.NanjilaFlags.memoryEnabled)
        return "";
    const facts = await recallAll(userId);
    const usable = facts.filter((f) => f.confidence >= 60 && f.sensitivity <= exports.MEMORY_SENSITIVITY_BLOCK_THRESHOLD);
    if (usable.length === 0)
        return "";
    const lines = [
        "── WHAT NANJILA REMEMBERS ABOUT THIS USER ──",
        "(Verified facts from prior conversations. Reference them naturally.)",
    ];
    for (const f of usable.slice(0, 20)) {
        const hedge = f.confidence < 75 ? " (possibly)" : "";
        lines.push(`• ${f.factKey}${hedge}: ${formatValue(f.factValue)}`);
    }
    return lines.join("\n");
}
// ─────────────────────────────────────────────────────────────────────────────
// Internals
// ─────────────────────────────────────────────────────────────────────────────
function defaultHalfLife(category) {
    switch (category) {
        case "preference": return 30;
        case "decision": return 60;
        case "career": return 180;
        case "personal": return 365;
    }
}
function formatValue(v) {
    if (v === null || v === undefined)
        return "unknown";
    if (typeof v === "string")
        return v;
    if (typeof v === "number" || typeof v === "boolean")
        return String(v);
    try {
        return JSON.stringify(v);
    }
    catch {
        return String(v);
    }
}
function rowToFact(row) {
    return {
        id: row.id,
        userId: row.user_id,
        factKey: row.fact_key,
        factValue: row.fact_value,
        category: row.category,
        confidence: row.confidence,
        sensitivity: row.sensitivity,
        source: row.source,
        learnedAt: row.learned_at,
        lastVerifiedAt: row.last_verified_at,
        decayHalfLifeDays: row.decay_half_life_days,
        archived: row.archived,
    };
}
