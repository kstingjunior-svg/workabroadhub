"use strict";
/**
 * job-analyzer — scrapes a job posting URL and runs GPT-4o analysis.
 *
 * Strategy:
 *   1. Fetch the page with axios (fast, no browser overhead).
 *      If the returned body is too thin (JS-rendered page), fall back to
 *      puppeteer which already ships in this project.
 *   2. Strip HTML → plain text (max 4,000 chars fed to GPT-4o).
 *   3. GPT-4o structured JSON → validated, typed result.
 *   4. Results are cached in-process for 30 minutes keyed by URL so repeated
 *      analysis of the same posting never burns extra API tokens.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.scrapeJobPosting = scrapeJobPosting;
exports.analyzeJob = analyzeJob;
const axios_1 = __importDefault(require("axios"));
const crypto_1 = require("crypto");
const openai_1 = require("../lib/openai");
const cache_1 = require("../cache");
// ── HTML helpers ──────────────────────────────────────────────────────────────
const SCRAPER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; WorkAbroadBot/1.0; +https://workabroadhub.tech)",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate",
};
function stripHtml(html) {
    return html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s{2,}/g, " ")
        .trim();
}
function extractTitle(html) {
    const m = html.match(/<title[^>]*>([^<]{1,200})<\/title>/i);
    return m ? m[1].trim() : undefined;
}
// ── Scraping ──────────────────────────────────────────────────────────────────
const MIN_USEFUL_CHARS = 200;
const MAX_DESCRIPTION_CHARS = 4000;
async function scrapeWithAxios(url) {
    const response = await axios_1.default.get(url, {
        headers: SCRAPER_HEADERS,
        timeout: 12000,
        maxRedirects: 5,
        responseType: "text",
    });
    const html = String(response.data);
    const rawText = stripHtml(html).slice(0, MAX_DESCRIPTION_CHARS);
    const title = extractTitle(html);
    return { url, rawText, title, via: "axios" };
}
async function scrapeWithPuppeteer(url) {
    const puppeteer = (await Promise.resolve().then(() => __importStar(require("puppeteer")))).default;
    const browser = await puppeteer.launch({
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    try {
        const page = await browser.newPage();
        await page.setUserAgent(SCRAPER_HEADERS["User-Agent"]);
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
        const html = await page.content();
        const rawText = stripHtml(html).slice(0, MAX_DESCRIPTION_CHARS);
        const title = extractTitle(html);
        return { url, rawText, title, via: "puppeteer" };
    }
    finally {
        await browser.close();
    }
}
async function scrapeJobPosting(url) {
    const axiosResult = await scrapeWithAxios(url).catch((err) => {
        console.warn(`[JobAnalyzer] Axios scrape failed for ${url}: ${err?.message} — trying puppeteer`);
        return null;
    });
    if (axiosResult && axiosResult.rawText.length >= MIN_USEFUL_CHARS) {
        return axiosResult;
    }
    console.log(`[JobAnalyzer] Axios gave thin content (${axiosResult?.rawText.length ?? 0} chars), falling back to puppeteer`);
    return scrapeWithPuppeteer(url);
}
// ── AI analysis ───────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a senior career expert and ATS specialist.
Analyse job posting text and return ONLY a JSON object with these fields:
{
  "title": "Job title from the posting",
  "company": "Company name",
  "country": "Country where role is based (or 'Remote')",
  "seniority": "junior | mid-level | senior | lead | manager | unknown",
  "keywords": ["ATS keyword 1", "ATS keyword 2", ...],
  "required_skills": ["Must-have skill 1", ...],
  "nice_to_have": ["Preferred skill 1", ...],
  "company_culture": "1–2 sentences on culture / values",
  "tone": "formal | casual | technical | startup | corporate"
}
Rules:
- keywords: 8–15 ATS-relevant terms pulled directly from the text.
- required_skills: hard requirements (must-have) only. 5–12 items max.
- nice_to_have: explicit preferences/bonus mentions. Empty array if none.
- Do NOT add skills that are not mentioned in the text.
- Return valid JSON only. No markdown, no explanation.`;
async function callGPT(text) {
    const response = await openai_1.openai.chat.completions.create({
        model: "gpt-4o",
        temperature: 0.1,
        max_tokens: 900,
        response_format: { type: "json_object" },
        messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: `Analyse this job posting:\n\n${text}` },
        ],
    });
    // Track real token usage (fire-and-forget)
    if (response.usage) {
        Promise.resolve().then(() => __importStar(require("../lib/aiStats"))).then(({ trackTokenUsage }) => trackTokenUsage(response.usage.prompt_tokens, response.usage.completion_tokens)).catch(() => { });
    }
    const raw = response.choices[0].message.content ?? "{}";
    return JSON.parse(raw);
}
// ── Main export ───────────────────────────────────────────────────────────────
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
async function analyzeJob(url) {
    const cacheKey = `job_analysis:${(0, crypto_1.createHash)("sha1").update(url).digest("hex")}`;
    const cached = cache_1.cache.get(cacheKey);
    if (cached) {
        console.log(`[JobAnalyzer] Cache hit for ${url}`);
        return cached;
    }
    console.log(`[JobAnalyzer] START | url=${url}`);
    const scraped = await scrapeJobPosting(url);
    if (scraped.rawText.length < MIN_USEFUL_CHARS) {
        throw new Error(`Could not extract meaningful content from ${url} (${scraped.rawText.length} chars). ` +
            "The page may require login or block automated access.");
    }
    console.log(`[JobAnalyzer] Scraped ${scraped.rawText.length} chars via ${scraped.via} | title="${scraped.title ?? "unknown"}"`);
    const ai = await callGPT(scraped.rawText);
    const result = {
        url,
        title: typeof ai.title === "string" ? ai.title : scraped.title ?? "Unknown",
        company: typeof ai.company === "string" ? ai.company : "Unknown",
        country: typeof ai.country === "string" ? ai.country : "Unknown",
        seniority: typeof ai.seniority === "string" ? ai.seniority : "unknown",
        keywords: Array.isArray(ai.keywords) ? ai.keywords : [],
        required_skills: Array.isArray(ai.required_skills) ? ai.required_skills : [],
        nice_to_have: Array.isArray(ai.nice_to_have) ? ai.nice_to_have : [],
        company_culture: typeof ai.company_culture === "string" ? ai.company_culture : "",
        tone: typeof ai.tone === "string" ? ai.tone : "formal",
        raw_description: scraped.rawText,
        analyzed_at: new Date().toISOString(),
    };
    cache_1.cache.set(cacheKey, result, CACHE_TTL_MS);
    console.log(`[JobAnalyzer] DONE | title="${result.title}" | company="${result.company}" ` +
        `| skills=${result.required_skills.length} | keywords=${result.keywords.length}`);
    return result;
}
