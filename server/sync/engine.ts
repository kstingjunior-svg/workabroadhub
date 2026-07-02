/**
 * Sync Engine — foundation pipeline (Milestone 1).
 *
 * Pure orchestration: takes a SyncProvider, streams its records through
 * Raw Import → Normalize → Validate → Fingerprint, and returns a
 * structured FoundationRunResult. No DB writes, no Diff, no Apply,
 * no Snapshot — those arrive in later milestones (M2, M3).
 *
 * The pipeline is deterministic by design: given the same provider output
 * and the same FINGERPRINT_VERSION + NORMALIZER_VERSION, it always
 * produces the same result.
 */

import crypto from "node:crypto";
import { FINGERPRINT_VERSION, fingerprint as computeFingerprint } from "./fingerprint";
import { NORMALIZER_VERSION } from "./normalize";
import { validate as baseValidate } from "./validation";
import type {
  FetchOpts,
  FoundationRunResult,
  NormalizedAgency,
  ProviderRecord,
  QuarantinedRecord,
  SyncProvider,
  ValidatedRecord,
  ValidationIssue,
} from "./types";

export interface RunFoundationOpts extends FetchOpts {
  correlationId?: string;
}

/**
 * Run the foundation pipeline against a provider.
 */
export async function runFoundation(
  provider: SyncProvider,
  opts: RunFoundationOpts = {},
): Promise<FoundationRunResult> {
  const correlationId = opts.correlationId ?? crypto.randomUUID();
  const runStart      = performance.now();

  let fetched     = 0;
  let fetchMs     = 0;
  let rawImportMs = 0;
  let normalizeMs = 0;
  let validateMs  = 0;
  let fingerprintMs = 0;

  const validated:   ValidatedRecord[]    = [];
  const quarantined: QuarantinedRecord[]  = [];
  const fingerprintsByLicense = new Map<string, string>();

  const pages = provider.fetchRecords({ limit: opts.limit, signal: opts.signal });

  for await (const page of pages) {
    if (opts.signal?.aborted) {
      throw new Error(`[sync-engine] aborted (correlationId=${correlationId})`);
    }

    fetched += page.length;
    const pageStart = performance.now();

    for (const raw of page) {
      const result = processOne(raw, provider);
      if (result.ok) {
        validated.push(result.validated);
        fingerprintsByLicense.set(
          result.validated.agency.licenseNumber,
          result.validated.fingerprint,
        );
      } else {
        quarantined.push(result.quarantined);
      }
      rawImportMs   += result.timings.rawImport;
      normalizeMs   += result.timings.normalize;
      validateMs    += result.timings.validate;
      fingerprintMs += result.timings.fingerprint;
    }

    fetchMs += performance.now() - pageStart - (
      rawImportMs + validateMs + normalizeMs + fingerprintMs
    );
  }

  const durationMs = Math.round(performance.now() - runStart);

  return {
    correlationId,
    providerSlug: provider.slug,
    fetched,
    validated,
    quarantined,
    fingerprintsByLicense,
    durationMs,
    stageDurations: {
      rawImport:   Math.round(rawImportMs),
      fetch:       Math.max(0, Math.round(fetchMs)),
      normalize:   Math.round(normalizeMs),
      validate:    Math.round(validateMs),
      fingerprint: Math.round(fingerprintMs),
    },
    normalizerVersion:  NORMALIZER_VERSION,
    fingerprintVersion: FINGERPRINT_VERSION,
  };
}

type PerRecordTimings = { rawImport: number; normalize: number; validate: number; fingerprint: number };

type ProcessResult =
  | { ok: true;  validated: ValidatedRecord;    timings: PerRecordTimings }
  | { ok: false; quarantined: QuarantinedRecord; timings: PerRecordTimings };

function processOne(raw: ProviderRecord, provider: SyncProvider): ProcessResult {
  const timings: PerRecordTimings = { rawImport: 0, normalize: 0, validate: 0, fingerprint: 0 };

  // ── Raw Import (ADR-0002 / Improvement 1) ────────────────────────────────
  // Deep-clone the raw payload before anything else touches it.
  const rawStart = performance.now();
  const rawSnapshot = structuredClone(raw);
  timings.rawImport = performance.now() - rawStart;

  // ── Normalize ─────────────────────────────────────────────────────────────
  const normStart = performance.now();
  let normalized: NormalizedAgency;
  try {
    normalized = provider.normalize(rawSnapshot);
  } catch (err: any) {
    timings.normalize = performance.now() - normStart;
    return {
      ok: false,
      quarantined: {
        raw: rawSnapshot,
        partial: null,
        reasons: [{
          path:    "(normalize)",
          code:    "invalid_format",
          message: `Adapter normalize() threw: ${err?.message ?? String(err)}`,
        }],
        normalizerVersion: null,
      },
      timings,
    };
  }
  timings.normalize = performance.now() - normStart;

  // ── Validate (provider-specific tightening, then base schema) ─────────────
  const validateStart = performance.now();

  if (provider.validate) {
    const providerCheck = provider.validate(normalized);
    if (!providerCheck.ok) {
      timings.validate = performance.now() - validateStart;
      return {
        ok: false,
        quarantined: {
          raw: rawSnapshot, partial: normalized, reasons: providerCheck.reasons,
          normalizerVersion: NORMALIZER_VERSION,
        },
        timings,
      };
    }
  }

  const baseCheck = baseValidate(normalized);
  timings.validate = performance.now() - validateStart;

  if (!baseCheck.ok) {
    return {
      ok: false,
      quarantined: {
        raw: rawSnapshot, partial: normalized, reasons: dedupeReasons(baseCheck.reasons),
        normalizerVersion: NORMALIZER_VERSION,
      },
      timings,
    };
  }

  // ── Fingerprint ──────────────────────────────────────────────────────────
  const fpStart = performance.now();
  const fp = computeFingerprint(baseCheck.value);
  timings.fingerprint = performance.now() - fpStart;

  return {
    ok: true,
    validated: {
      raw:               rawSnapshot,
      agency:            baseCheck.value,
      fingerprint:       fp,
      normalizerVersion: NORMALIZER_VERSION,
    },
    timings,
  };
}

function dedupeReasons(reasons: ValidationIssue[]): ValidationIssue[] {
  const seen = new Set<string>();
  const out: ValidationIssue[] = [];
  for (const r of reasons) {
    const key = `${r.path}::${r.code}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}
