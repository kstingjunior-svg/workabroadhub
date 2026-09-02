"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerContinueRoute = registerContinueRoute;
const db_1 = require("../db");
const replitAuth_1 = require("../replit_integrations/auth/replitAuth");
const country_journey_steps_1 = require("@shared/country-journey-steps");
function getUserId(req) {
    return req.user?.claims?.sub ?? req.user?.id ?? req.session?.customUserId;
}
function isMissingTable(err) {
    return err?.code === "42P01"
        || /relation .* does not exist/i.test(String(err?.message || ""));
}
const COUNTRY_NAME = Object.fromEntries(country_journey_steps_1.SUPPORTED_JOURNEY_COUNTRIES.map((c) => [c.code, c.name]));
const COUNTRY_FLAG = Object.fromEntries(country_journey_steps_1.SUPPORTED_JOURNEY_COUNTRIES.map((c) => [c.code, c.flag]));
function humanAgo(d) {
    if (!d)
        return "recently";
    const ts = typeof d === "string" ? new Date(d).getTime() : d.getTime();
    const sec = Math.max(1, Math.floor((Date.now() - ts) / 1000));
    if (sec < 60)
        return "just now";
    if (sec < 3600)
        return `${Math.floor(sec / 60)} min ago`;
    if (sec < 86400)
        return `${Math.floor(sec / 3600)} hr ago`;
    if (sec < 7 * 86400)
        return `${Math.floor(sec / 86400)} day${Math.floor(sec / 86400) === 1 ? "" : "s"} ago`;
    return new Date(ts).toLocaleDateString("en-KE");
}
// ─── Individual signal sources ────────────────────────────────────────────
async function getServiceOrderCandidate(userId) {
    try {
        // First check for a paid/processing order (most urgent — user is waiting)
        const processing = await db_1.pool.query(`SELECT id, service_slug, service_name, status, created_at
         FROM service_orders
        WHERE user_id = $1
          AND status IN ('paid', 'processing')
          AND (output_text IS NULL OR output_text = '')
        ORDER BY created_at DESC
        LIMIT 1`, [userId]);
        if (processing.rows.length > 0) {
            const o = processing.rows[0];
            return {
                kind: "service_processing",
                priority: 100,
                href: `/services/order/${o.service_slug}?orderId=${o.id}`,
                // 2026-06: less robotic, more "person on the team is on it"
                headline: `We're working on your ${o.service_name}`,
                subhead: `Started ${humanAgo(o.created_at)} · we'll ping you the moment it's ready`,
                icon: "clock",
                accent: "amber",
            };
        }
        // Next check for completed but maybe not downloaded
        const completed = await db_1.pool.query(`SELECT id, service_slug, service_name, completed_at
         FROM service_orders
        WHERE user_id = $1
          AND status = 'completed'
          AND completed_at > NOW() - INTERVAL '14 days'
        ORDER BY completed_at DESC
        LIMIT 1`, [userId]);
        if (completed.rows.length > 0) {
            const o = completed.rows[0];
            return {
                kind: "service_ready",
                priority: 90,
                href: `/services/order/${o.service_slug}?orderId=${o.id}`,
                // 2026-06: warmer copy — feels like a gift, acknowledges the wait,
                // talks like a real person on the team handed it over.
                headline: `🎁 Your ${o.service_name} is here`,
                subhead: `We worked on it for a bit (${humanAgo(o.completed_at).replace(" ago", "")}) · PDF for sending, Word so you can tweak`,
                icon: "download",
                accent: "emerald",
            };
        }
        return null;
    }
    catch (err) {
        if (!isMissingTable(err))
            console.warn("[continue/service]", err?.message);
        return null;
    }
}
async function getInterviewCandidate(userId) {
    try {
        const { rows } = await db_1.pool.query(`SELECT id, country, role, transcript, created_at
         FROM interview_sessions
        WHERE user_id = $1
          AND status = 'in_progress'
          AND created_at > NOW() - INTERVAL '14 days'
        ORDER BY created_at DESC
        LIMIT 1`, [userId]);
        if (rows.length === 0)
            return null;
        const r = rows[0];
        const transcript = Array.isArray(r.transcript) ? r.transcript : [];
        const answered = transcript.filter((t) => t?.a).length;
        const total = 5;
        if (answered === 0) {
            // Started but didn't answer any — low signal, skip unless nothing else
            return {
                kind: "interview_resume",
                priority: 50,
                href: `/interview/${r.id}`,
                headline: `Pick up your ${r.role} mock interview`,
                subhead: `${COUNTRY_FLAG[r.country] ?? "🌍"} ${r.country} · 5 questions`,
                icon: "mic",
                accent: "indigo",
            };
        }
        return {
            kind: "interview_resume",
            priority: 80,
            href: `/interview/${r.id}`,
            headline: `Resume your ${r.role} interview`,
            subhead: `Question ${answered + 1} of ${total} · ${COUNTRY_FLAG[r.country] ?? "🌍"} ${r.country}`,
            icon: "mic",
            accent: "indigo",
            progressPercent: Math.round((answered / total) * 100),
        };
    }
    catch (err) {
        if (!isMissingTable(err))
            console.warn("[continue/interview]", err?.message);
        return null;
    }
}
async function getJourneyCandidate(userId) {
    try {
        const { rows } = await db_1.pool.query(`SELECT country_code, completed_steps, last_touched_at, stage, departure_date
         FROM user_country_journeys
        WHERE user_id = $1
        ORDER BY last_touched_at DESC NULLS LAST
        LIMIT 1`, [userId]);
        if (rows.length === 0)
            return null;
        const r = rows[0];
        const completed = Array.isArray(r.completed_steps) ? r.completed_steps : [];
        const allSteps = (0, country_journey_steps_1.getJourneySteps)(r.country_code);
        const total = allSteps.length;
        const done = completed.length;
        const pct = total > 0 ? Math.round((done / total) * 100) : 0;
        const flag = COUNTRY_FLAG[r.country_code] ?? "🌍";
        const name = COUNTRY_NAME[r.country_code] ?? r.country_code;
        // ── HIGHEST PRIORITY: user is at "hired" with a departure date set ─────
        // Surfaces the countdown so they can't miss the pre-departure checklist.
        if (r.stage === "hired" && r.departure_date) {
            const ms = new Date(r.departure_date).getTime() - Date.now();
            const days = Math.ceil(ms / 86400000);
            if (days >= 0) {
                const subhead = days === 0
                    ? `Today · pre-departure checklist`
                    : days === 1
                        ? `Tomorrow · pre-departure checklist`
                        : days <= 14
                            ? `${days} days away · finish your pre-departure list`
                            : `${days} days away · ${flag} ${name}`;
                return {
                    kind: "journey_progress",
                    priority: 95, // higher than even a stuck CV order
                    href: `/journey/${r.country_code}`,
                    headline: `${flag} You fly in ${days} day${days === 1 ? "" : "s"}`,
                    subhead,
                    icon: "sparkles",
                    accent: days <= 7 ? "rose" : "amber",
                };
            }
        }
        // Recently-completed journey → celebration
        if (pct === 100) {
            const finishedRecently = r.last_touched_at && Date.now() - new Date(r.last_touched_at).getTime() < 7 * 86400000;
            if (finishedRecently) {
                return {
                    kind: "journey_finished",
                    priority: 70,
                    href: `/journey/${r.country_code}`,
                    headline: `${flag} You finished the ${name} roadmap`,
                    subhead: "All steps complete · review or share your wins",
                    icon: "trophy",
                    accent: "emerald",
                    progressPercent: 100,
                };
            }
            return null; // old completion — don't keep nagging
        }
        // In-progress journey
        if (done === 0) {
            // Started but nothing done — low priority, but worth nudging
            return {
                kind: "journey_progress",
                priority: 40,
                href: `/journey/${r.country_code}`,
                headline: `Your ${name} journey is waiting`,
                subhead: `${total} steps · last opened ${humanAgo(r.last_touched_at)}`,
                icon: "globe",
                accent: "cyan",
                progressPercent: 0,
            };
        }
        return {
            kind: "journey_progress",
            priority: 75,
            href: `/journey/${r.country_code}`,
            // 2026-06: warmer — names the country properly, acknowledges progress
            headline: `${flag} Your ${name} move — ${done}/${total} done`,
            subhead: `Last time you popped in: ${humanAgo(r.last_touched_at)}. Pick up where you left off.`,
            icon: "globe",
            accent: "blue",
            progressPercent: pct,
        };
    }
    catch (err) {
        if (!isMissingTable(err))
            console.warn("[continue/journey]", err?.message);
        return null;
    }
}
function registerContinueRoute(app) {
    app.get("/api/me/continue", replitAuth_1.isAuthenticated, async (req, res) => {
        try {
            const userId = getUserId(req);
            if (!userId)
                return res.status(401).json({ continue: null });
            // Pull all signals in parallel — any failure is silently skipped.
            const [svc, interview, journey] = await Promise.all([
                getServiceOrderCandidate(userId),
                getInterviewCandidate(userId),
                getJourneyCandidate(userId),
            ]);
            const candidates = [svc, interview, journey].filter(Boolean);
            if (candidates.length === 0) {
                return res.json({ continue: null });
            }
            // Highest priority wins; tie-breaker = first in array (deterministic)
            candidates.sort((a, b) => b.priority - a.priority);
            res.setHeader("Cache-Control", "private, max-age=30");
            res.json({ continue: candidates[0], totalCandidates: candidates.length });
        }
        catch (err) {
            console.error("[continue]", err?.message);
            res.json({ continue: null });
        }
    });
    console.log("[continue] Route registered: GET /api/me/continue");
}
