# WorkAbroadHub Migration — Restore Summary

**Date applied:** 2026-05-22
**Audit doc:** `MIGRATION_AUDIT.md` (full pre-change analysis)

This document records everything that actually changed on disk during the restore. Each batch's status is noted plus any follow-ups you still need to do yourself.

---

## Batch A — env + Supabase fixes (PARTIAL — you must finish 3 items)

**Applied:**
- Fixed the corrupted line 4 of `.env`: renamed the broken `MPESA_CONSUMER_cYmGfA…` into a proper `MPESA_CONSUMER_SECRET=cYmGfA…` line. M-Pesa auth can now succeed.
- Rewrote `.env` with clear section headers, comments, and placeholders for the two values only you can supply (`DATABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`).

**YOU MUST DO (none of these are file edits — they're values + a key rotation):**
1. In Supabase Dashboard → Project Settings → API → **Reset service_role key** (the old one was shipped to every browser bundle).
2. Replace `VITE_SUPABASE_ANON_KEY` in `.env` with the actual **anon** public key.
3. Paste the new rotated service_role key into `SUPABASE_SERVICE_ROLE_KEY` in `.env`.
4. Replace `DATABASE_URL` in `.env` with the Postgres Session Pooler connection string from Supabase → Database → Connection string.
5. Mirror items 2-4 in Render → Service → Environment.

Until those four values are set correctly, the server cannot connect to the database.

## Batch B — junk cleanup (DONE)

**Deleted:**
- `(`, `8`, `Running`, `void`, `{` — five zero-byte garbage files in the repo root (accidental PowerShell redirections)
- `server/server.js` — empty file
- `server/services/SUM_risk_points_.code-search` — VS Code search artifact

**Renamed:** `client/src/hooks/use-premium.ts.txt` → `use-premium.ts` (it contained valid React hook code, just had a stray `.txt` suffix). Note: the hook isn't imported anywhere yet — it's a code snippet sitting in your hooks dir.

**Kept (because Render's start command source is unknown — these may be referenced by your Render dashboard config):**
- `index.js` (22-line stub)
- `server/server-prod.ts` (47-line minimal Express stub)
- `redeploy.txt`

If Render's start command in the dashboard is `node dist/server/index.js` (the real server), you can safely delete all three. Confirm before doing so.

## Batch C — `server/index.ts` boot subsystems (DONE)

The current `server/index.ts` already calls 8 of the original 13 boot subsystems via dynamic imports — I preserved that structure (it's a smart Render-friendly pattern: server starts listening FIRST, then loads non-critical background work). Added back the missing 5:

- Expanded the `import("./seed")` block to also call `seedFraudDetectionRules`, `seedVisaJobs`, `seedUsaVisaJobs`, `ensureIndexes`, `syncNeaAgencies`, `deduplicateNeaAgencies`, `syncServicePrices`.
- Added `import("./security").then(m => m.initSecurityMonitor())` — security event monitor.
- Added `import("./queue").then(m => m.registerQueueHandlers())` — background async queue handlers (CV processing, emails, fraud checks, WhatsApp follow-ups).
- Added Firebase RTDB error logging to the global error handler — server errors are now mirrored to Firebase for centralized monitoring (no-op if Firebase env vars are missing).

All as non-blocking dynamic imports — boot doesn't wait, and failures log without crashing.

## Batch D — `server/db.ts` enhancements (DONE)

Restored without touching the migration's good parts (the `pg`-driver switch, `ssl: { rejectUnauthorized: false }` for Supabase pooler):

- Pool size now configurable via `DB_POOL_MAX` and `DB_POOL_MIN` env vars (defaults 20 / 2)
- Idle, connection, and statement timeouts
- `getPoolStats()` — needed by `server/health.ts` and `server/routes.ts` (both were importing it and getting `undefined` before)
- `withTransaction()` — needed by `server/payment-processor.ts` (same issue; would have thrown at runtime on every payment)
- `pool.on("error")` / `pool.on("connect")` handlers + a pool-pressure warning

Also added `if (!process.env.DATABASE_URL)` guard so misconfiguration fails loud and fast instead of producing cryptic pg errors.

## Batch E — auth files (DELIBERATELY MINIMAL)

The current `server/replit_integrations/auth/replitAuth.ts` is a clean rewrite (Replit OIDC → email/password with bcryptjs) and your post-migration commits (forgot-password, reset-password, stale session destruction, `sameSite: lax` cookie fix) are baked into it. Restoring the original would undo your work, so I left it alone.

The current `auth/routes.ts` has all 6 routes (register, login, logout, user, forgot-password, reset-password) and you've also actively worked on it. One targeted security improvement:

- `bcrypt.hash(password, 10)` → `bcrypt.hash(password, 12)` in both places (backward-compatible — rounds are stored in each hash).

The original auth/routes.ts had richer features (Zod schemas, activity log writes, websocket broadcasts on new user/stats, Supabase user sync). Not restored because they touch many other modules and your current implementation is correct, just simpler. Listed as a follow-up below.

## Batch F — tests/ directory (DONE)

- Copied entire `tests/` directory from the original (22 test files across api/, compliance/, integration/, payment/, performance/, real-routes/, security/, unit/).
- Added test scripts to `package.json`: `test`, `test:watch`, `test:coverage`.
- Added `@types/supertest` and `@vitest/coverage-v8` back to `devDependencies`.

Run `npm install` then `npm test`. Tests will need their own setup env (a separate `DATABASE_URL` for the test DB) — see `tests/setup.ts`.

## Batch H — other server file diffs (DONE for real regressions; SKIPPED where intentional)

**Real regressions, fixed:**
- `server/lib/openai.ts` — restored `askGPT()` function (called via dynamic import 10 times in `server/routes.ts`; was undefined). Also removed the dangerous `|| "sk-test"` fallback that silently used a fake API key, and removed the `// @ts-nocheck`.
- `server/services/whatsapp.ts` — restored `sendWhatsApp()` function (statically imported by 5 modules: `ai/router.ts`, `license-notification-service.ts`, `schedulers/reEngagement.ts`, `wa-followup-scheduler.ts`, `whatsapp-queue.ts` — all of those would fail to load without it). Kept the migration's conditional Twilio init pattern.

**Left alone (intentional migration choices or low-risk dead code):**
- `server/migrate-payments.ts` — drastically shortened, but `ensurePaymentColumns()` is only defined, never called. Drizzle migrations (`migrations/0002_slow_gravity.sql`) handle column adds going forward. Don't restore — could conflict.
- `server/static.ts` — now a no-op stub with the comment "Frontend is served by Render Static Site". **This is correct ONLY if you have a separate Render Static Site for the frontend.** If your Render deploy is a single Web Service that should serve both API and frontend, the stub is wrong and the original `serveStatic` with `express.static(distPath)` + SPA fallback needs to be restored. **Confirm your Render architecture.**

## Batch G — 1-line-diff spot check (DONE)

49 files have small content differences. Classification:
- **46 files** have only `// @ts-nocheck` added at the top — tech debt (type checking is suppressed for those files) but not a runtime issue. **Left alone — listed as follow-up.**
- **2 files were real visible regressions, both fixed:**
  - `client/src/components/report-share-bar.tsx` — was importing only `SiWhatsapp, SiFacebook` but rendering `<SiLinkedin>` on its LinkedIn share button → runtime undefined-component error. Restored the import.
  - `client/src/pages/tools/tool-report.tsx` — same missing `SiLinkedin` import, plus the LinkedIn button was rendering the Facebook icon. Both fixed.
- **1 file** (`tsconfig.json`) has functionally equivalent reordering of `moduleResolution` + an added `target: ESNext`. Left alone.

## TypeScript verification

Ran `tsc --noEmit --project tsconfig.json` after all changes:

- **0 errors in any file I touched.**
- 175 total errors remain in the project, all of which are pre-existing tech debt (missing `@types/*` packages, the `// @ts-nocheck` files now visible, and some loose typing). These are unchanged by this restore.

---

## Follow-up backlog (recommended next sessions)

In priority order:

1. **Finish Batch A**: fill in the four Supabase/DB env values and rotate the service_role key. Nothing else matters until the DB connects.
2. **Run `npm install`** so the new `@vitest/coverage-v8` and `@types/supertest` deps actually land.
3. **Decide on Render architecture** — single Web Service vs Web Service + Static Site. If single, restore the `serveStatic` body in `server/static.ts`. If two, the stub is correct; verify Render Static Site is wired to `vite build` output.
4. **Decide on `index.js` / `server-prod.ts`** — confirm Render's start command and delete the unused stubs.
5. **Pick away at the 46 `// @ts-nocheck` files**. Each one is a few minutes of fixing real or trivial type errors; the silenced check hides real bugs.
6. **Optional: restore `auth/routes.ts` rich features** — Zod input validation, activity log writes, websocket broadcasts on new user/stats, Supabase user sync. These exist in the original Replit version.
7. **Standardize on `bcryptjs`** (already in `package.json`) or `bcrypt`, not both. Currently `replitAuth.ts` dynamic-imports `bcryptjs` (works because `bcrypt` is also installed as a fallback) while `auth/routes.ts` static-imports `bcrypt`. Pick one; remove the other from `package.json`.
8. **Remove `redeploy.txt`** when you're ready to stop hand-bumping Render redeploys.
