/**
 * NEA-KE provider adapter (Milestone 1).
 *
 * Implements SyncProvider for the Kenya National Employment Authority.
 *
 * Source-of-data evolution:
 *   • M1 (this version): static replay of the 581-record dataset Tony
 *     pasted from the NEA portal. No network calls. Lets us validate the
 *     engine end-to-end without touching nea.go.ke.
 *   • Later milestone: HTML scrape of https://nea.go.ke/list (or whatever
 *     the public CSV becomes). The adapter contract doesn't change; only
 *     fetchRecords() switches from `yield NEA_KE_RECORDS` to a real fetch.
 *
 * Source-specific tightening (above and beyond the base Zod schema):
 *   • Licence numbers must match one of the NEA-recognised prefixes.
 *     This catches OCR/typo corruption in the raw data before it reaches
 *     the diff stage.
 */

import {
  collapseWhitespace,
  normalizeAgencyName,
  normalizeDate,
  normalizeEmail,
  normalizeLicenseNumber,
  normalizePhoneNumber,
  normalizeServiceType,
  normalizeStatusSource,
  normalizeWebsite,
} from "../normalize";
import type {
  FetchOpts,
  NormalizedAgency,
  ProviderHealth,
  ProviderMetadata,
  ProviderRecord,
  SyncProvider,
  ValidationResult,
} from "../types";
import { NEA_KE_RECORDS } from "./data/nea-ke-records";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const SLUG          = "nea-ke";
const DISPLAY_NAME  = "Kenya National Employment Authority";
const COUNTRY       = "KE";
const UPSTREAM_URL  = "https://nea.go.ke/list";
const ADAPTER_VER   = "v1.0.0";
const PAGE_SIZE     = 100;

/**
 * Licence-number prefix allowlist for NEA-KE.
 *
 * Observed across the 581-row dataset:
 *   • PVT-…       (most agencies)
 *   • PVT/2016/…  (older "private trade" registrations)
 *   • CPR/…       (Companies Registry numbers)
 *   • REF/NEA/…   (referenced licences)
 *   • C.… / C…    (company numbers, e.g. C.155330)
 *   • CR-…        (newer Companies Registry format)
 *   • CRP/…       (alternate Companies Registry format)
 *   • Pure numeric (a handful — "284", "262", "076", "142", "352")
 *   • Date-shaped "20/5/2021" (one anomaly — kept; flagged in tests)
 *
 * Strings outside these patterns are rejected as suspect and quarantined.
 */
const NEA_LICENCE_PREFIXES = [
  /^PVT[-/ ]/i,
  /^CPR[-/ ]/i,
  /^CRP\//i,
  /^CR[-]/i,
  /^REF\/NEA/i,
  /^C[. ]?\d+/i,
  /^\d+$/,                  // pure numeric licence ids
  /^\d{1,2}\/\d{1,2}\/\d{4}$/, // legacy date-shaped (one row)
  /^TESTING/i,              // permits future test data without code changes
];

// ─────────────────────────────────────────────────────────────────────────────
// Adapter
// ─────────────────────────────────────────────────────────────────────────────

export class NeaKeProvider implements SyncProvider {
  readonly slug        = SLUG;
  readonly displayName = DISPLAY_NAME;
  readonly country     = COUNTRY;

  metadata(): ProviderMetadata {
    return {
      slug:           this.slug,
      displayName:    this.displayName,
      country:        this.country,
      upstreamUrl:    UPSTREAM_URL,
      isStatic:       true,        // M1: static replay; bump to false on M-N network mode
      adapterVersion: ADAPTER_VER,
      // 2026-06 (ADR-0002 / Improvement 3): honest capability declaration.
      // Static-replay adapter:
      //   • Pagination — yes, we yield 100 records per page.
      //   • Incremental — no, we always replay the full dataset.
      //   • Webhooks — no upstream push channel.
      //   • Filtering — limited (only opts.limit is honoured today).
      //   • Search — no, we don't index by licence number.
      //   • Upstream snapshots — no, the source has no snapshot API.
      //   • Health probe — no real probe; we just count records.
      // When the M-N network mode lands, flip the relevant flags to true.
      capabilities: {
        supportsPagination:        true,
        supportsIncrementalSync:   false,
        supportsWebhooks:          false,
        supportsFiltering:         false,
        supportsSearch:            false,
        supportsUpstreamSnapshots: false,
        supportsHealthProbe:       false,
      },
    };
  }

  async healthCheck(): Promise<ProviderHealth> {
    // Static replay can never be unhealthy — we just confirm the dataset
    // is present and non-empty. A future network mode probes the upstream.
    const count = NEA_KE_RECORDS.length;
    return {
      status:    count > 0 ? "healthy" : "broken",
      message:   count > 0
        ? `Static dataset ready (${count} records).`
        : "Static dataset is empty — adapter cannot supply records.",
      checkedAt: new Date().toISOString(),
    };
  }

  /**
   * Yield raw records in pages. Honours `opts.limit` for dry-runs and
   * `opts.signal` for abort. Pages are PAGE_SIZE wide so the engine can
   * stream-process without buffering the full dataset.
   */
  async *fetchRecords(opts?: FetchOpts): AsyncIterable<ProviderRecord[]> {
    const limit = opts?.limit ?? NEA_KE_RECORDS.length;
    const total = Math.min(limit, NEA_KE_RECORDS.length);

    for (let i = 0; i < total; i += PAGE_SIZE) {
      if (opts?.signal?.aborted) return;
      const end = Math.min(i + PAGE_SIZE, total);
      // Cast through unknown so consumers don't see the NeaRawRecord shape
      // — ProviderRecord is the public contract; raw shape is adapter-private.
      yield NEA_KE_RECORDS.slice(i, end) as unknown as ProviderRecord[];
    }
  }

  /**
   * Provider-specific normalize: take an NEA portal row and produce a
   * NormalizedAgency. Pure; no I/O. Determinism is critical — same input
   * always produces the same output, otherwise fingerprints would flicker.
   *
   * Notes on field mapping:
   *   • country is fixed to "KE" — NEA only licences agencies for the KE
   *     domestic + outbound recruitment market.
   *   • status_source defaults to "verified" if the portal lists the row;
   *     NEA removes suspended agencies from the public list so absence
   *     implies suspension elsewhere, not here.
   *   • issue_date in the source is null; we keep it null. (The legacy
   *     seeder computes a synthetic issue date = expiry − 365d; that's
   *     a property of the seeder, not the portal, so it doesn't belong
   *     in the normalise step. Tests assert issueDate stays null.)
   */
  normalize(raw: ProviderRecord): NormalizedAgency {
    const r = raw as Record<string, unknown>;

    const expiry = normalizeDate(r.expiryDate as string | null | undefined) ?? "";
    // We deliberately accept "" here and let validation reject it; that way
    // the quarantine reason is the user-visible "expiry required" message
    // rather than a normaliser exception two stages earlier.

    return {
      agencyName:    normalizeAgencyName(r.agencyName as string | null | undefined),
      licenseNumber: normalizeLicenseNumber(r.licenseNumber as string | null | undefined),
      country:       COUNTRY,
      serviceType:   normalizeServiceType(r.serviceType as string | null | undefined),
      email:         normalizeEmail(r.email as string | null | undefined),
      website:       normalizeWebsite(null), // NEA portal exposes no website column today
      phone:         normalizePhoneNumber(null), // ditto
      issueDate:     null,                   // see above
      expiryDate:    expiry,
      statusSource:  normalizeStatusSource("Verified"), // NEA list-presence ≡ verified
    };
  }

  /**
   * Source-specific tightening on top of the base Zod schema. We accept any
   * record where the licence number matches one of the NEA-recognised
   * prefixes; everything else is quarantined for admin review.
   */
  validate(record: NormalizedAgency): ValidationResult {
    const lic = collapseWhitespace(record.licenseNumber);
    const matches = NEA_LICENCE_PREFIXES.some((re) => re.test(lic));
    if (!matches) {
      return {
        ok: false,
        reasons: [{
          path: "licenseNumber",
          code: "invalid_format",
          message:
            `Licence number "${lic}" does not match any known NEA-KE prefix ` +
            `(PVT-/CPR/CRP/CR-/REF/NEA/C./numeric).`,
        }],
      };
    }
    return { ok: true, value: record };
  }
}

/** Singleton instance — engine and tests both import this. */
export const neaKeProvider = new NeaKeProvider();
