"use strict";
// @ts-nocheck
/**
 * generateApplicationMaterials
 *
 * Generates a job-tailored CV and cover letter for a specific application
 * using the user's career profile + the job description as context.
 *
 * On completion:
 *   - Stores results in user_job_applications.prepared_materials (jsonb)
 *   - Updates application status → "materials_ready"
 *   - Fires a push notification to every active browser subscription for the user
 *   - Fires a WebSocket event so the page refreshes immediately
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateJobTailoredCV = generateJobTailoredCV;
exports.generateCoverLetter = generateCoverLetter;
exports.generateInterviewPrep = generateInterviewPrep;
exports.generateApplicationMaterials = generateApplicationMaterials;
exports.sendUserPushNotification = sendUserPushNotification;
const db_1 = require("../db");
const openai_1 = require("../lib/openai");
const storage_1 = require("../storage");
const schema_1 = require("@shared/schema");
const drizzle_orm_1 = require("drizzle-orm");
const push_notifications_1 = require("./push-notifications");
const aiStats_1 = require("../lib/aiStats");
// ── Helpers ───────────────────────────────────────────────────────────────────
async function generateJobTailoredCV(user, careerProfile, job, packType) {
    const firstName = user.firstName ?? user.first_name ?? "";
    const lastName = user.lastName ?? user.last_name ?? "";
    const fullName = [firstName, lastName].filter(Boolean).join(" ") || "Applicant";
    const jobTitle = careerProfile?.currentJobTitle ?? user.currentJobTitle ?? "Professional";
    const yearsExp = careerProfile?.yearsExperience ?? user.yearsExperience ?? null;
    const skills = (careerProfile?.skills ?? user.skills ?? []).filter(Boolean).join(", ");
    const isPremium = packType === "premium";
    const storedCv = careerProfile?.parsedCvText;
    const prompt = [
        `Candidate: ${fullName} | Role: ${jobTitle} | Experience: ${yearsExp ?? "not specified"} years`,
        `Skills: ${skills || "not specified"}`,
        `Target Job: ${job.title} at ${job.company} (${job.country})`,
        job.description ? `Job Description:\n${job.description.slice(0, 800)}` : "",
        storedCv ? `\nCandidate's actual CV text (use this as the primary source of truth for their background):\n${storedCv.slice(0, 3000)}` : "",
        "",
        "Instructions:",
        "1. Tailor the Professional Summary directly to this specific job and company.",
        "2. Highlight skills from the candidate's profile that match the job description keywords.",
        "3. Sections: Professional Summary · Key Skills · Work Experience · Education · Certifications · Languages.",
        isPremium
            ? "4. Premium format: include quantified achievements, leadership examples, and a strong personal brand statement."
            : "4. Standard format: concise, ATS-friendly, plain text.",
        "5. Under 650 words. No placeholders. No markdown. No asterisks.",
    ].join("\n");
    const response = await openai_1.openai.chat.completions.create({
        model: "gpt-4o",
        temperature: 0.3,
        max_tokens: 1200,
        messages: [
            {
                role: "system",
                content: "You are an expert CV writer for East African professionals targeting overseas employment. " +
                    "Write specific, tailored, ATS-optimised content. Never use placeholder text.",
            },
            { role: "user", content: prompt },
        ],
    });
    // Track real token usage (fire-and-forget)
    if (response.usage) {
        (0, aiStats_1.trackTokenUsage)(response.usage.prompt_tokens, response.usage.completion_tokens).catch(() => { });
    }
    return response.choices[0].message.content ?? "";
}
async function generateCoverLetter(user, careerProfile, job) {
    const firstName = user.firstName ?? user.first_name ?? "";
    const lastName = user.lastName ?? user.last_name ?? "";
    const fullName = [firstName, lastName].filter(Boolean).join(" ") || "Applicant";
    const jobTitle = careerProfile?.currentJobTitle ?? user.currentJobTitle ?? "Professional";
    const summary = careerProfile?.summary ?? `${jobTitle} with international career ambitions`;
    const storedCv = careerProfile?.parsedCvText;
    const prompt = [
        `Write a compelling cover letter for ${fullName} applying for: ${job.title} at ${job.company} (${job.country}).`,
        "",
        `Candidate background: ${summary}`,
        job.description ? `Key job requirements: ${job.description.slice(0, 500)}` : "",
        storedCv ? `\nCandidate's actual CV (use for specific details — achievements, employer names, dates):\n${storedCv.slice(0, 2000)}` : "",
        "",
        "Requirements:",
        "- 3–4 paragraphs, professional tone, enthusiastic but not generic.",
        "- Opening: express specific interest in this company and role.",
        "- Body: connect the candidate's experience directly to the job requirements.",
        "- Closing: clear call to action (request interview).",
        "- Sign off with the candidate's full name.",
        "- Plain text only. Under 350 words.",
    ].join("\n");
    const response = await openai_1.openai.chat.completions.create({
        model: "gpt-4o",
        temperature: 0.4,
        max_tokens: 700,
        messages: [
            {
                role: "system",
                content: "You are a professional cover letter writer. Write personalized, specific, persuasive letters. " +
                    "Never use generic filler. Always connect the candidate directly to the company.",
            },
            { role: "user", content: prompt },
        ],
    });
    // Track real token usage (fire-and-forget)
    if (response.usage) {
        (0, aiStats_1.trackTokenUsage)(response.usage.prompt_tokens, response.usage.completion_tokens).catch(() => { });
    }
    return response.choices[0].message.content ?? "";
}
/**
 * generateInterviewPrep
 *
 * Produces three tailored interview Q&A pairs and a list of specific CV
 * customisation suggestions for the given job. Uses JSON-mode GPT so the
 * response is guaranteed to parse without markdown cleanup.
 * Never throws — returns empty arrays on failure so the rest of the pipeline
 * is unaffected.
 */
async function generateInterviewPrep(user, careerProfile, job) {
    const firstName = user.firstName ?? user.first_name ?? "";
    const lastName = user.lastName ?? user.last_name ?? "";
    const fullName = [firstName, lastName].filter(Boolean).join(" ") || "Applicant";
    const jobTitle = careerProfile?.currentJobTitle ?? user.currentJobTitle ?? "Professional";
    const yearsExp = careerProfile?.yearsExperience ?? user.yearsExperience ?? null;
    const skills = (careerProfile?.skills ?? user.skills ?? []).filter(Boolean).join(", ");
    const storedCv = careerProfile?.parsedCvText;
    const prompt = [
        `Candidate: ${fullName} | Current role: ${jobTitle} | Experience: ${yearsExp ?? "not specified"} years`,
        `Skills: ${skills || "not specified"}`,
        `Target Job: ${job.title} at ${job.company} (${job.country})`,
        job.description ? `Job Description:\n${job.description.slice(0, 600)}` : "",
        storedCv ? `\nCandidate's actual CV (use for specific role names, employers, and achievements):\n${storedCv.slice(0, 2000)}` : "",
        "",
        "Generate:",
        `1. Three tailored interview answers for this specific role and candidate. Each answer must be 2-3 sentences.`,
        `2. Three to five specific CV customisation suggestions the candidate should make to better match this job.`,
        "",
        'Return JSON: { "tailoredAnswers": [{ "question": "...", "answer": "..." }, ...], "cvSuggestions": ["...", ...] }',
    ].join("\n");
    try {
        const response = await openai_1.openai.chat.completions.create({
            model: "gpt-4o-mini",
            temperature: 0.4,
            max_tokens: 900,
            response_format: { type: "json_object" },
            messages: [
                {
                    role: "system",
                    content: "You are a professional career coach for East African overseas job seekers. Return only valid JSON.",
                },
                { role: "user", content: prompt },
            ],
        });
        if (response.usage) {
            (0, aiStats_1.trackTokenUsage)(response.usage.prompt_tokens, response.usage.completion_tokens).catch(() => { });
        }
        const raw = response.choices[0].message.content ?? "{}";
        const parsed = JSON.parse(raw);
        return {
            tailoredAnswers: Array.isArray(parsed.tailoredAnswers) ? parsed.tailoredAnswers : [],
            cvSuggestions: Array.isArray(parsed.cvSuggestions) ? parsed.cvSuggestions : [],
        };
    }
    catch (err) {
        console.warn("[AppMaterials] generateInterviewPrep failed:", err?.message);
        return { tailoredAnswers: [], cvSuggestions: [] };
    }
}
// ── Main export ───────────────────────────────────────────────────────────────
async function generateApplicationMaterials(user, applicationId, job, packType = "standard") {
    console.log(`[AppMaterials] START | userId=${user.id} | appId=${applicationId} | job="${job.title}" @ ${job.company}`);
    // 1. Mark as processing so the UI shows the spinner immediately
    await storage_1.storage.updateUserJobApplication(applicationId, { status: "preparing" }).catch((err) => {
        console.error("[AppMaterials] Could not set status=preparing:", err?.message);
    });
    // 2. Fetch career profile for richer context
    const [careerProfile] = await db_1.db
        .select()
        .from(schema_1.userCareerProfiles)
        .where((0, drizzle_orm_1.eq)(schema_1.userCareerProfiles.userId, user.id))
        .catch(() => [null]);
    // 3. Generate CV, cover letter, and interview prep in parallel
    const [cv, coverLetter, interviewPrep] = await Promise.all([
        generateJobTailoredCV(user, careerProfile ?? null, job, packType),
        generateCoverLetter(user, careerProfile ?? null, job),
        generateInterviewPrep(user, careerProfile ?? null, job),
    ]);
    console.log(`[AppMaterials] Generated | cv=${cv.length} chars | cl=${coverLetter.length} chars | ` +
        `answers=${interviewPrep.tailoredAnswers.length} | suggestions=${interviewPrep.cvSuggestions.length} | userId=${user.id}`);
    const materials = {
        cv,
        coverLetter,
        tailoredAnswers: interviewPrep.tailoredAnswers,
        cvSuggestions: interviewPrep.cvSuggestions,
        generatedAt: new Date().toISOString(),
    };
    // 4. Persist to preparedMaterials + flip status
    await storage_1.storage.updateUserJobApplication(applicationId, {
        preparedMaterials: materials,
        status: "materials_ready",
        statusMessage: "Your CV and cover letter are ready to download.",
    }).catch((err) => {
        console.error("[AppMaterials] Failed to save materials:", { error: err?.message, applicationId });
        throw err; // re-throw — caller needs to know
    });
    // 5. Push notification to all of the user's browser subscriptions (fire-and-forget)
    sendUserPushNotification(user.id, {
        title: "📄 Your application is ready!",
        body: `CV and cover letter for ${job.title} at ${job.company} are ready to download.`,
        url: "/assisted-apply",
    }).catch((err) => {
        console.error("[AppMaterials] Push notification failed:", err?.message);
    });
    // 6. WebSocket — import dynamically to avoid circular dependency
    Promise.resolve().then(() => __importStar(require("../websocket"))).then(({ notifyApplicationReady }) => {
        notifyApplicationReady(user.id, {
            type: "application_ready",
            applicationId,
            jobTitle: job.title,
            company: job.company,
        });
    }).catch((err) => {
        console.error("[AppMaterials] WS notify failed:", err?.message);
    });
    // 7. In-app notification
    storage_1.storage.createUserNotification({
        userId: user.id,
        type: "success",
        title: "Application Materials Ready",
        message: `Your CV and cover letter for ${job.title} at ${job.company} are ready to download.`,
    }).catch((err) => {
        console.error("[AppMaterials] createUserNotification failed:", err?.message);
    });
    console.log(`[AppMaterials] DONE | appId=${applicationId} | userId=${user.id}`);
    return materials;
}
// ── Push helper: userId-level (looks up all subscriptions for a user) ─────────
async function sendUserPushNotification(userId, payload) {
    const { rows } = await db_1.pool.query(`SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1 AND is_active = true`, [userId]);
    if (rows.length === 0)
        return;
    await Promise.allSettled(rows.map((sub) => (0, push_notifications_1.sendPushNotification)({ endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth }, payload)));
}
