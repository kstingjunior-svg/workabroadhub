/**
 * NEAIMS API client.
 *
 * The NEAIMS registry is a public SPA at neaims.go.ke that talks to
 * https://api.neaims.go.ke/api/v1/agencies/public/list — a paginated POST
 * endpoint returning JSON. The endpoint is CORS-restricted for browsers to
 * their own origin only, but works fine from server-side calls (no CORS
 * enforcement).
 *
 * Endpoint: POST https://api.neaims.go.ke/api/v1/agencies/public/list
 *
 * Request body (JSON):
 *   { page: 1, size: 1000, search: "", verifiedOnly: true }
 *
 * Response body (JSON):
 *   { success: true, message: "Fetched", data: NeaimsAgency[], count: N }
 *
 * We fetch verified and non-verified in two separate calls. Because NEAIMS
 * accepts a large `size`, we can usually pull the entire registry in one
 * request per bucket (currently ~569 verified + ~2,400 invalid).
 *
 * 2026-07-06: written as the first component of the nightly sync service.
 */

const NEAIMS_BASE = "https://api.neaims.go.ke";
const NEAIMS_LIST_PATH = "/api/v1/agencies/public/list";

/** How long to wait for a NEAIMS response before giving up. */
const REQUEST_TIMEOUT_MS = 30_000;

/** How many rows to pull per request. Large so one call covers everything. */
const PAGE_SIZE = 5000;

/** Raw NEAIMS row shape — matches the API response verbatim. */
export interface NeaimsAgency {
  instId:            string;
  instCode:          string | null;
  instName:          string;
  /**
   * NEAIMS status enum. Values observed in the wild:
   *   'LICENSE_PAID'          — currently licensed / verified
   *   'LICENSE_EXPIRED'       — was licensed, expired
   *   'LICENSE_DEREGISTERED'  — revoked by NEA
   *   'LICENSE_PENDING'       — application in progress, not yet licensed
   *   null                    — self-submitted, no application record
   */
  instStatus:        string | null;
  instEmail:         string | null;
  instWorkTel:       string | null;
  /** ISO YYYY-MM-DD or null if no expiry set. */
  instExpiryDate:    string | null;
  instIcon:          string | null;
  instRegNo:         string | null;
  /**
   * Service scope, e.g. "BOTH LOCAL & INTERNATIONAL LICENSE" or "LOCAL LICENSE".
   * Null on many rows in the invalid tab.
   */
  instLicenseType:   string | null;
}

interface NeaimsListResponse {
  success: boolean;
  message: string;
  data:    NeaimsAgency[];
  count:   number;
}

/**
 * Fetch all agencies for one status bucket.
 *
 * @param verifiedOnly true → currently-licensed agencies only
 *                     false → everything else (expired, deregistered, pending,
 *                     and self-submitted rows we'll filter later)
 */
export async function fetchNeaimsAgencies(verifiedOnly: boolean): Promise<NeaimsAgency[]> {
  const url = `${NEAIMS_BASE}${NEAIMS_LIST_PATH}`;
  const body = JSON.stringify({
    page:         1,
    size:         PAGE_SIZE,
    search:       "",
    verifiedOnly,
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      method:  "POST",
      body,
      headers: {
        "Accept":       "application/json, text/plain, */*",
        "Content-Type": "application/json",
        // NEAIMS occasionally 403s requests without a browser-y UA. Send one
        // that matches Chrome to stay compatible.
        "User-Agent":
          "Mozilla/5.0 (compatible; WorkAbroadHub-NEAIMSSync/1.0; +https://workabroadhub.tech)",
        // The API server checks Origin. Send our own origin — it's not the
        // NEAIMS frontend but the API doesn't enforce a value.
        "Origin":       "https://workabroadhub.tech",
      },
      signal: controller.signal,
    });
  } catch (err: any) {
    clearTimeout(timeout);
    if (err?.name === "AbortError") {
      throw new NeaimsClientError(
        `NEAIMS request timed out after ${REQUEST_TIMEOUT_MS}ms`,
        "TIMEOUT",
      );
    }
    throw new NeaimsClientError(
      `Network error contacting NEAIMS: ${err?.message ?? String(err)}`,
      "NETWORK",
    );
  }
  clearTimeout(timeout);

  if (!response.ok) {
    // Grab a snippet of the body so we can debug if NEAIMS starts returning
    // an HTML error page instead of JSON.
    const snippet = await response.text().then(t => t.slice(0, 500)).catch(() => "");
    throw new NeaimsClientError(
      `NEAIMS returned HTTP ${response.status} ${response.statusText} — body: ${snippet}`,
      "HTTP_" + response.status,
    );
  }

  let json: NeaimsListResponse;
  try {
    json = await response.json() as NeaimsListResponse;
  } catch (err: any) {
    throw new NeaimsClientError(
      `NEAIMS response was not valid JSON: ${err?.message ?? String(err)}`,
      "BAD_JSON",
    );
  }

  // Defensive: the API's `success` field should be true; if it isn't, treat
  // it as an error even if we got HTTP 200.
  if (!json?.success || !Array.isArray(json.data)) {
    throw new NeaimsClientError(
      `NEAIMS response missing data array (success=${json?.success})`,
      "BAD_SHAPE",
    );
  }

  return json.data;
}

/**
 * Rich error type so the sync orchestrator can log a stable code alongside
 * the human-readable message.
 */
export class NeaimsClientError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = "NeaimsClientError";
  }
}
