/**
 * Nanjila — agency_stats capability.
 *
 * 2026-10 (Tony: "Nanjila quoted 566 valid agencies but the dashboard
 * shows 758 — numbers don't match"). She was hallucinating because she
 * had no way to query the real totals. Now she can: this tool runs the
 * same classification logic the public /nea-agencies dashboard uses, so
 * the numbers Nanjila quotes ALWAYS match what the user sees elsewhere
 * on the site.
 *
 * No input needed — returns the full breakdown + last-updated timestamp.
 */

import type { CapabilityDefinition, CapabilityContext } from "./index";
import { pool } from "../../db";

export interface AgencyStatsInput {}

export interface AgencyStatsOutput {
  ok:              boolean;
  totalTracked:    number;
  active:          number;
  expired:         number;
  revoked:         number;
  suspended:       number;
  lastUpdated:     string;
  message:         string;
}

async function agencyStatsHandler(
  _input: AgencyStatsInput,
  _ctx:   CapabilityContext,
): Promise<AgencyStatsOutput> {
  try {
    const { rows } = await pool.query<{
      bucket: string;
      count:  number;
    }>(`
      WITH classified AS (
        SELECT CASE
          WHEN status_override = 'revoked'   THEN 'revoked'
          WHEN status_override = 'suspended' THEN 'suspended'
          WHEN status_override = 'expired' OR expiry_date < NOW() THEN 'expired'
          ELSE 'active'
        END AS bucket
        FROM nea_agencies
      )
      SELECT bucket, COUNT(*)::int AS count FROM classified GROUP BY bucket
    `);

    const bucket = (name: string) =>
      rows.find((r) => r.bucket === name)?.count ?? 0;

    const active    = bucket("active");
    const expired   = bucket("expired");
    const revoked   = bucket("revoked");
    const suspended = bucket("suspended");
    const total     = active + expired + revoked + suspended;

    return {
      ok:           true,
      totalTracked: total,
      active,
      expired,
      revoked,
      suspended,
      lastUpdated:  new Date().toISOString(),
      message:      `We track ${total.toLocaleString("en-KE")} agencies — ${active.toLocaleString("en-KE")} currently active, ${expired.toLocaleString("en-KE")} expired, ${revoked} revoked.`,
    };
  } catch (err: any) {
    console.warn("[Nanjila/agencyStats] query failed:", err?.message);
    return {
      ok:           false,
      totalTracked: 0,
      active:       0,
      expired:      0,
      revoked:      0,
      suspended:    0,
      lastUpdated:  new Date().toISOString(),
      message:      "I couldn't reach the agency registry just now — try again in a moment.",
    };
  }
}

export const agencyStatsCapability: CapabilityDefinition<AgencyStatsInput, AgencyStatsOutput> = {
  slug:        "agency_stats",
  label:       "Get live counts of tracked / active / expired agencies",
  description:
    "Return the current totals from the NEA agency registry: how many agencies we track, " +
    "how many are currently licensed and active, how many have expired licences, how many " +
    "have been revoked. Call this when the user asks any question of the form 'how many " +
    "agencies do you have?', 'how many are licensed?', 'how big is your database?', 'what " +
    "percentage are expired?' etc. Numbers are LIVE from the DB — quote them exactly, do " +
    "not round or guess.",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
  },
  outputSchema: {
    type: "object",
    properties: {
      ok:           { type: "boolean" },
      totalTracked: { type: "integer" },
      active:       { type: "integer" },
      expired:      { type: "integer" },
      message:      { type: "string" },
    },
  },
  requiresAuth:  false,
  requiresPaid:  false,
  requiresAdmin: false,
  handler:       agencyStatsHandler,
};
