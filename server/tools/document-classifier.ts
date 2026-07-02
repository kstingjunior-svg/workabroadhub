/**
 * Document classifier — pure logic.
 *
 * Given the OCR/text-extracted content of an uploaded document (and
 * optionally a vision-model hint), decides what KIND of document it is:
 *
 *   - "cv"           A CV / résumé
 *   - "job_advert"   A job posting or recruitment advert
 *   - "offer_letter" A job offer letter
 *   - "visa"         A visa or work permit
 *   - "unknown"      None of the above with sufficient confidence
 *
 * The purpose is to STOP users uploading the wrong document to the wrong
 * tool. Each of our four screening tools calls this at the top of its
 * pipeline; if the detected type doesn't match what the tool expects, the
 * endpoint returns a 422 with a friendly redirect to the correct tool
 * instead of running the wrong analysis and producing nonsense findings.
 *
 * Approach:
 *
 *   Four scoring categories run in parallel. Each has its own signal set —
 *   keyword matches, structural regexes, presence of specific fields.
 *   Each match contributes a weight. Highest-scoring category wins IF its
 *   score clears the confidence floor AND is meaningfully ahead of second
 *   place; otherwise → "unknown".
 *
 *   An optional visionHint from the AI vision pass can override or reinforce
 *   the text-based verdict. We trust the vision model when it's confident.
 *
 * Deliberately PURE — no I/O. Endpoints do the OCR + vision and hand the
 * output here for classification. This makes it unit-testable.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export const DOCUMENT_CLASSIFIER_VERSION = 1;

export type DocumentType =
  | "cv"
  | "job_advert"
  | "offer_letter"
  | "visa"
  | "unknown";

export interface ClassificationReason {
  category: DocumentType;
  weight:   number;
  signal:   string;      // Human-readable explanation of what matched
}

export interface DocumentClassification {
  version:    typeof DOCUMENT_CLASSIFIER_VERSION;
  type:       DocumentType;
  confidence: number;    // 0-100 — how sure are we
  scores:     Record<Exclude<DocumentType, "unknown">, number>;
  reasons:    ClassificationReason[];   // Top signals that contributed
}

export interface ClassifyOpts {
  /** OCR'd text of the document (required). */
  text: string;
  /**
   * Optional hint from the AI vision model — if the endpoint already asked
   * gpt-4o vision to classify. When present and confident (≥70), it
   * overrides text scoring.
   */
  visionHint?: {
    type:       DocumentType;
    confidence: number;    // 0-100
  } | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Signal library — regex + weight per category
// ─────────────────────────────────────────────────────────────────────────────

interface Signal {
  regex:  RegExp;
  weight: number;
  label:  string;
}

// CV / résumé signals — sections, contact block, chronological work history.
const CV_SIGNALS: Signal[] = [
  { regex: /\b(?:curriculum\s+vitae|resume|résumé)\b/i,             weight: 40, label: "CV header keyword" },
  { regex: /\bwork\s+experience\b/i,                                weight: 20, label: "'Work Experience' section" },
  { regex: /\bprofessional\s+experience\b/i,                        weight: 20, label: "'Professional Experience' section" },
  { regex: /\beducation\b\s*(?::|$)/im,                             weight: 12, label: "'Education' section header" },
  { regex: /\bskills?\b\s*(?::|$)/im,                               weight: 10, label: "'Skills' section header" },
  { regex: /\bemployment\s+history\b/i,                             weight: 20, label: "'Employment History' section" },
  { regex: /\bcareer\s+(?:objective|summary|profile)\b/i,           weight: 15, label: "Career objective/summary" },
  { regex: /\breferences?\b\s*(?::|available|upon)/i,               weight: 10, label: "'References' section" },
  { regex: /linkedin\.com\/in\/[a-z0-9-]+/i,                        weight: 12, label: "LinkedIn profile URL" },
  // Multiple chronological ranges — CVs commonly list several date ranges
  { regex: /\b(?:19|20)\d{2}\s*[-–]\s*(?:(?:19|20)\d{2}|present)/i, weight: 8, label: "Date range (e.g. 2019 - 2022)" },
  { regex: /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(?:19|20)\d{2}\s*[-–]/i, weight: 6, label: "Month + year range" },
  { regex: /\b(?:bachelor|master|phd|diploma|certificate)\s+(?:of|in|degree)/i, weight: 8, label: "Degree mention" },
  { regex: /\bproficient\s+in\b|\bfluent\s+in\b|\bexpertise\s+in\b/i, weight: 6, label: "Skills phrasing" },
];

// Job advert signals — company promoting a role, "we're hiring", requirements, "apply now".
const JOB_ADVERT_SIGNALS: Signal[] = [
  { regex: /\bwe\s+are\s+(?:hiring|recruiting|looking\s+for)\b/i,   weight: 40, label: "'We are hiring' phrasing" },
  { regex: /\bnow\s+hiring\b/i,                                     weight: 35, label: "'Now hiring' banner" },
  { regex: /\bjoin\s+our\s+team\b/i,                                weight: 25, label: "'Join our team' CTA" },
  { regex: /\bapply\s+(?:now|today|here|via)\b/i,                   weight: 25, label: "'Apply now' CTA" },
  { regex: /\b(?:send|submit)\s+(?:your\s+)?(?:cv|resume|application)\s+(?:to|via)\b/i, weight: 30, label: "'Send your CV to' instruction" },
  { regex: /\b(?:job|position)\s+(?:description|summary|opening|vacancy)\b/i, weight: 18, label: "'Job description' header" },
  { regex: /\bkey\s+responsibilities\b|\bduties\s+and\s+responsibilities\b/i, weight: 22, label: "'Key responsibilities' section" },
  { regex: /\b(?:required|preferred|desired)\s+(?:qualifications|skills|experience)\b/i, weight: 20, label: "Requirements block" },
  { regex: /\bminimum\s+(?:qualifications|requirements|of\s+\d+\s+years)\b/i, weight: 15, label: "Minimum requirements" },
  { regex: /\bapplication\s+deadline\b|\bclosing\s+date\b|\bapplications?\s+close\b/i, weight: 20, label: "Application deadline" },
  { regex: /\bsalary\s+(?:range|from|up\s+to|:\s*(?:USD|KES|EUR|AED)\s*\d+\s*[-–])\b/i, weight: 15, label: "Salary range (not personal amount)" },
  { regex: /\bfull[- ]time\b|\bpart[- ]time\b|\bcontract\b|\bpermanent\b/i, weight: 5, label: "Employment type" },
  { regex: /\bequal\s+opportunity\s+employer\b/i,                   weight: 12, label: "EOE statement" },
];

// Offer letter signals — personal salutation, "pleased to offer", contract terms.
const OFFER_LETTER_SIGNALS: Signal[] = [
  { regex: /\bpleased\s+to\s+(?:offer|inform|extend)\b/i,           weight: 45, label: "'Pleased to offer' phrasing" },
  { regex: /\bletter\s+of\s+offer\b|\boffer\s+letter\b/i,           weight: 35, label: "'Offer letter' header" },
  { regex: /\bwelcome\s+(?:to|aboard)\b/i,                          weight: 22, label: "'Welcome aboard' phrasing" },
  { regex: /\bconditions?\s+of\s+employment\b|\bemployment\s+contract\b/i, weight: 30, label: "Employment terms header" },
  { regex: /\bstart\s+date\s*[:\-]/i,                               weight: 18, label: "Start date field" },
  { regex: /\bcommencement\s+date\b|\bdate\s+of\s+joining\b/i,      weight: 20, label: "Commencement date" },
  { regex: /\bprobation(?:ary)?\s+period\b/i,                       weight: 15, label: "Probation period" },
  { regex: /\bby\s+(?:signing|accepting)\s+this\s+(?:letter|offer)\b/i, weight: 25, label: "'By signing this letter'" },
  { regex: /\byour\s+(?:annual|monthly|base)\s+salary\s+(?:will\s+be|shall\s+be)\b/i, weight: 30, label: "Personal salary declaration" },
  { regex: /\bhereby\s+offered?\b/i,                                weight: 22, label: "'Hereby offered' formal phrasing" },
  { regex: /\bacceptance\s+(?:of\s+)?this\s+offer\b/i,              weight: 15, label: "Offer acceptance clause" },
  { regex: /\breport(?:ing)?\s+to\b\s+[A-Z][a-z]+/i,                weight: 8, label: "Reporting-to clause" },
  { regex: /\bbenefits?\s+package\b|\bmedical\s+insurance\b/i,      weight: 8, label: "Benefits mention" },
];

// Visa / permit signals — MRZ, government issuers, dates, ID numbers.
const VISA_SIGNALS: Signal[] = [
  { regex: /\bvisa\s+(?:number|no|type|category|class)\b/i,         weight: 40, label: "Visa field header" },
  { regex: /\bwork\s+permit\b/i,                                    weight: 30, label: "'Work permit' phrasing" },
  { regex: /\bresidence\s+permit\b/i,                               weight: 30, label: "'Residence permit' phrasing" },
  { regex: /\bemployment\s+authorization\b/i,                       weight: 22, label: "'Employment authorization' text" },
  { regex: /\biqama\b|\bemirates\s+id\b|\bqid\b/i,                  weight: 40, label: "Gulf-region permit ID (Iqama / Emirates ID / QID)" },
  { regex: /\bmachine[- ]readable\s+zone\b|\bmrz\b/i,               weight: 25, label: "MRZ mention" },
  // MRZ line pattern (V or P + 44 chars of A-Z0-9<)
  { regex: /^[VP]<[A-Z]{3}[A-Z0-9<]{35,}$/m,                        weight: 45, label: "MRZ line detected" },
  { regex: /\bissuing\s+(?:state|country|authority)\b/i,            weight: 18, label: "'Issuing state/authority'" },
  { regex: /\b(?:issue|expiry|valid\s+until|valid\s+from|date\s+of\s+expiry)\s+date\b/i, weight: 15, label: "Issue / expiry date fields" },
  { regex: /\bpassport\s+(?:number|no)\b/i,                         weight: 15, label: "Passport number field" },
  { regex: /\bnational(?:ity|\s+id)\b\s*[:\-]/i,                    weight: 12, label: "Nationality / national ID field" },
  { regex: /\bcertificate\s+of\s+sponsorship\b|\bcos\b(?!\w)/i,     weight: 25, label: "Certificate of Sponsorship reference" },
  { regex: /\bstamp(?:ed)?\s+by\b|\bconsulate\b|\bembassy\b/i,      weight: 15, label: "Consulate / embassy / stamp mention" },
  { regex: /\bcategory\s+of\s+visa\b|\bpurpose\s+of\s+entry\b/i,    weight: 15, label: "Visa category / purpose" },
];

// ─────────────────────────────────────────────────────────────────────────────
// classifyDocument — the main entry point
// ─────────────────────────────────────────────────────────────────────────────

const CONFIDENCE_FLOOR   = 25;   // Minimum score for a category to be considered
const LEADER_MARGIN      = 15;   // Winner must beat runner-up by this margin
const VISION_TRUST_FLOOR = 70;   // Vision override kicks in above this confidence

export function classifyDocument(opts: ClassifyOpts): DocumentClassification {
  const text = opts.text ?? "";

  // Run all four signal categories in parallel.
  const cvHits          = scoreCategory("cv",           text, CV_SIGNALS);
  const jobAdvertHits   = scoreCategory("job_advert",   text, JOB_ADVERT_SIGNALS);
  const offerLetterHits = scoreCategory("offer_letter", text, OFFER_LETTER_SIGNALS);
  const visaHits        = scoreCategory("visa",         text, VISA_SIGNALS);

  const scores = {
    cv:           cvHits.total,
    job_advert:   jobAdvertHits.total,
    offer_letter: offerLetterHits.total,
    visa:         visaHits.total,
  };

  // If vision is confident, trust it — but only when its choice actually
  // has *some* textual support (so we don't get fooled by hallucinations).
  if (opts.visionHint &&
      opts.visionHint.confidence >= VISION_TRUST_FLOOR &&
      opts.visionHint.type !== "unknown" &&
      (scores as any)[opts.visionHint.type] > 0) {
    return {
      version:    DOCUMENT_CLASSIFIER_VERSION,
      type:       opts.visionHint.type,
      confidence: opts.visionHint.confidence,
      scores,
      reasons:    [
        {
          category: opts.visionHint.type,
          weight:   opts.visionHint.confidence,
          signal:   `AI vision confidently identified this as a ${humanType(opts.visionHint.type)}`,
        },
        ...topReasons(cvHits, jobAdvertHits, offerLetterHits, visaHits),
      ],
    };
  }

  // Text-based verdict — pick the leader if it clears the floor + margin.
  const ranked = ([
    { type: "cv" as const,           score: scores.cv,           hits: cvHits },
    { type: "job_advert" as const,   score: scores.job_advert,   hits: jobAdvertHits },
    { type: "offer_letter" as const, score: scores.offer_letter, hits: offerLetterHits },
    { type: "visa" as const,         score: scores.visa,         hits: visaHits },
  ]).sort((a, b) => b.score - a.score);

  const winner    = ranked[0];
  const runnerUp  = ranked[1];

  const meetsFloor  = winner.score >= CONFIDENCE_FLOOR;
  const meetsMargin = (winner.score - runnerUp.score) >= LEADER_MARGIN;

  if (!meetsFloor || !meetsMargin) {
    return {
      version:    DOCUMENT_CLASSIFIER_VERSION,
      type:       "unknown",
      confidence: Math.min(50, Math.round(winner.score)),
      scores,
      reasons:    topReasons(cvHits, jobAdvertHits, offerLetterHits, visaHits),
    };
  }

  // Confidence: raw score capped at 100; slightly boosted for large margins.
  const confidence = Math.min(100, Math.round(winner.score * 0.9 + (winner.score - runnerUp.score) * 0.3));

  return {
    version:    DOCUMENT_CLASSIFIER_VERSION,
    type:       winner.type,
    confidence,
    scores,
    reasons:    winner.hits.matched.slice(0, 5).map((s) => ({
      category: winner.type,
      weight:   s.weight,
      signal:   s.label,
    })),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Category scoring
// ─────────────────────────────────────────────────────────────────────────────

interface CategoryHits {
  total:   number;
  matched: Signal[];
}

function scoreCategory(_type: DocumentType, text: string, signals: Signal[]): CategoryHits {
  let total = 0;
  const matched: Signal[] = [];
  for (const s of signals) {
    if (s.regex.test(text)) {
      total += s.weight;
      matched.push(s);
    }
  }
  return { total, matched };
}

function topReasons(...hitsArr: CategoryHits[]): ClassificationReason[] {
  const all: { category: DocumentType; weight: number; label: string }[] = [];
  for (const hits of hitsArr) {
    for (const s of hits.matched) {
      all.push({
        category: inferCategoryFromSignal(hits, s),
        weight:   s.weight,
        label:    s.label,
      });
    }
  }
  return all
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 5)
    .map((r) => ({ category: r.category, weight: r.weight, signal: r.label }));
}

// Because CategoryHits doesn't remember its own category, we reverse-infer
// from the shared library. Cheap: signals arrays are ~15 items each.
function inferCategoryFromSignal(hits: CategoryHits, s: Signal): DocumentType {
  if (CV_SIGNALS.includes(s))           return "cv";
  if (JOB_ADVERT_SIGNALS.includes(s))   return "job_advert";
  if (OFFER_LETTER_SIGNALS.includes(s)) return "offer_letter";
  if (VISA_SIGNALS.includes(s))         return "visa";
  return "unknown";
}

// ─────────────────────────────────────────────────────────────────────────────
// Public convenience — checks if a document matches an expected type
// ─────────────────────────────────────────────────────────────────────────────

export interface WrongDocumentPayload {
  wrongDocumentType: true;
  detected:          DocumentType;
  expected:          DocumentType;
  confidence:        number;
  message:           string;
  suggestedTool: {
    path:  string;
    label: string;
  };
  reasons: ClassificationReason[];
}

const TOOL_FOR_TYPE: Record<Exclude<DocumentType, "unknown">, { path: string; label: string }> = {
  cv:           { path: "/tools/ats-cv-checker", label: "ATS CV Checker" },
  job_advert:   { path: "/tools/job-scam-checker", label: "Job Scam Checker" },
  offer_letter: { path: "/tools/offer-check",    label: "Offer Letter Screener" },
  visa:         { path: "/tools/visa-check",     label: "Visa Screening" },
};

/**
 * If the classification is `unknown` OR doesn't match the expected type,
 * returns a WrongDocumentPayload the endpoint can send as JSON (status 422).
 * If the type is correct, returns null.
 *
 * When detected=unknown, we still return a helpful message ("we couldn't
 * confidently identify this document"), but no suggestedTool since we don't
 * know where to send them.
 */
export function checkDocumentType(
  classification: DocumentClassification,
  expected:       Exclude<DocumentType, "unknown">,
): WrongDocumentPayload | null {
  if (classification.type === expected) return null;

  const detected = classification.type;
  const detectedHuman = humanType(detected);
  const expectedHuman = humanType(expected);
  const expectedTool  = TOOL_FOR_TYPE[expected];

  if (detected === "unknown") {
    return {
      wrongDocumentType: true,
      detected,
      expected,
      confidence: classification.confidence,
      message: `We couldn't confidently identify this document as a ${expectedHuman}. If it IS a ${expectedHuman}, try a clearer photo or a text-based PDF. If it's a different kind of document, use the tool built for that type.`,
      suggestedTool: expectedTool,
      reasons: classification.reasons,
    };
  }

  const suggested = TOOL_FOR_TYPE[detected];
  return {
    wrongDocumentType: true,
    detected,
    expected,
    confidence: classification.confidence,
    message: `This looks like a ${detectedHuman}, not a ${expectedHuman}. Please use the ${suggested.label} instead.`,
    suggestedTool: suggested,
    reasons: classification.reasons,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

export function humanType(t: DocumentType): string {
  switch (t) {
    case "cv":           return "CV / résumé";
    case "job_advert":   return "job advert";
    case "offer_letter": return "job offer letter";
    case "visa":         return "visa / work permit";
    default:             return "document";
  }
}
