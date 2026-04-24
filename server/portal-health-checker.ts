import { db } from "./db";
import { verifiedPortals } from "@shared/schema";
import { eq } from "drizzle-orm";

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
const TIMEOUT_MS = 5_000;
const STARTUP_DELAY_MS = 20_000;

export async function runPortalHealthCheck(): Promise<{ checked: number; active: number; down: number; unreachable: number }> {
  const portals = await db
    .select()
    .from(verifiedPortals)
    .where(eq(verifiedPortals.isActive, true));

  let active = 0, down = 0, unreachable = 0;

  await Promise.allSettled(
    portals.map(async (portal) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      const start = Date.now();

      try {
        const response = await fetch(portal.url, {
          method: "HEAD",
          signal: controller.signal,
          headers: { "User-Agent": "WorkAbroadHub-PortalChecker/1.0" },
          redirect: "follow",
        });
        clearTimeout(timer);

        const responseTimeMs = Date.now() - start;
        const isOk = response.ok || response.status === 405; // 405 = HEAD not allowed but server is up

        if (isOk) active++; else down++;

        await db.update(verifiedPortals).set({
          lastChecked: new Date(),
          status: isOk ? "active" : "down",
          statusCode: response.status,
          responseTimeMs,
          errorMessage: null,
        }).where(eq(verifiedPortals.id, portal.id));
      } catch (err: any) {
        clearTimeout(timer);
        unreachable++;
        const isTimeout = err?.name === "AbortError";
        await db.update(verifiedPortals).set({
          lastChecked: new Date(),
          status: "unreachable",
          statusCode: null,
          responseTimeMs: null,
          errorMessage: isTimeout ? "Request timeout (5s)" : (err?.message ?? "Unknown error"),
        }).where(eq(verifiedPortals.id, portal.id));
      }
    })
  );

  return { checked: portals.length, active, down, unreachable };
}

export function startPortalHealthChecker(): void {
  console.log(`[PortalHealth] Health checker started (every 6h, timeout ${TIMEOUT_MS / 1000}s per portal)`);

  setTimeout(async () => {
    try {
      const result = await runPortalHealthCheck();
      console.log(`[PortalHealth] Initial check: ${result.checked} portals — ${result.active} active, ${result.down} down, ${result.unreachable} unreachable`);
    } catch (err) {
      console.error("[PortalHealth] Initial check failed:", err);
    }
  }, STARTUP_DELAY_MS);

  setInterval(async () => {
    try {
      const result = await runPortalHealthCheck();
      console.log(`[PortalHealth] Scheduled check: ${result.checked} portals — ${result.active} active, ${result.down} down, ${result.unreachable} unreachable`);
    } catch (err) {
      console.error("[PortalHealth] Scheduled check failed:", err);
    }
  }, CHECK_INTERVAL_MS);
}
