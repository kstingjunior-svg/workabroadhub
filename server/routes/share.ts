/**
 * Share endpoints — public preview + referral resolution.
 *
 * Routes:
 *   GET /api/share/:token       → returns the sanitized public card data
 *                                 for /share/:token to render. No auth.
 *   POST /api/share/:token/hit  → records a referral-link click for basic
 *                                 analytics (rate-limited, no auth needed).
 *
 * Attribution to a paid order happens in the payment initiation code paths,
 * NOT here — the client POSTs `referrerOrderId` (from localStorage) alongside
 * the normal init payload, and the payment handler writes it to
 * service_orders.referrer_order_id at row-creation time.
 */

import type { Express, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { db } from "../db";
import { serviceOrders, users } from "@shared/schema";
import { eq } from "drizzle-orm";

/** Hit limiter: 60 GETs/min per IP — plenty for real users, kills scrapers. */
const previewLimiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

interface PublicShareCard {
  ok: true;
  card: {
    firstName: string | null;
    serviceName: string;
    targetCountry: string | null;
    atsScore: number | null;
    variant: "cv" | "linkedin" | "cover" | "sop" | "job-match" | "generic";
  };
}

interface NotFoundResponse { ok: false; error: string; }

/** Best-effort variant inference from the service_id / slug. */
function variantFromServiceId(id: string): PublicShareCard["card"]["variant"] {
  const s = (id || "").toLowerCase();
  if (s.includes("linkedin"))                       return "linkedin";
  if (s.includes("cover"))                          return "cover";
  if (s.includes("sop") || s.includes("motivation")) return "sop";
  if (s.includes("job") && s.includes("match"))     return "job-match";
  if (s.includes("cv") || s.includes("ats"))        return "cv";
  return "generic";
}

/**
 * Extract a target country from the order's intake_data JSON, if present.
 * We deliberately don't leak the full intake — just the country.
 */
function pickCountry(intake: unknown): string | null {
  if (!intake || typeof intake !== "object") return null;
  const obj = intake as Record<string, unknown>;
  const candidates = [obj.targetCountry, obj.country, obj.destination];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim().slice(0, 40);
  }
  return null;
}

export function registerShareRoutes(app: Express): void {
  app.get("/api/share/:token", previewLimiter, async (req: Request, res: Response) => {
    const token = String(req.params.token || "").trim();
    // Order IDs are UUIDs — reject anything that looks nothing like one to
    // save a DB round-trip on bot traffic.
    if (!token || token.length < 8 || token.length > 64) {
      return res.status(404).json({ ok: false, error: "not_found" } satisfies NotFoundResponse);
    }

    try {
      const rows = await db
        .select({
          id:            serviceOrders.id,
          userId:        serviceOrders.userId,
          serviceId:     serviceOrders.serviceId,
          serviceName:   serviceOrders.serviceName,
          status:        serviceOrders.status,
          intakeData:    serviceOrders.intakeData,
          qualityScore:  serviceOrders.qualityScore,
        })
        .from(serviceOrders)
        .where(eq(serviceOrders.id, token))
        .limit(1);

      const order = rows[0];
      if (!order) {
        return res.status(404).json({ ok: false, error: "not_found" } satisfies NotFoundResponse);
      }

      // Only completed orders can be shared — don't leak in-progress state.
      if (order.status !== "completed") {
        return res.status(404).json({ ok: false, error: "not_available" } satisfies NotFoundResponse);
      }

      // Fetch the first name — nullable, first-name only, never full name.
      let firstName: string | null = null;
      try {
        const [u] = await db
          .select({ firstName: users.firstName })
          .from(users)
          .where(eq(users.id, order.userId))
          .limit(1);
        if (u?.firstName) firstName = String(u.firstName).split(/\s+/)[0].slice(0, 24);
      } catch { /* non-fatal — we can still render the card without a name */ }

      const payload: PublicShareCard = {
        ok: true,
        card: {
          firstName,
          serviceName: order.serviceName || "Career service",
          targetCountry: pickCountry(order.intakeData),
          atsScore: typeof order.qualityScore === "number" && order.qualityScore > 0
            ? order.qualityScore
            : null,
          variant: variantFromServiceId(order.serviceId),
        },
      };

      // Cache for 5 min — the card content never changes for a completed
      // order, so we don't need to re-query on every visitor.
      res.setHeader("Cache-Control", "public, max-age=300, s-maxage=300");
      return res.json(payload);
    } catch (err) {
      console.error("[share] preview lookup failed:", err);
      return res.status(500).json({ ok: false, error: "server_error" } satisfies NotFoundResponse);
    }
  });

  // Lightweight hit endpoint — kept even simpler than the preview because
  // it's called from every landing page mount. Just increments a counter
  // we might add later; for now it's a noop that returns 204.
  app.post("/api/share/:token/hit", previewLimiter, async (_req: Request, res: Response) => {
    res.status(204).end();
  });
}
