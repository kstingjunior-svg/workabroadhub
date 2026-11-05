/** Common VerifyX report shape + assembly. */
import type { CountryVisaResources } from "../visa-verify/countries";
import {
  VERIFYX_ENGINE_VERSION, summarizeFindings, validateFindings,
  type EvidenceStatus, type Finding, type OverallOutcome,
} from "./evidence";
import { officialStatusCheck, getSource, type OfficialCheck } from "./sources";

export interface ExtractedFieldView {
  field: string;
  label: string;
  value: string | null;
  confidence: number | null;
  userCorrected: boolean;
  correctable: boolean;
}

export interface VerifyXReport {
  ok: true;
  engine: "verifyx";
  engineVersion: string;
  tool: "visa_check" | "offer_check";
  requestId?: string;
  referenceNo?: string;
  revision: number;
  checkedAt: string;
  outcome: OverallOutcome;
  headline: string;
  explanation: string;
  limitation: string;
  counts: Record<EvidenceStatus, number>;
  findings: Finding[];
  extractedFields: ExtractedFieldView[];
  documentKind: string | null;
  country: {
    code: string; name: string; flag: string;
    links: CountryVisaResources["links"];
    contacts: CountryVisaResources["contacts"];
    generalGuidance: string;
    guidanceLastReviewed: string;
  } | null;
  officialCheck: OfficialCheck;
  sourcesUsed: Array<{ id: string; title: string; authority: string; url: string; retrievedAt: string | null }>;
  generalScamAwareness: string[];
  disclaimer: string;
  /** Internal only — stripped before sending to the client. */
  _rejected?: Array<{ code: string; reason: string }>;
}

export const DISCLAIMER =
  "VerifyX checks what can be checked from the document and from official sources we can access. It does not have access to government immigration databases, and it cannot confirm that a document is authentic. " +
  "“Officially confirmed” appears only when an authorised source confirmed a specific fact.";

export function assembleReport(args: {
  tool: VerifyXReport["tool"];
  docLabel: string;
  rawFindings: Finding[];
  extractedFields: ExtractedFieldView[];
  documentKind: string | null;
  country: CountryVisaResources | null;
  revision?: number;
  now?: Date;
}): VerifyXReport {
  const { accepted, rejected } = validateFindings(args.rawFindings);
  const official = officialStatusCheck(
    args.country?.code ?? null,
    args.country?.links.visaStatusChecker ?? args.country?.links.immigration ?? null,
    args.country?.name,
  );
  const summary = summarizeFindings(accepted, { docLabel: args.docLabel, officialCheckAvailable: !!official.url });

  const seen = new Map<string, VerifyXReport["sourcesUsed"][number]>();
  for (const f of accepted) {
    if (!f.source?.sourceId || seen.has(f.source.sourceId)) continue;
    const s = getSource(f.source.sourceId);
    seen.set(f.source.sourceId, {
      id: f.source.sourceId, title: s?.title ?? f.source.sourceId, authority: f.source.authority,
      url: f.source.url, retrievedAt: f.source.retrievedAt,
    });
  }

  return {
    ok: true,
    engine: "verifyx",
    engineVersion: VERIFYX_ENGINE_VERSION,
    tool: args.tool,
    revision: args.revision ?? 1,
    checkedAt: (args.now ?? new Date()).toISOString(),
    outcome: summary.outcome,
    headline: summary.headline,
    explanation: summary.explanation,
    limitation: summary.limitation,
    counts: summary.counts,
    findings: accepted,
    extractedFields: args.extractedFields,
    documentKind: args.documentKind,
    country: args.country ? {
      code: args.country.code, name: args.country.name, flag: args.country.flag,
      links: args.country.links, contacts: args.country.contacts,
      generalGuidance: args.country.nextStepAdvice,
      guidanceLastReviewed: "2026-07",
    } : null,
    officialCheck: official,
    sourcesUsed: [...seen.values()],
    generalScamAwareness: (args.country?.knownScamPatterns ?? []).slice(0, 6),
    disclaimer: DISCLAIMER,
    _rejected: rejected.map((r) => ({ code: r.finding.code, reason: r.reason })),
  };
}

/** Strip internal fields before returning to a client. */
export function publicReport(r: VerifyXReport): Omit<VerifyXReport, "_rejected"> {
  const { _rejected, ...rest } = r;
  return rest;
}
