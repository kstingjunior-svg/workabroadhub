// ─────────────────────────────────────────────────────────────────────────────
// PWA install tracking — answers "does this user have the app installed?"
// across logins and devices.
//
// What the browser tells us:
//   • `display-mode: standalone` media query — TRUE when the page is loaded
//     INSIDE the installed PWA. We record this as `pwa_last_standalone_at`.
//   • `beforeinstallprompt` event — fires when Chrome/Edge/Android think the
//     PWA is installable. If it fires AND we previously saw an install for
//     this user, they almost certainly uninstalled it.
//   • `appinstalled` event — fires once at install completion. We record this
//     as `pwa_installed_at`.
//
// We persist these timestamps server-side so the heuristic works across
// browser-data clears, new devices on the same account, and incognito.
//
// Schema: 3 nullable timestamp columns on `users`, created idempotently on
// first import via ensureSchema() so no separate migration file is required.
// Mirrors the pattern used in server/lib/cv-fingerprint.ts.
// ─────────────────────────────────────────────────────────────────────────────

import { pool } from "../db";

const SCHEMA_INIT_ONCE = { done: false };

async function ensureSchema(): Promise<void> {
  if (SCHEMA_INIT_ONCE.done) return;
  try {
    await pool.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS pwa_installed_at        TIMESTAMPTZ NULL,
        ADD COLUMN IF NOT EXISTS pwa_last_standalone_at  TIMESTAMPTZ NULL,
        ADD COLUMN IF NOT EXISTS pwa_uninstall_seen_at   TIMESTAMPTZ NULL
    `);
    SCHEMA_INIT_ONCE.done = true;
  } catch (err: any) {
    console.error("[pwa-install] ensureSchema failed:", err?.message ?? err);
  }
}

export type PwaEventType =
  | "installed"           // appinstalled event fired
  | "standalone-open"     // page loaded in display-mode: standalone
  | "uninstall-detected"; // beforeinstallprompt fired AFTER a prior install

/**
 * Record one PWA event for a signed-in user.
 * Fire-and-forget — never throws on DB errors (we never want PWA telemetry
 * to break the user's session).
 */
export async function recordPwaEvent(
  userId: string,
  type: PwaEventType,
): Promise<void> {
  if (!userId) return;
  await ensureSchema();
  try {
    if (type === "installed") {
      await pool.query(
        `UPDATE users
            SET pwa_installed_at       = NOW(),
                pwa_last_standalone_at = NOW(),
                pwa_uninstall_seen_at  = NULL
          WHERE id = $1`,
        [userId],
      );
    } else if (type === "standalone-open") {
      // Every open clears the "we think they uninstalled" flag — if we see
      // them in standalone, they clearly still have it installed.
      await pool.query(
        `UPDATE users
            SET pwa_last_standalone_at = NOW(),
                pwa_uninstall_seen_at  = NULL,
                pwa_installed_at       = COALESCE(pwa_installed_at, NOW())
          WHERE id = $1`,
        [userId],
      );
    } else if (type === "uninstall-detected") {
      await pool.query(
        `UPDATE users
            SET pwa_uninstall_seen_at = NOW()
          WHERE id = $1
            AND pwa_installed_at IS NOT NULL`,
        [userId],
      );
    }
  } catch (err: any) {
    console.warn(`[pwa-install] recordPwaEvent(${type}) failed:`, err?.message);
  }
}

export interface PwaStatus {
  installedAt: string | null;          // ISO timestamp of first/last install event
  lastStandaloneAt: string | null;     // last time we saw them open in-app
  uninstallSeenAt: string | null;      // last time beforeinstallprompt fired after install
  // Derived: was the app installed but is no longer present in this browser?
  // True when we have an install record AND the last beforeinstallprompt was
  // newer than the last standalone open.
  likelyUninstalled: boolean;
}

export async function getPwaStatus(userId: string): Promise<PwaStatus> {
  if (!userId) {
    return { installedAt: null, lastStandaloneAt: null, uninstallSeenAt: null, likelyUninstalled: false };
  }
  await ensureSchema();
  try {
    const { rows } = await pool.query<{
      pwa_installed_at: Date | null;
      pwa_last_standalone_at: Date | null;
      pwa_uninstall_seen_at: Date | null;
    }>(
      `SELECT pwa_installed_at, pwa_last_standalone_at, pwa_uninstall_seen_at
         FROM users
        WHERE id = $1`,
      [userId],
    );
    const r = rows[0];
    if (!r) {
      return { installedAt: null, lastStandaloneAt: null, uninstallSeenAt: null, likelyUninstalled: false };
    }
    const installedAt = r.pwa_installed_at?.toISOString() ?? null;
    const lastStandaloneAt = r.pwa_last_standalone_at?.toISOString() ?? null;
    const uninstallSeenAt = r.pwa_uninstall_seen_at?.toISOString() ?? null;
    const likelyUninstalled = Boolean(
      installedAt &&
      uninstallSeenAt &&
      (!lastStandaloneAt || new Date(uninstallSeenAt) > new Date(lastStandaloneAt)),
    );
    return { installedAt, lastStandaloneAt, uninstallSeenAt, likelyUninstalled };
  } catch (err: any) {
    console.warn("[pwa-install] getPwaStatus failed:", err?.message);
    return { installedAt: null, lastStandaloneAt: null, uninstallSeenAt: null, likelyUninstalled: false };
  }
}
