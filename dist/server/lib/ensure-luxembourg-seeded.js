"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureLuxembourgSeeded = ensureLuxembourgSeeded;
/**
 * Idempotent Luxembourg country seeding.
 *
 * 2026-06 (Tony's request): "ship it" — adds Luxembourg as a real country
 * on the WorkAbroad Hub dashboard with four genuine, verified job portals
 * and an honest eligibility banner.
 *
 * Why this is a separate bootstrap (not part of seed.ts):
 *   seed.ts only runs on an empty database. Production has been running for
 *   months and the seed.ts row inserts would never re-fire. This file is
 *   imported at server boot (next to ensurePlansSeeded) and inserts the
 *   country + portals + guides ONLY if they're missing. Safe to run on
 *   every boot — re-runs are no-ops.
 *
 * Sources backing the four portals + the eligibility numbers:
 *   • ADEM (gov)          https://adem.public.lu/en/mobilite-internationale/wil.html
 *   • Work in Luxembourg  https://workinluxembourg.com/
 *   • Moovijob (English)  https://en.moovijob.com/job-offers/jobs-luxembourg/language-en
 *   • Jobs in Luxembourg  https://jobsinluxembourg.eu/
 *   • EU Blue Card threshold raised to €65,652 from 3 March 2026 — see
 *     Vialto Partners / Arendt / Guichet.lu official advisory.
 *
 * The eligibility banner intentionally tells Kenyans the truth: hospitality
 * / driving / cleaning roles do NOT get work permits here. Telling the
 * truth upfront protects refunds, reputation, and reviews.
 */
const db_1 = require("../db");
const LUX_CODE = "luxembourg";
const LUX_NAME = "Luxembourg";
const LUX_FLAG = "🇱🇺";
// Four real portals, ordered by official-ness. ADEM is the government
// agency every legal hire must touch; Work in Luxembourg is the official
// expat-facing portal; Moovijob is the largest private listings site
// (5,000+ live jobs); Jobs in Luxembourg is the English-speakers-only board.
const LUX_PORTALS = [
    {
        name: "ADEM (Government Portal Portal)",
        url: "https://adem.public.lu/en/mobilite-internationale/wil.html",
        description: "Luxembourg's government employment agency. Every legal hire goes through ADEM's labour market test.",
        order: 1,
    },
    {
        name: "Work in Luxembourg (Official)",
        url: "https://workinluxembourg.com/",
        description: "Government-backed portal focused on shortage-occupation roles open to international talent.",
        order: 2,
    },
    {
        name: "Moovijob",
        url: "https://en.moovijob.com/job-offers/jobs-luxembourg/language-en",
        description: "Largest private listings site in Luxembourg. 5,000+ live jobs. English-only filter shown.",
        order: 3,
    },
    {
        name: "Jobs in Luxembourg",
        url: "https://jobsinluxembourg.eu/",
        description: "English-speaking professionals only. Mostly finance, IT, and EU-institution roles.",
        order: 4,
    },
];
// Three country-guide sections. The country page reads exactly these three
// keys (`before_apply` / `cv_tips` / `visa_warning`) — see
// client/src/pages/country.tsx ~line 557, 572, 591.
const LUX_GUIDES = [
    {
        section: "before_apply",
        content: "Be honest with yourself first — Luxembourg is real but narrow. " +
            "It hires Kenyans into IT (software engineering, dev ops, data engineering, cybersecurity), " +
            "finance (fund administration, fund accounting, AML/compliance, actuarial), and senior tech " +
            "roles at the large asset managers (Amundi, BlackRock, Pictet, Allfunds, RBC IS) and " +
            "international firms (Amazon EU, ArcelorMittal, Talkwalker). " +
            "Most multinationals operate in English so French/German is a plus, not a blocker. " +
            "If you don't have a degree + skilled work experience in one of these fields, this country " +
            "is not realistic for you — please apply where your skills fit (UAE, Saudi, UK).",
    },
    {
        section: "cv_tips",
        content: "European CV format (Europass is widely accepted). 2 pages maximum. " +
            "Include nationality and a photo (standard in Luxembourg, France, Germany). " +
            "Highlight language skills at the top — English (required), French/German (huge plus). " +
            "List degree + recognised professional qualifications prominently. " +
            "Quantify finance/IT achievements (KES handled, systems built, team size, certifications). " +
            "Mention any EU experience or remote work for EU companies.",
    },
    {
        section: "visa_warning",
        content: "⚠️ READ THIS BEFORE PAYING. Luxembourg's work-permit rules are some of " +
            "the strictest in Europe.\n\n" +
            "From 3 March 2026, the EU Blue Card minimum salary is €65,652/year " +
            "(≈ KES 9.7M/year, ≈ KES 808,000/month). This is the realistic path: degree + skilled job + " +
            "that salary floor. Standard salaried work permits require ~€55,000/year and the employer " +
            "must prove no EU citizen could fill the role.\n\n" +
            "Hospitality, driving, cleaning, and general unskilled work DO NOT get permits for Kenyans here — " +
            "those roles are filled by cross-border French/Belgian/German workers. Please do not pay our KES 99 " +
            "or KES 4,500 fee expecting access to those jobs in Luxembourg — they don't exist for you here.\n\n" +
            "Use ONLY the four portals listed above. Apply directly. Never pay an agency for a guaranteed " +
            "Luxembourg job — every legitimate Luxembourg employer hires through ADEM at no cost to you.",
    },
];
async function ensureLuxembourgSeeded() {
    const client = await db_1.pool.connect();
    try {
        // ── 1. Country row ─────────────────────────────────────────────────────
        // ON CONFLICT on the `code` UNIQUE constraint — re-run safe.
        const countryRes = await client.query(`INSERT INTO countries (name, code, flag_emoji, is_active)
       VALUES ($1, $2, $3, true)
       ON CONFLICT (code) DO UPDATE
         SET name = EXCLUDED.name,
             flag_emoji = EXCLUDED.flag_emoji,
             is_active = true
       RETURNING id`, [LUX_NAME, LUX_CODE, LUX_FLAG]);
        const countryId = countryRes.rows[0]?.id;
        if (!countryId) {
            console.warn("[ensureLuxembourg] No country id returned — skipping portals + guides");
            return;
        }
        // ── 2. Portals ─────────────────────────────────────────────────────────
        // No unique constraint on (country_id, name) in jobLinks, so we DELETE
        // any prior Luxembourg-tagged rows and re-insert the canonical four.
        // This makes re-runs idempotent AND lets us update URLs/descriptions
        // in this file without orphaning old rows.
        await client.query(`DELETE FROM job_links WHERE country_id = $1`, [countryId]);
        for (const p of LUX_PORTALS) {
            await client.query(`INSERT INTO job_links (country_id, name, url, description, is_active, "order", click_count, last_verified)
         VALUES ($1, $2, $3, $4, true, $5, 0, NOW())`, [countryId, p.name, p.url, p.description, p.order]);
        }
        // ── 3. Guides ──────────────────────────────────────────────────────────
        // Same DELETE-then-INSERT pattern for the three guide sections.
        await client.query(`DELETE FROM country_guides WHERE country_id = $1`, [countryId]);
        for (const g of LUX_GUIDES) {
            await client.query(`INSERT INTO country_guides (country_id, section, content) VALUES ($1, $2, $3)`, [countryId, g.section, g.content]);
        }
        console.log(`[ensureLuxembourg] ✓ Luxembourg seeded: countryId=${countryId} ` +
            `portals=${LUX_PORTALS.length} guides=${LUX_GUIDES.length}`);
    }
    catch (err) {
        // Non-fatal — boot must continue even if this fails. Log so it's loud
        // in Render logs.
        console.error("[ensureLuxembourg] FAILED:", err?.message);
    }
    finally {
        client.release();
    }
}
