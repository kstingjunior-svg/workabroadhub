/**
 * Shared client-side poll helper for the four paid AI verification tools
 * (offer-verify, visa-verify, ielts-verify-ai, job-scam-check).
 *
 * 2026-09 (Tony's "people are paying but I can't tell" investigation): all
 * four used to hold one long request open while the server synchronously
 * awaited a GPT-4o call, which routinely exceeded Render's ~30s platform
 * proxy timeout. The user's KES 100 credit is consumed server-side by
 * requireToolCredit() BEFORE that slow call even starts, so a timeout meant
 * paid-but-nothing-delivered — production logs showed 65+ and 35+ recent
 * 502s on offer-verify and visa-verify alone. The fix (mirroring the
 * already-proven /api/tools/ats-check pattern): the server now responds
 * 202 + { jobId } immediately and finishes the analysis in the background;
 * the client polls GET /api/tools/scan-status/:jobId until it's done.
 */

export const TOOL_SCAN_POLL_INTERVAL_MS = 2000;
export const TOOL_SCAN_MAX_WAIT_MS = 120_000; // generous — a real gpt-4o run rarely exceeds 45s

export class ToolScanError extends Error {}

/**
 * Call this with the raw Response from your POST, AFTER you've already
 * checked for `res.status === 402` yourself (that's payment-specific and
 * needs the parsed body to drive pay.handle402 — this helper doesn't
 * special-case it). For everything else — the 202/job-accepted happy path,
 * a fast-path 4xx validation failure, or a raw HTML 502/503/504 page from
 * Render's edge gateway (sniffed via Content-Type so the user never sees a
 * raw "Unexpected token '<'" parse error) — this resolves with the final
 * result body on success or throws a ToolScanError with a user-facing
 * message on failure.
 */
export async function pollToolScanResult<T = any>(res: Response): Promise<T> {
  if (res.status !== 202) {
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      if (res.status === 502 || res.status === 503 || res.status === 504) {
        throw new ToolScanError(
          "Our AI service is slow right now. Please wait a moment and try again — usually clears within a minute.",
        );
      }
      throw new ToolScanError(`Check failed (server returned HTTP ${res.status}). Please try again in a moment.`);
    }
    const body = await res.json().catch(() => ({}) as any);
    throw new ToolScanError(body?.message ?? "Check failed. Please try again.");
  }

  // 202 — analysis is running in the background. Poll for the result
  // instead of holding one request open (that long hold is exactly what
  // was causing the "mystery" failures — see file header).
  const { jobId } = await res.json();
  const startedAt = Date.now();

  // eslint-disable-next-line no-constant-condition
  while (true) {
    await new Promise((resolve) => setTimeout(resolve, TOOL_SCAN_POLL_INTERVAL_MS));
    const pollRes = await fetch(`/api/tools/scan-status/${jobId}`, { credentials: "include" });
    const pollBody = await pollRes.json().catch(() => ({}) as any);

    if (pollBody?.status === "processing") {
      if (Date.now() - startedAt > TOOL_SCAN_MAX_WAIT_MS) {
        throw new ToolScanError(
          "This is taking unusually long. Your result may still arrive in a moment — please check back, or try again.",
        );
      }
      continue;
    }
    if (pollBody?.status === "error") {
      throw new ToolScanError(pollBody.message ?? "Check failed. Please try again.");
    }
    // status === "done"
    const { status: _status, ...result } = pollBody;
    return result as T;
  }
}
