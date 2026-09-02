"use strict";
/**
 * Job ↔ CV matcher — scores how well a fetched job matches the user's CV.
 *
 * V1 uses a fast keyword-overlap heuristic. It's not perfect but produces
 * useful rankings without paying for OpenAI embeddings on every match
 * (100 users × 100 jobs/day × KES 0.02/call = KES 6,000/day just in
 * embeddings). V2 can layer embedding-based semantic similarity on top
 * of the top-20 keyword matches for a small cost jump.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.scoreJobAgainstCv = scoreJobAgainstCv;
function scoreJobAgainstCv(input) {
    const jobBlob = `${input.jobTitle} ${input.jobDescription}`.toLowerCase();
    const cvBlob = input.cvText.toLowerCase();
    const reasons = [];
    let score = 0;
    // ── 1. Target-role match (biggest single weight — up to 40 pts) ──────
    const titleLC = input.jobTitle.toLowerCase();
    for (const role of input.targetRoles) {
        const roleLC = role.toLowerCase().trim();
        if (!roleLC)
            continue;
        if (titleLC.includes(roleLC)) {
            score += 40;
            reasons.push(`title matches "${role}"`);
            break;
        }
        // Partial match on individual words in the role
        const roleWords = roleLC.split(/\s+/).filter((w) => w.length > 3);
        const hits = roleWords.filter((w) => titleLC.includes(w));
        if (hits.length >= Math.ceil(roleWords.length / 2)) {
            score += 25;
            reasons.push(`partial title match on ${hits.join(", ")}`);
            break;
        }
    }
    // ── 2. Skill/keyword overlap with CV (up to 30 pts) ──────────────────
    const cvSkills = extractSkillKeywords(cvBlob);
    const jobSkills = extractSkillKeywords(jobBlob);
    const overlap = cvSkills.filter((s) => jobSkills.includes(s));
    if (overlap.length > 0) {
        const overlapPts = Math.min(30, overlap.length * 5);
        score += overlapPts;
        if (overlap.length >= 3) {
            reasons.push(`${overlap.length} matching skills: ${overlap.slice(0, 4).join(", ")}${overlap.length > 4 ? "…" : ""}`);
        }
        else {
            reasons.push(`skills match: ${overlap.join(", ")}`);
        }
    }
    // ── 3. Experience-level fit (up to 15 pts) ───────────────────────────
    if (input.experienceYrs !== undefined) {
        const yoe = input.experienceYrs;
        // Extract "X+ years" mentions from the job description
        const yoeMatch = jobBlob.match(/(\d+)\+?\s*years?\s+(of\s+)?experience/);
        if (yoeMatch) {
            const jobYoe = Number(yoeMatch[1]);
            if (yoe >= jobYoe) {
                score += 15;
                reasons.push(`your ${yoe}y experience meets required ${jobYoe}y`);
            }
            else if (yoe >= jobYoe - 1) {
                score += 8;
                reasons.push(`close to required experience`);
            }
        }
    }
    // ── 4. Sponsorship / visa signals (up to 15 pts) ─────────────────────
    const sponsorSignals = [
        "sponsorship",
        "visa sponsor",
        "certificate of sponsorship",
        "cos",
        "tier 2",
        "skilled worker visa",
        "h-1b",
        "h1b",
        "will sponsor",
    ];
    const hasSponsorSignal = sponsorSignals.some((s) => jobBlob.includes(s));
    if (hasSponsorSignal) {
        score += 15;
        reasons.push("mentions visa sponsorship");
    }
    // ── 5. Location bonus if job is in a target country ──────────────────
    // (Country filter is already applied at fetch time, so this is a bonus
    // signal, not a filter.)
    return {
        score: Math.min(100, Math.max(0, Math.round(score))),
        reasons: reasons.slice(0, 5), // cap so the UI doesn't drown
    };
}
// ─── Skill keyword extraction (tiny hand-rolled taxonomy) ─────────────
// V2 upgrade path: replace this with an LLM call that extracts
// domain-specific skills. But for V1 a static taxonomy scored high
// enough to build the product.
const SKILL_KEYWORDS = [
    // Nursing / healthcare
    "nursing", "icu", "critical care", "midwifery", "paediatric", "pediatric",
    "theatre", "operating theatre", "emergency", "a&e", "trauma",
    "cardiac", "renal", "oncology", "psychiatric", "mental health",
    "phlebotomy", "cannulation", "iv therapy", "wound care",
    "nclex", "nmc", "hcpc", "ielts", "oet", "prometric", "dha", "haad", "moh",
    // Software / tech
    "react", "typescript", "python", "javascript", "node", "go", "rust",
    "aws", "azure", "gcp", "docker", "kubernetes", "terraform",
    "postgres", "mysql", "mongodb", "redis", "elasticsearch",
    "django", "flask", "fastapi", "spring", "rails", "laravel",
    "devops", "cloud", "microservices", "graphql", "rest api",
    "machine learning", "ml", "data science", "nlp", "computer vision",
    "cybersecurity", "penetration testing", "cissp", "cism",
    // Hospitality / F&B
    "hotel", "restaurant", "chef", "sous chef", "kitchen", "food safety",
    "housekeeping", "front office", "concierge", "banquet",
    "pastry", "barista", "sommelier", "hospitality",
    // Construction / trades
    "welding", "welder", "mig", "tig", "arc welding",
    "electrician", "plumber", "carpenter", "hvac", "refrigeration",
    "cnc", "machinist", "fitter", "mechanic", "diesel", "hgv",
    // Driving
    "driving licence", "ce licence", "code 95", "hgv licence", "cdl",
    "long haul", "truck driver", "articulated lorry",
    // Finance / accounting
    "accountant", "cpa", "acca", "cima", "financial reporting",
    "audit", "tax", "ifrs", "gaap", "quickbooks", "sap", "oracle",
    // General
    "supervisor", "team lead", "manager", "coordinator",
    "bilingual", "customer service", "sales", "b2b", "saas",
];
function extractSkillKeywords(text) {
    const found = new Set();
    for (const kw of SKILL_KEYWORDS) {
        if (text.includes(kw))
            found.add(kw);
    }
    return Array.from(found);
}
