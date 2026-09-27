// ─────────────────────────────────────────────────────────────────────────────
// mpesa-c2b-register.ts
//
// One-time admin endpoint that registers our C2B Validation + Confirmation
// URLs with Safaricom Daraja. Replaces the Daraja portal's URL Management
// self-service flow — no OTP round-trip, no chance of typos, and we get
// Safaricom's exact response body back for verification.
//
// USAGE (one time, after code is deployed and env vars are set):
//   1. GET  /api/admin/mpesa/c2b/preview        → shows what will be sent
//   2. POST /api/admin/mpesa/c2b/register-urls  → actually fires the call
//
// SAFETY
//   · Both endpoints require the admin secret header. There is NO CSRF form,
//     NO web UI — you invoke them from your terminal with curl/PowerShell.
//   · The POST is idempotent from OUR side — calling it twice just retries
//     the Daraja call. But Safaricom's production register-URL API is
//     documented as a ONE-TIME call — the second attempt will return
//     "URL already registered" or similar. So preview first, then POST once.
//   · Response includes the full Daraja body so you can screenshot it.
//
// URLS BEING REGISTERED (via safe alias paths — no "mpesa"/"safaricom" in
// the path per Safaricom's URL Requirements):
//   Confirmation: https://workabroadhub.tech/api/pay/c2b/confirmation
//   Validation:   https://workabroadhub.tech/api/pay/c2b/validation
//
// Response Type: Completed  (M-PESA finishes the transaction if our URL
//                            is unreachable, so customers never lose money
//                            because our server was slow to respond)
//
// 2026-09 (Tony's C2B registration).
// ─────────────────────────────────────────────────────────────────────────────

import type { Express, Request, Response } from "express";

const MPESA_BASE =
  (process.env.MPESA_BASE_URL || "").trim() ||
  ((process.env.MPESA_ENV || "").toLowerCase() === "production"
    ? "https://api.safaricom.co.ke"
    : "https://sandbox.safaricom.co.ke");

const APP_ORIGIN = (process.env.APP_ORIGIN || "https://workabroadhub.tech").replace(/\/$/, "");

const CONFIRMATION_URL = `${APP_ORIGIN}/api/pay/c2b/confirmation`;
const VALIDATION_URL   = `${APP_ORIGIN}/api/pay/c2b/validation`;
const RESPONSE_TYPE    = "Completed" as const;

/**
 * Admin-secret gate. Reads `x-admin-secret` header and compares against
 * process.env.ADMIN_SECRET. This endpoint is dangerous enough (one-time
 * production registration) that we don't want it behind normal session
 * auth — a session cookie could theoretically leak. A header secret
 * you type into curl is much narrower.
 */
function requireAdminSecret(req: Request, res: Response): boolean {
  const provided = String(req.headers["x-admin-secret"] || "").trim();
  const expected = String(process.env.ADMIN_SECRET || "").trim();
  if (!expected) {
    res.status(500).json({
      ok: false,
      message: "ADMIN_SECRET is not configured on the server. Set it in Render env vars first.",
    });
    return false;
  }
  if (provided !== expected) {
    res.status(403).json({ ok: false, message: "Forbidden — missing or wrong x-admin-secret header." });
    return false;
  }
  return true;
}

async function getDarajaAccessToken(): Promise<string> {
  const key    = (process.env.MPESA_CONSUMER_KEY    || "").trim();
  const secret = (process.env.MPESA_CONSUMER_SECRET || "").trim();
  if (!key || !secret) {
    throw new Error("MPESA_CONSUMER_KEY / MPESA_CONSUMER_SECRET are not set in the server env.");
  }
  const basic = Buffer.from(`${key}:${secret}`).toString("base64");
  const res = await fetch(
    `${MPESA_BASE}/oauth/v1/generate?grant_type=client_credentials`,
    { method: "GET", headers: { Authorization: `Basic ${basic}` } },
  );
  const body = await res.text();
  if (!res.ok) {
    throw new Error(`Daraja OAuth failed: HTTP ${res.status} — ${body.slice(0, 300)}`);
  }
  let parsed: any;
  try { parsed = JSON.parse(body); } catch { throw new Error(`Daraja OAuth returned non-JSON: ${body.slice(0, 300)}`); }
  const token = String(parsed.access_token || "").trim();
  if (!token) throw new Error(`Daraja OAuth returned no access_token: ${body.slice(0, 300)}`);
  return token;
}

export function registerC2BRegistrationRoutes(app: Express): void {
  // ── PREVIEW ─ shows what will be sent so Tony can double-check ─────────
  app.get("/api/admin/mpesa/c2b/preview", (req, res) => {
    if (!requireAdminSecret(req, res)) return;
    const shortcode = (process.env.MPESA_SHORTCODE || "").trim() || "4153025";
    const payload = {
      ShortCode:       shortcode,
      ResponseType:    RESPONSE_TYPE,
      ConfirmationURL: CONFIRMATION_URL,
      ValidationURL:   VALIDATION_URL,
    };
    res.json({
      ok: true,
      note: "This is what will be sent to Daraja when you POST /api/admin/mpesa/c2b/register-urls. Double-check the shortcode + URLs. Register in production is a ONE-TIME call.",
      environment: MPESA_BASE,
      target:      `${MPESA_BASE}/mpesa/c2b/v2/registerurl`,
      payload,
    });
  });

  // ── REGISTER ─ actually fires the Daraja call ───────────────────────────
  app.post("/api/admin/mpesa/c2b/register-urls", async (req, res) => {
    if (!requireAdminSecret(req, res)) return;

    const shortcode = String(req.body?.shortcode ?? process.env.MPESA_SHORTCODE ?? "4153025").trim();
    const payload = {
      ShortCode:       shortcode,
      ResponseType:    RESPONSE_TYPE,
      ConfirmationURL: CONFIRMATION_URL,
      ValidationURL:   VALIDATION_URL,
    };

    try {
      const token = await getDarajaAccessToken();
      console.log(`[c2b/register] Firing register-URL call against ${MPESA_BASE} for shortcode=${shortcode}`);
      const darajaRes = await fetch(`${MPESA_BASE}/mpesa/c2b/v2/registerurl`, {
        method:  "POST",
        headers: {
          Authorization:  `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const rawBody = await darajaRes.text();
      let parsedBody: any;
      try { parsedBody = JSON.parse(rawBody); } catch { parsedBody = { raw: rawBody }; }

      console.log(
        `[c2b/register] Daraja responded HTTP ${darajaRes.status}: ${
          typeof parsedBody === "object" ? JSON.stringify(parsedBody) : rawBody.slice(0, 400)
        }`,
      );

      return res.status(darajaRes.ok ? 200 : 502).json({
        ok:              darajaRes.ok,
        darajaStatus:    darajaRes.status,
        payloadSent:     payload,
        environment:     MPESA_BASE,
        darajaResponse:  parsedBody,
        hint:
          darajaRes.ok
            ? "Registration accepted. In production this is a one-time call — do NOT run again. Send a KES 1 test payment to Paybill 4153025 and watch Render logs for [c2b/confirmation]."
            : "Daraja rejected the call. Check darajaResponse for the exact reason. Common causes: (1) URLs contain a banned keyword, (2) already registered (no-op — check Safaricom URL Management page), (3) OAuth credentials mismatched (sandbox vs production), (4) shortcode not enabled for C2B v2.",
      });
    } catch (err: any) {
      console.error("[c2b/register] threw:", err?.message);
      return res.status(500).json({
        ok:      false,
        message: err?.message || "Register call failed for an unknown reason.",
        payloadSent: payload,
        environment: MPESA_BASE,
      });
    }
  });

  console.log(
    "[c2b/register] ✓ GET /api/admin/mpesa/c2b/preview + POST /api/admin/mpesa/c2b/register-urls registered",
  );
}
