// ─────────────────────────────────────────────────────────────────────────────
// User-activity summariser — gives Nanjila eyes on what the user has been doing.
//
// Reads recent funnel_events + service_orders for a userId and produces a
// compact human-readable summary like:
//
//   • Last 24h:
//       - viewed /country/australia 3x (most-visited country)
//       - viewed /tools/ats-cv-checker once (3m on page)
//       - viewed /pricing once
//   • Started CV Fix Lite 2 hours ago — status: pending_payment (abandoned)
//
// That text block gets injected into Nanjila's system prompt so she can say
// things like: "I see you were looking at Australia portals a few minutes
// ago — want me to walk you through the 482 visa path?"
//
// Falls back gracefully (returns empty string) on any DB error.
// ─────────────────────────────────────────────────────────────────────────────

import { pool } from "../db";

export interface ActivitySummary {
  asText: string;          // human-readable block for system-prompt injection
  hasAbandonedOrder: boolean;
  topCountry?: string;     // e.g. "australia" — for greeting messages
  topPage?: string;
}

interface FunnelRow {
  page: string | null;
  event: string;
  metadata: any;
  created_at: Date;
}

interface OrderRow {
  service_slug: string;
  service_name: string;
  status: string;
  created_at: Date;
}

function fmtAgo(d: Date): string {
  const ms = Date.now() - d.getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1)  return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24)  return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

// Pulls the activity summary for a logged-in user. Returns an empty summary
// (asText: "") for anonymous sessions — Nanjila handles that case in her prompt.
export async function buildActivitySummary(userId: string | null): Promise<ActivitySummary> {
  if (!userId) return { asText: "", hasAbandonedOrder: false };

  try {
    // Recent page-views (last 24h, up to 50)
    const pageViews = await pool.query<FunnelRow>(
      `SELECT page, event, metadata, created_at
         FROM funnel_events
        WHERE user_id = $1
          AND event IN ('page_view', 'page_leave')
          AND page IS NOT NULL
          AND created_at > NOW() - INTERVAL '24 hours'
        ORDER BY created_at DESC
        LIMIT 50`,
      [userId]
    );

    // Last 5 service orders for abandonment detection
    const orders = await pool.query<OrderRow>(
      `SELECT service_slug, service_name, status, created_at
         FROM service_orders
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 5`,
      [userId]
    );

    // ── Aggregate page views ──────────────────────────────────────────────
    const countByPage = new Map<string, number>();
    const countByCountry = new Map<string, number>();
    let totalDwellMs = 0;
    for (const v of pageViews.rows) {
      if (!v.page) continue;
      countByPage.set(v.page, (countByPage.get(v.page) ?? 0) + 1);
      const m = v.page.match(/^\/country\/([a-z]+)/);
      if (m) countByCountry.set(m[1], (countByCountry.get(m[1]) ?? 0) + 1);
      const dwell = Number(v.metadata?.dwellMs ?? 0);
      if (dwell > 0) totalDwellMs += dwell;
    }

    // Top page + top country
    const topPage    = [...countByPage.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const topCountry = [...countByCountry.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

    // ── Build the human-readable summary ──────────────────────────────────
    const lines: string[] = [];
    lines.push(`▸ User activity (last 24h):`);
    if (pageViews.rows.length === 0) {
      lines.push(`   (no recent page views logged)`);
    } else {
      const topPages = [...countByPage.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
      for (const [page, count] of topPages) {
        lines.push(`   • ${page} — viewed ${count}x`);
      }
      if (totalDwellMs > 60_000) {
        lines.push(`   • Total dwell time: ~${Math.round(totalDwellMs / 60_000)} min on-site`);
      }
      if (topCountry) {
        lines.push(`   • Most-viewed country: ${topCountry}`);
      }
    }

    // Orders / abandonment
    let hasAbandonedOrder = false;
    if (orders.rows.length > 0) {
      lines.push(`▸ Recent service orders:`);
      for (const o of orders.rows) {
        const status = o.status === "pending_payment" || o.status === "expired"
          ? `${o.status} (abandoned)`
          : o.status;
        if (o.status === "pending_payment" || o.status === "expired") hasAbandonedOrder = true;
        lines.push(`   • ${o.service_name} — ${status}, ${fmtAgo(o.created_at)}`);
      }
    }

    return {
      asText: lines.join("\n"),
      hasAbandonedOrder,
      topCountry,
      topPage,
    };
  } catch (err: any) {
    console.warn("[Nanjila] buildActivitySummary failed:", err?.message);
    return { asText: "", hasAbandonedOrder: false };
  }
}
