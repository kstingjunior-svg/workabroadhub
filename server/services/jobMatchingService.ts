/**
 * AI Job Matching Service
 * Extracts CV insights → keyword pre-filter → single batch AI scoring → top 5
 */
import { openai } from "../lib/openai";
import { storage } from "../storage";
import type { Job } from "@shared/schema";

export interface CvInsights {
  skills: string[];
  jobTitles: string[];
  experienceYears: number;
  education: string[];
  industries: string[];
  profession: string;
  seniority: string;
  certifications: string[];
  languages: string[];
  visaEligibility: string;
  recommendedCountries: string[];
  salaryExpectation: string;
  summary: string;
  name?: string;
}

export interface JobMatch {
  id: string;
  title: string;
  company: string;
  country: string;
  salary: string | null;
  jobCategory: string | null;
  description: string | null;
  visaSponsorship: boolean;
  matchScore: number;
  matchReason: string;
  keywordScore: number;
}

// Safely parse JSON — strips markdown code fences the AI sometimes wraps output in
function safeParseJson(raw: string): any {
  const stripped = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try { return JSON.parse(stripped); } catch { return null; }
}

// ── Step 1: Extract structured CV insights via AI ─────────────────────────────
export async function extractCvInsights(cvText: string): Promise<CvInsights> {
  const truncated = cvText.slice(0, 8000);

  try {
    const res = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            `You are a CV parsing expert. Extract all available information from the CV text below, even if the text is messy or partially formatted.\n` +
            `Return ONLY this JSON (no markdown, no extra keys):\n` +
            `{\n` +
            `  "name": "<full name if visible, else null>",\n` +
            `  "profession": "<Primary job title e.g. Registered Nurse, Software Engineer>",\n` +
            `  "seniority": "<Entry-level | Mid-level | Senior | Executive>",\n` +
            `  "skills": ["<skill>", ...],\n` +
            `  "jobTitles": ["<current or past job title>", ...],\n` +
            `  "experienceYears": <integer — total years>,\n` +
            `  "education": ["<degree or field>", ...],\n` +
            `  "industries": ["<industry sector>", ...],\n` +
            `  "certifications": ["<cert>", ...],\n` +
            `  "languages": ["<language>", ...],\n` +
            `  "visaEligibility": "<High|Medium|Low> — <one-sentence reason>",\n` +
            `  "recommendedCountries": ["<country>", ...],\n` +
            `  "salaryExpectation": "<estimated monthly range in KES>",\n` +
            `  "summary": "<Two-sentence professional summary>"\n` +
            `}\n` +
            `Be generous in extracting skills — infer them from context if not listed explicitly.`,
        },
        { role: "user", content: `CV TEXT:\n${truncated}` },
      ],
      temperature: 0.2,
      max_tokens: 1200,
    });

    const raw = res.choices[0]?.message?.content ?? "{}";
    const p = safeParseJson(raw) ?? {};

    return {
      name:             typeof p.name             === "string" ? p.name             : undefined,
      skills:           Array.isArray(p.skills)    ? p.skills    : [],
      jobTitles:        Array.isArray(p.jobTitles) ? p.jobTitles : [p.profession ?? "Professional"],
      experienceYears:  typeof p.experienceYears   === "number"  ? p.experienceYears : 0,
      education:        Array.isArray(p.education)  ? p.education : [],
      industries:       Array.isArray(p.industries) ? p.industries : [],
      profession:          typeof p.profession          === "string" ? p.profession          : "Professional",
      seniority:           typeof p.seniority           === "string" ? p.seniority           : "Mid-level",
      certifications:      Array.isArray(p.certifications)  ? p.certifications  : [],
      languages:           Array.isArray(p.languages)        ? p.languages       : ["English"],
      visaEligibility:     typeof p.visaEligibility     === "string" ? p.visaEligibility     : "Medium — please consult an advisor",
      recommendedCountries:Array.isArray(p.recommendedCountries) ? p.recommendedCountries : ["UK", "Canada", "UAE"],
      salaryExpectation:   typeof p.salaryExpectation   === "string" ? p.salaryExpectation   : "Negotiable",
      summary:             typeof p.summary             === "string" ? p.summary             : "",
    };

  } catch {
    return {
      skills: [], jobTitles: [], experienceYears: 0, education: [], industries: [],
      profession: "Professional", seniority: "Mid-level", certifications: [],
      languages: ["English"],
      visaEligibility: "Medium — more details needed",
      recommendedCountries: ["UK", "Canada", "UAE"],
      salaryExpectation: "Negotiable",
      summary: "Professional seeking overseas employment opportunities.",
    };
  }
}

// ── Step 2: Rule-based keyword pre-scoring (0–100) ───────────────────────────
export function scoreJobKeywordMatch(job: Job, insights: CvInsights): number {
  const haystack = [
    job.title,
    job.description ?? "",
    job.jobCategory ?? "",
    job.company,
  ].join(" ").toLowerCase();

  let score = 0;

  // Profession label match
  if (insights.profession && insights.profession !== "Professional") {
    const profWords = insights.profession.toLowerCase().split(/\s+/);
    for (const word of profWords) {
      if (word.length > 3 && haystack.includes(word)) score += 15;
    }
  }

  // Skills overlap
  for (const skill of insights.skills) {
    if (haystack.includes(skill.toLowerCase())) score += 8;
  }

  // Job title match
  for (const title of insights.jobTitles) {
    const words = title.toLowerCase().split(/\s+/);
    for (const word of words) {
      if (word.length > 3 && haystack.includes(word)) score += 12;
    }
  }

  // Industry match
  for (const ind of insights.industries) {
    if (haystack.includes(ind.toLowerCase())) score += 6;
  }

  // Education field match
  for (const edu of insights.education) {
    if (haystack.includes(edu.toLowerCase())) score += 5;
  }

  // Country bonus
  if (
    insights.recommendedCountries?.length > 0 &&
    insights.recommendedCountries.some(
      (c) => c.toLowerCase() === (job.country ?? "").toLowerCase()
    )
  ) {
    score += 25;
  }

  // Visa sponsorship bonus
  if (job.visaSponsorship) score += 15;

  return Math.min(100, score);
}

// ── Step 3: AI batch scoring — honest, differentiated, uses actual CV text ────
async function batchAIMatchScores(
  cvText: string,
  insights: CvInsights,
  candidates: Job[]
): Promise<{ id: string; score: number; reason: string }[]> {
  if (candidates.length === 0) return [];

  const jobList = candidates.map((j, i) => ({
    index: i + 1,
    id: j.id,
    title: j.title,
    company: j.company,
    country: j.country,
    category: j.jobCategory ?? "General",
    visaSponsorship: j.visaSponsorship,
    description: (j.description ?? "").slice(0, 400),
  }));

  // Use a rich CV summary PLUS a snippet of the raw CV for context
  const cvSummary = `
Profession: ${insights.profession}
Seniority: ${insights.seniority}
Skills: ${insights.skills.slice(0, 15).join(", ") || "Not specified"}
Job Titles: ${insights.jobTitles.slice(0, 5).join(", ") || "Not specified"}
Experience: ${insights.experienceYears} years
Education: ${insights.education.slice(0, 3).join(", ") || "Not specified"}
Industries: ${insights.industries.slice(0, 5).join(", ") || "Not specified"}
Certifications: ${insights.certifications.slice(0, 5).join(", ") || "None listed"}
Recommended Countries: ${insights.recommendedCountries.join(", ")}
--- CV Excerpt ---
${cvText.slice(0, 1500)}
`.trim();

  try {
    const res = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are an honest, experienced job matching expert helping Kenyan overseas job seekers.
Evaluate how well this candidate truly matches each job listing based on their actual skills, experience, and profession.

SCORING RULES — be accurate and differentiated:
- 80-100%: Candidate's profession/skills directly match the job role
- 60-79%: Candidate has relevant experience and could do this job with minor upskilling
- 40-59%: Partial match — relevant industry/skills but different specialty
- 20-39%: Weak match — different field but some transferable skills
- 0-19%: No meaningful match — completely different profession/skills

IMPORTANT:
- If a nurse applies to a nursing job → score 75-95%
- If a software engineer applies to a software job → score 75-95%
- NEVER give the same score to every job — scores must be differentiated
- Be honest: a nurse applying to a Data Scientist role should score 5-15%
- Consider visa sponsorship availability as a bonus (+5-10 points)

Return ONLY a JSON array (no markdown, no extra text):
[
  { "id": "<job_id>", "score": <0-100 integer>, "reason": "<one honest sentence>" },
  ...
]`,
        },
        {
          role: "user",
          content: `CANDIDATE:\n${cvSummary}\n\nJOBS TO EVALUATE:\n${JSON.stringify(jobList, null, 2)}`,
        },
      ],
      temperature: 0.1,
      max_tokens: 1000,
    });

    const raw = res.choices[0]?.message?.content ?? "[]";
    const parsed = safeParseJson(raw);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    return [];
  } catch {
    return candidates.map((j) => ({
      id: j.id,
      score: scoreJobKeywordMatch(j, insights),
      reason: "Matched based on skills and experience keywords in your CV.",
    }));
  }
}

// ── Main exported function ────────────────────────────────────────────────────
export async function getJobMatches(cvText: string): Promise<JobMatch[]> {
  const allJobs = await storage.getVisaJobs();
  if (allJobs.length === 0) return [];

  // Step 1: Extract CV insights
  const insights = await extractCvInsights(cvText);

  // Step 2: Rule-based pre-filtering — score all, keep top 15
  const scored = allJobs
    .map((job) => ({ job, kwScore: scoreJobKeywordMatch(job, insights) }))
    .sort((a, b) => b.kwScore - a.kwScore)
    .slice(0, 15);

  // Step 3: Batch AI scoring on the top 15 candidates
  const aiScores = await batchAIMatchScores(cvText, insights, scored.map((s) => s.job));

  // Step 4: Merge scores — 60% AI + 40% keyword (both matter)
  const aiMap = new Map(aiScores.map((s) => [s.id, s]));

  const merged: JobMatch[] = scored.map(({ job, kwScore }) => {
    const ai = aiMap.get(job.id);
    const finalScore = ai
      ? Math.round(ai.score * 0.6 + Math.min(100, kwScore) * 0.4)
      : Math.min(100, kwScore);
    return {
      id: job.id,
      title: job.title,
      company: job.company,
      country: job.country,
      salary: job.salary ?? null,
      jobCategory: job.jobCategory ?? null,
      description: job.description ?? null,
      visaSponsorship: job.visaSponsorship,
      matchScore: finalScore,
      matchReason: ai?.reason ?? "Matched based on your CV keywords.",
      keywordScore: kwScore,
    };
  });

  // Step 5: Return top 5 sorted by final score
  return merged.sort((a, b) => b.matchScore - a.matchScore).slice(0, 5);
}
