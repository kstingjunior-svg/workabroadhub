// ─────────────────────────────────────────────────────────────────────────────
// Shared types for the six-pass CV pipeline. Every pass reads and returns
// well-typed shapes so misuse is a compile error, not a runtime one.
// ─────────────────────────────────────────────────────────────────────────────

export type ConfidenceLevel = "verbatim" | "quantified_estimate" | "outcome_reframed";

export interface RoleFact {
  title: string;
  employer: string;
  location?: string;
  start: string;              // ISO-8601 month e.g. "2023-05"
  end: string | "present";
  achievements: string[];     // verbatim from source
  tools: string[];
}

export interface EducationFact {
  qualification: string;
  institution: string;
  start?: string;
  end?: string;
  gradeOrNotes?: string;
}

export interface CertFact {
  name: string;
  issuer?: string;
  year?: string;
}

export interface CvFacts {
  // Contact — required minimum to render a CV
  contact: {
    fullName: string;
    email?: string;
    phone?: string;
    location?: string;
    linkedin?: string;
  };
  summarySourceText?: string;   // if user provided a summary in the source
  roles: RoleFact[];
  education: EducationFact[];
  certs: CertFact[];
  skillsMentioned: string[];
  languages?: { name: string; level?: string }[];
  gapsDetected: string[];       // e.g. "no dates on 2019-2021 role", "no quantified outcomes"
}

// ─── Enrichment (Pass 2) ─────────────────────────────────────────────────────
export interface EnrichedAchievement {
  original: string;
  rewrites: { text: string; confidence: ConfidenceLevel }[];
  clarifyingQuestions?: string[];   // "How many customers used the dashboard?"
}

export interface EnrichedFacts extends CvFacts {
  roles: (RoleFact & { enrichedAchievements: EnrichedAchievement[] })[];
}

// ─── Style spec (Pass 3) ─────────────────────────────────────────────────────
export type VoiceProfile =
  | "formal-classic"
  | "punchy-modern"
  | "narrative-driven"
  | "technical-terse"
  | "achievement-first";

export type StructureProfile =
  | "chronological"
  | "hybrid"
  | "skills-forward";

export interface StyleSpec {
  voice: VoiceProfile;
  structure: StructureProfile;
  sectionOrder: string[];                       // permutation of canonical section names
  region: "KE" | "UK" | "CA" | "AU" | "UAE" | "US" | "EU";
  seniorityBand: "entry" | "mid" | "senior" | "lead" | "exec";
  industry: string;                              // free-form, drives banned-phrase set
  bannedPhrases: string[];                       // resolved from industry + globals
  jd?: JdSpec;                                   // present iff a JD was pasted
}

// ─── JD parsing (Pass 3 sidecar) ─────────────────────────────────────────────
export interface JdSpec {
  mustHaveHardSkills: string[];
  niceToHaveHardSkills: string[];
  softSignals: string[];                         // "ownership", "async comms"
  tone: "formal" | "casual" | "technical" | "creative";
  employerArchetype: "startup" | "enterprise" | "gov" | "agency" | "nonprofit" | "unknown";
  seniorityMarkers: string[];                    // "lead a team of 5", "senior IC"
  keywordsForInjection: string[];                // final list Composer must weave in
}

// ─── Score gate (Pass 6) ─────────────────────────────────────────────────────
export interface AtsScore {
  score: number;               // 0-100
  grade: string;
  missingKeywords: string[];
  weaknesses: string[];
}

export interface GenerationResult {
  cvMarkdown: string;
  cvHtml?: string;
  inputScore: AtsScore;
  outputScore: AtsScore;
  improvement: number;         // outputScore.score - inputScore.score
  retries: number;             // how many Composer retries the gate demanded
  styleSpec: StyleSpec;
  facts: CvFacts;
}
