/**
 * VerifyX evidence contract — the core "no evidence, no factual claim" guard.
 *
 * Every statement VerifyX shows a user is a Finding. Findings are produced by
 * deterministic checks, registry lookups, or (capped) AI observations, and
 * then pass through validateFindings(), which downgrades or rejects anything
 * whose status is not backed by the evidence attached to it.
 *
 * PURE — no I/O. Unit-tested in tests/api/verifyx-evidence.test.ts.
 */

export const VERIFYX_ENGINE_VERSION = "verifyx-1.0.0";

/** Six user-facing statuses (directive §10). Ordered most → least severe for sorting. */
export type EvidenceStatus =
  | "confirmed_discrepancy"
  | "manual_review_required"
  | "potential_risk_indicator"
  | "unable_to_verify"
  | "consistent_with_requirements"
  | "officially_confirmed";

export const STATUS_RANK: Record<EvidenceStatus, number> = {
  confirmed_discrepancy:        0,
  manual_review_required:       1,
  potential_risk_indicator:     2,
  unable_to_verify:             3,
  consistent_with_requirements: 4,
  officially_confirmed:         5,
};

export const STATUS_LABEL: Record<EvidenceStatus, string> = {
  officially_confirmed:         "Officially confirmed",
  consistent_with_requirements: "Consistent with official requirements",
  confirmed_discrepancy:        "Confirmed discrepancy",
  potential_risk_indicator:     "Potential risk indicator",
  unable_to_verify:             "Unable to verify",
  manual_review_required:       "Manual review required",
};

export type VerificationMethod =
  | "deterministic"     // reproducible computation over document fields
  | "registry_lookup"   // lookup against a synced official dataset
  | "crypto"            // digital-signature validation
  | "ai_observation"    // something a model *saw* — never proof
  | "text_pattern"      // phrase present in the document text
  | "human_review";     // WorkAbroadHub reviewer (NOT a government confirmation)

export type Priority = "high" | "medium" | "low";

export interface DocumentRef {
  field: string;
  value: string | null;
  /** 0-100 confidence the value was read correctly. null = unknown. */
  ocrConfidence: number | null;
  /** True when the user confirmed / corrected this value themselves. */
  userConfirmed?: boolean;
}

export interface EvidenceSource {
  sourceId: string;
  authority: string;
  url: string;
  /** ISO timestamp the source content was retrieved / last synced. */
  retrievedAt: string | null;
  ruleId?: string;
  ruleVersion?: number;
  effectiveFrom?: string | null;
}

export interface Finding {
  id: string;                 // stable per report, e.g. "F03"
  code: string;               // machine key, e.g. "mrz_check_digit_failed"
  status: EvidenceStatus;
  priority: Priority;
  title: string;              // short label
  examined: string;           // 1. what was examined
  documentSays?: string;      // 2. what the document claims
  evidenceSays?: string;      // 3. what the authoritative evidence establishes
  whyItMatters?: string;      // 4. why it matters
  // 5. confirmed vs suspected is the status itself
  howToVerify?: string;       // 6. how the user can verify independently
  howToVerifyUrl?: string;
  checkedAt: string;          // 7. when it was checked
  documentRefs?: DocumentRef[];
  source?: EvidenceSource;
  method: VerificationMethod;
  check: { name: string; version: number; result?: unknown };
  uncertainty?: string;
  /** Set by the validator when it changed the status. */
  downgradedFrom?: EvidenceStatus;
  downgradeReason?: string;
}

/** Minimum OCR confidence for a field-derived contradiction to be "confirmed". */
export const OCR_CONFIRM_THRESHOLD = 85;

/**
 * Affirmative authenticity / fraud language that must never reach a user
 * unless the status is officially_confirmed (and even then we avoid it).
 * Negated or explanatory uses ("this is not proof of forgery") are allowed.
 */
const BANNED_CLAIMS: RegExp[] = [
  /\b(is|are|looks|appears|seems)\s+(?:to\s+be\s+)?(genuine|authentic|legitimate|real|fake|forged|fraudulent|counterfeit)\b/i,
  /\bconsistent with (a |an )?(genuine|authentic|legitimate)\b/i,
  /\b(likely|probably|very likely|almost certainly|definitely)\s+(a\s+)?(fake|forged|forgery|fraud|fraudulent|scam|genuine|authentic)\b/i,
  /\btreat (this |it )?as (likely )?fraudulent\b/i,
  /\bverified (by|with|through) (the )?(government|ukvi|home office|ircc|uscis|immigration|ministry|mohre|icp)\b/i,
  /\b\d{1,3}(\.\d+)?\s*%\s*(authentic|genuine|legit|real)\b/i,
  /\bstrong forgery indicator\b/i,
];

const NEGATION = /\b(not|cannot|can't|never|no|isn't|doesn't|unable|without|nor)\b|n't\b/i;

export function containsBannedClaim(text: string | undefined | null): boolean {
  if (!text) return false;
  for (const rx of BANNED_CLAIMS) {
    const g = new RegExp(rx.source, rx.flags.includes("g") ? rx.flags : rx.flags + "g");
    let m: RegExpExecArray | null;
    while ((m = g.exec(text))) {
      // Allow explicitly negated statements in the same sentence/clause
      // ("this is not a confirmation that the document is authentic").
      const before = text.slice(0, m.index);
      const clauseStart = Math.max(before.lastIndexOf("."), before.lastIndexOf("!"), before.lastIndexOf("?"), before.lastIndexOf(";"), before.lastIndexOf("\n"));
      const clause = before.slice(clauseStart + 1).slice(-60);
      if (!NEGATION.test(clause)) return true;
    }
  }
  return false;
}

function userText(f: Finding): string {
  return [f.title, f.examined, f.documentSays, f.evidenceSays, f.whyItMatters, f.howToVerify, f.uncertainty]
    .filter(Boolean)
    .join(" \n ");
}

export interface ValidationOutcome {
  accepted: Finding[];
  rejected: Array<{ finding: Finding; reason: string }>;
}

function downgrade(f: Finding, to: EvidenceStatus, reason: string): Finding {
  if (STATUS_RANK[to] === STATUS_RANK[f.status]) return f;
  return {
    ...f,
    status: to,
    downgradedFrom: f.downgradedFrom ?? f.status,
    downgradeReason: f.downgradeReason ? `${f.downgradeReason}; ${reason}` : reason,
    uncertainty: [f.uncertainty, reason].filter(Boolean).join(" "),
  };
}

/**
 * Enforce the evidence rules. Returns accepted findings (possibly downgraded)
 * and rejected ones (never shown to users; logged for review).
 */
export function validateFindings(findings: Finding[]): ValidationOutcome {
  const accepted: Finding[] = [];
  const rejected: ValidationOutcome["rejected"] = [];

  for (const original of findings) {
    let f = { ...original };

    // Rule 0 — banned authenticity/fraud language anywhere in user text.
    if (containsBannedClaim(userText(f))) {
      rejected.push({ finding: f, reason: "contains an unsupported authenticity or fraud assertion" });
      continue;
    }

    // Rule 1 — "officially confirmed" needs an authorised channel we actually
    // queried (registry lookup or cryptographic validation) with a live source.
    if (f.status === "officially_confirmed") {
      const ok = (f.method === "registry_lookup" || f.method === "crypto") && !!f.source?.url && !!f.source?.retrievedAt;
      if (!ok) f = downgrade(f, "unable_to_verify", "No authorised verification channel confirmed this.");
    }

    // Rule 2 — AI observations can never be more than a risk indicator, and
    // can never "confirm" anything positive.
    if (f.method === "ai_observation") {
      if (f.status === "confirmed_discrepancy") {
        f = downgrade(f, "potential_risk_indicator", "Based on a visual observation, which is not proof.");
      } else if (f.status === "consistent_with_requirements" || f.status === "officially_confirmed") {
        f = downgrade(f, "unable_to_verify", "A visual impression cannot establish compliance or authenticity.");
      }
    }

    // Rule 3 — a confirmed discrepancy must be reproducible (deterministic /
    // registry / crypto) and every field it relies on must be reliably read
    // or confirmed by the user.
    if (f.status === "confirmed_discrepancy") {
      if (!(f.method === "deterministic" || f.method === "registry_lookup" || f.method === "crypto")) {
        f = downgrade(f, "potential_risk_indicator", "This check is not reproducible enough to count as confirmed.");
      } else {
        const weak = (f.documentRefs ?? []).filter(
          (r) => !r.userConfirmed && (r.ocrConfidence === null || r.ocrConfidence < OCR_CONFIRM_THRESHOLD),
        );
        if (weak.length > 0) {
          f = downgrade(
            f,
            "potential_risk_indicator",
            `This may be a reading error: we could not read ${weak.map((w) => w.field).join(", ")} with high confidence. Confirm the value(s) to re-check.`,
          );
        }
      }
    }

    // Rule 4 — findings that cite a rule must carry a source and version.
    //          Unreviewed rules (no ruleVersion) can only raise indicators.
    if (f.source?.ruleId && (!f.source.url || f.source.ruleVersion == null)) {
      if (f.status === "confirmed_discrepancy") {
        f = downgrade(f, "potential_risk_indicator", "The rule this check relies on has not yet been reviewed against its official source.");
      } else if (f.status === "consistent_with_requirements" || f.status === "officially_confirmed") {
        f = downgrade(f, "unable_to_verify", "The rule this check relies on has not yet been reviewed against its official source.");
      }
    }

    // Rule 5 — registry-based positive results must carry the source + date.
    if (f.method === "registry_lookup" && f.status === "consistent_with_requirements" && (!f.source?.url || !f.source?.retrievedAt)) {
      f = downgrade(f, "unable_to_verify", "Registry data date is unknown.");
    }

    accepted.push(f);
  }

  accepted.sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || prioRank(a.priority) - prioRank(b.priority));
  accepted.forEach((f, i) => { f.id = `F${String(i + 1).padStart(2, "0")}`; });
  return { accepted, rejected };
}

function prioRank(p: Priority): number {
  return p === "high" ? 0 : p === "medium" ? 1 : 2;
}

export type OverallOutcome = "discrepancies_found" | "needs_attention" | "no_discrepancies_found" | "insufficient_information";

export interface ReportSummary {
  outcome: OverallOutcome;
  headline: string;
  explanation: string;
  counts: Record<EvidenceStatus, number>;
  /** Always shown — the directive's mandatory limitation statement. */
  limitation: string;
}

export const AUTHENTICITY_LIMITATION =
  "Document authenticity could not be independently confirmed through an authorized issuing-authority verification service.";

export function summarizeFindings(findings: Finding[], opts: { docLabel: string; officialCheckAvailable: boolean }): ReportSummary {
  const counts = {
    officially_confirmed: 0, consistent_with_requirements: 0, confirmed_discrepancy: 0,
    potential_risk_indicator: 0, unable_to_verify: 0, manual_review_required: 0,
  } as Record<EvidenceStatus, number>;
  for (const f of findings) counts[f.status]++;

  const officialHint = opts.officialCheckAvailable
    ? "Use the official check listed below to confirm the status with the issuing authority."
    : "The issuing authority does not offer a public verification service we can use, so contact them directly using the official details below.";

  const anyOfficial = counts.officially_confirmed > 0;
  const limitation = anyOfficial
    ? "Only the items marked “Officially confirmed” were confirmed through an authorised source. Everything else is a consistency check, not proof of authenticity."
    : AUTHENTICITY_LIMITATION;

  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

  if (counts.confirmed_discrepancy > 0) {
    return {
      outcome: "discrepancies_found",
      headline: `${plural(counts.confirmed_discrepancy, "confirmed discrepancy", "confirmed discrepancies")} found in this ${opts.docLabel}.`,
      explanation:
        `We found information in this ${opts.docLabel} that contradicts itself or an official record. ` +
        "A discrepancy is not by itself proof that the document is false, but it must be explained and resolved with the issuing authority before you pay money, resign, or travel. " +
        officialHint,
      counts, limitation,
    };
  }
  const attention = counts.potential_risk_indicator + counts.manual_review_required;
  if (attention > 0) {
    return {
      outcome: "needs_attention",
      headline: `${plural(attention, "item needs", "items need")} checking before you rely on this ${opts.docLabel}.`,
      explanation:
        "We did not confirm any contradiction, but we found points that need checking. Each one below explains why and how to check it yourself. " +
        officialHint,
      counts, limitation,
    };
  }
  const checked = counts.consistent_with_requirements + counts.officially_confirmed;
  if (checked === 0) {
    return {
      outcome: "insufficient_information",
      headline: `We could not check enough of this ${opts.docLabel} to report on it.`,
      explanation: "Too little could be read or matched against official sources. Try a sharper, complete photo or the original PDF. " + officialHint,
      counts, limitation,
    };
  }
  return {
    outcome: "no_discrepancies_found",
    headline: `No discrepancies found in the checks we were able to run.`,
    explanation:
      `The details we could check are consistent with each other and with the official requirements we have on record. This is not a confirmation that the ${opts.docLabel} is authentic. ` +
      officialHint,
    counts, limitation,
  };
}

/** Fill per-field OCR confidence and user confirmation into findings' document refs. */
export function attachFieldConfidence(
  findings: Finding[],
  confidence: Record<string, number | null | undefined>,
  userConfirmed: Set<string>,
): Finding[] {
  return findings.map((f) => ({
    ...f,
    documentRefs: f.documentRefs?.map((r) => ({
      ...r,
      ocrConfidence: r.ocrConfidence ?? (confidence[r.field] ?? null),
      userConfirmed: r.userConfirmed || userConfirmed.has(r.field),
    })),
  }));
}

/** Helper to build findings with fewer keystrokes. */
export function makeFinding(p: Omit<Finding, "id" | "checkedAt"> & { checkedAt?: string }): Finding {
  return { ...p, id: "", checkedAt: p.checkedAt ?? new Date().toISOString() } as Finding;
}
