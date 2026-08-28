"use strict";
/**
 * Adzuna job source adapter.
 *
 * Adzuna is a global job aggregator with a generous free tier (250
 * requests/day) that covers exactly the countries we care about:
 * gb (UK), ca (Canada), us (USA), au (Australia), de (Germany),
 * nl (Netherlands), pl (Poland), za (South Africa).
 *
 * Get free credentials at https://developer.adzuna.com/ and put them in
 * ADZUNA_APP_ID + ADZUNA_APP_KEY env vars on Render.
 *
 * If credentials are missing, the fetch returns an empty array and logs
 * a warning — the sync still completes, just with zero results. This
 * lets the whole autoapply feature ship before Tony has the API keys.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchAdzunaJobs = fetchAdzunaJobs;
// Map our country codes → Adzuna's two-letter codes
const COUNTRY_TO_ADZUNA = {
    uk: "gb",
    gb: "gb",
    england: "gb",
    scotland: "gb",
    canada: "ca",
    ca: "ca",
    usa: "us",
    us: "us",
    america: "us",
    australia: "au",
    au: "au",
    "new-zealand": "nz",
    germany: "de",
    de: "de",
    netherlands: "nl",
    nl: "nl",
    poland: "pl",
    pl: "pl",
    "south-africa": "za",
    za: "za",
    // UAE, Saudi, Kuwait etc. aren't in Adzuna's free tier. V2 will use
    // Bayt.com or GulfTalent adapters for those markets.
};
// Rough monthly-KES conversion for Adzuna's yearly salary figures.
// (Real product should hit /api/fx-rate for live rates; for V1 use fixed
// rates that update on redeploy — good enough to sort matches.)
const YEARLY_TO_MONTHLY_KES = {
    gb: 130 / 12, // £1  = ~KES 130 (2026)
    ca: 97 / 12, // CAD 1 = ~KES 97
    us: 130 / 12, // USD 1 = ~KES 130
    au: 86 / 12, // AUD 1 = ~KES 86
    nz: 78 / 12,
    de: 140 / 12, // EUR 1 = ~KES 140
    nl: 140 / 12,
    pl: 33 / 12, // PLN 1 = ~KES 33
    za: 7 / 12, // ZAR 1 = ~KES 7
};
async function fetchAdzunaJobs(args) {
    const appId = (process.env.ADZUNA_APP_ID || "").trim();
    const appKey = (process.env.ADZUNA_APP_KEY || "").trim();
    if (!appId || !appKey) {
        console.warn("[autoapply/adzuna] ADZUNA_APP_ID / ADZUNA_APP_KEY not set — skipping. Get free credentials at https://developer.adzuna.com/");
        return [];
    }
    const adzunaCountry = COUNTRY_TO_ADZUNA[args.country.toLowerCase()];
    if (!adzunaCountry) {
        return []; // Country not on Adzuna free tier — silent skip
    }
    const url = new URL(`https://api.adzuna.com/v1/api/jobs/${adzunaCountry}/search/${args.page ?? 1}`);
    url.searchParams.set("app_id", appId);
    url.searchParams.set("app_key", appKey);
    url.searchParams.set("results_per_page", String(args.resultsPerPage ?? 20));
    url.searchParams.set("what", args.what);
    url.searchParams.set("content-type", "application/json");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
        const res = await fetch(url.toString(), {
            signal: controller.signal,
            headers: {
                "User-Agent": "WorkAbroadHub-AutoApply/1.0 (+https://workabroadhub.tech)",
            },
        });
        if (!res.ok) {
            throw new Error(`Adzuna HTTP ${res.status}`);
        }
        const data = await res.json();
        const results = data.results ?? [];
        return results.map((r) => normaliseAdzunaJob(r, adzunaCountry));
    }
    finally {
        clearTimeout(timeout);
    }
}
function normaliseAdzunaJob(raw, adzunaCountry) {
    const salaryMin = raw.salary_min ?? null;
    const salaryMax = raw.salary_max ?? null;
    const salaryDisplay = formatSalary(salaryMin, salaryMax, adzunaCountry);
    const midSalary = salaryMin && salaryMax
        ? (salaryMin + salaryMax) / 2
        : (salaryMin ?? salaryMax ?? null);
    const kesRate = YEARLY_TO_MONTHLY_KES[adzunaCountry] ?? null;
    const salaryKesMonthly = midSalary && kesRate
        ? Math.round(midSalary * kesRate)
        : null;
    return {
        source: "adzuna",
        externalId: String(raw.id ?? raw.redirect_url ?? Math.random()),
        title: raw.title?.trim() ?? "Untitled role",
        employer: raw.company?.display_name ?? null,
        country: adzunaCountry,
        city: raw.location?.area?.[raw.location.area.length - 1] ?? raw.location?.display_name ?? null,
        salaryDisplay,
        salaryKesMonthly,
        postedAt: raw.created ? new Date(raw.created) : null,
        applyUrl: raw.redirect_url ?? "https://www.adzuna.com/",
        description: (raw.description ?? "").trim(),
    };
}
function formatSalary(min, max, country) {
    if (!min && !max)
        return null;
    const currency = COUNTRY_CURRENCY[country] ?? "";
    if (min && max && min !== max)
        return `${currency}${Math.round(min).toLocaleString()} – ${currency}${Math.round(max).toLocaleString()}`;
    const one = min ?? max ?? 0;
    return `${currency}${Math.round(one).toLocaleString()}`;
}
const COUNTRY_CURRENCY = {
    gb: "£", ca: "CAD ", us: "$", au: "AUD ", nz: "NZD ",
    de: "€", nl: "€", pl: "PLN ", za: "ZAR ",
};
