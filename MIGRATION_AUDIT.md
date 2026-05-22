# WorkAbroadHub — Migration Audit Report

**Date:** 2026-05-22
**Original (Replit):** `F:\DOWNLOADS\WorkAbroadHub (3)\WorkAbroadHub`
**Current (migrated):** `C:\Users\Twd\Desktop\workabroadhub_clean`

---

## Executive summary

The migration kept the code on disk but **silently disconnected major subsystems**. The files for queues, schedulers, license enforcement, security monitoring, STK push recovery, and database seeding all still exist in `server/` — they just aren't called anymore because `server/index.ts` was stripped from 1374 lines down to 479. The `.env` file is also broken in two important ways that almost certainly explain runtime failures (M-Pesa auth and the database connection).

There are 24 files missing in current, 18 extra, and 74 changed. After classification, only a handful of changes are real regressions; the rest are either intentional migration work, cosmetic, or junk artifacts.

---

## CRITICAL issues (likely broken right now)

### C1. `.env` file is corrupted

Line 4 of `.env`:

```
MPESA_CONSUMER_cYmGfAOnlmE5Sv0uxjfCtuAceTqBlOuGXdNukC6QG3j7DJ5ARscrAoQIgEsTqnCA
```

The `SECRET=` portion of the variable name was eaten. This should be:

```
MPESA_CONSUMER_SECRET=cYmGfAOnlmE5Sv0uxjfCtuAceTqBlOuGXdNukC6QG3j7DJ5ARscrAoQIgEsTqnCA
```

**Impact:** `MPESA_CONSUMER_SECRET` is undefined at runtime → every M-Pesa STK push call fails to authenticate.

### C2. `DATABASE_URL` is the Supabase REST URL, not a Postgres connection string

```
DATABASE_URL=https://pvsxecrqfexgwspuqvlp.supabase.co/rest/v1/
```

`server/db.ts` uses `pg.Pool`, which needs a `postgres://...` connection string. The current value is the Supabase REST API base. The pool will fail to connect or silently produce errors on every query.

**Fix:** replace with the Supabase Postgres connection string (Session Pooler form recommended for serverless/Render):

```
DATABASE_URL=postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
```

Get the exact string from Supabase → Project Settings → Database → Connection string → "Session pooler".

### C3. `VITE_SUPABASE_ANON_KEY` is actually the `service_role` key — major security hole

The JWT payload in line 10 decodes to `"role":"service_role"`. The `VITE_` prefix means Vite bundles this into every browser build, so any visitor to the site gets full database access bypassing all Row Level Security.

**Fix:**
1. **Immediately rotate** the service role key in Supabase (Project Settings → API → Reset service_role key) since it's already shipped in client bundles.
2. Replace the env var with the real **anon (public) key** from Supabase → Project Settings → API.
3. If you need the service_role key on the server, store it as `SUPABASE_SERVICE_ROLE_KEY` (no `VITE_` prefix) so it stays server-side.

### C4. `server/index.ts` lost ~895 lines — major subsystems are no longer initialized at boot

Original imported and started:

- `seedDatabase`, `promoteFirstUserToAdmin`, `seedStudentVisas`, `seedApplicationPacks`, `seedFraudDetectionRules`, `seedVisaJobs`, `seedUsaVisaJobs`, `seedPlans`, `ensureIndexes`, `syncNeaAgencies`, `deduplicateNeaAgencies`, `syncServicePrices` (from `./seed`)
- `startLicenseChecker` (from `./license-checker`)
- `initSecurityMonitor`, `trackSecurityEvent` (from `./security`)
- `asyncQueue`, `registerQueueHandlers` (from `./queue`)
- `startStkRecoveryPoller` (from `./stk-recovery`)
- `startPortalHealthChecker` (from `./portal-health-checker`)
- `logErrorToFirebase` (from `./services/firebaseRtdb`)

All of these source files still exist in `server/`. None are imported or called from current `server/index.ts`. Effect on the running app:

| Subsystem               | Symptom you'd see                                                       |
|-------------------------|-------------------------------------------------------------------------|
| Seed/sync on boot       | Empty plans, missing visa data, no NEA agencies, no service prices      |
| License checker         | Expired/invalid licenses not enforced                                   |
| Security monitor        | No anomaly detection, no security event tracking                        |
| Async queue + handlers  | Background jobs never run (CV processing, emails, fraud checks, etc.)   |
| STK recovery poller     | Stuck/orphaned M-Pesa transactions never reconciled                     |
| Portal health checker   | Government portal outages go undetected                                 |
| Firebase error logging  | Server errors not centrally captured                                    |

### C5. `server/db.ts` lost ~78 lines — pool monitoring, retry, and `withTransaction` helper gone

Current `db.ts` is a 29-line minimal version:

```ts
export const pool = new Pool({ ssl: { rejectUnauthorized: false } });
```

Lost from original:
- Pool size config via `DB_POOL_MAX` / `DB_POOL_MIN` env vars
- Idle/connection/statement timeouts
- Pool statistics + `getPoolStats()` for monitoring
- `pool.on("error")` / `pool.on("connect")` handlers
- **`withTransaction()` helper with automatic deadlock retry** — if any code in the rest of the app imports this, it'll be a runtime ReferenceError

Need to grep for callers of `withTransaction` / `getPoolStats` to know if restoring is urgent.

---

## HIGH-priority issues

### H1. Junk zero-byte files in repo root

Created by accidental PowerShell redirections. Safe to delete:

```
C:\Users\Twd\Desktop\workabroadhub_clean\(
C:\Users\Twd\Desktop\workabroadhub_clean\8
C:\Users\Twd\Desktop\workabroadhub_clean\Running
C:\Users\Twd\Desktop\workabroadhub_clean\void
C:\Users\Twd\Desktop\workabroadhub_clean\{
```

### H2. Render-debug scaffolding files that aren't doing anything useful

- `index.js` (root) — a 22-line "hello world" Express server that listens on PORT 10000. Not referenced by `package.json` scripts. Probably a leftover from when you were debugging Render startup. **Safe to delete.**
- `server/server.js` — **empty file** (0 bytes). Delete.
- `server/server-prod.ts` — a 47-line minimal Express stub with `/health` and `/` only. Not your real server. If Render's start command points to this, you're shipping a stub instead of the real app. **Delete unless something references it.**

### H3. Entire `tests/` directory missing (22 files)

Lost test coverage for: auth bypass, IDOR, rate limiting, M-Pesa, payments, referrals, security routes, integration, performance, and compliance. None are needed for production runtime but losing them means no guard against future regressions.

```
tests/api/payments.test.ts
tests/api/referrals.test.ts
tests/app-factory.ts
tests/compliance/policy.test.ts
tests/integration/api-auth.test.ts
tests/integration/api-payments.test.ts
tests/integration/mpesa-webhook.test.ts
tests/integration/roles-permissions.test.ts
tests/integration/security.test.ts
tests/payment/mpesa.test.ts
tests/performance/high-concurrency.test.ts
tests/performance/high-load.test.ts
tests/performance/load.test.ts
tests/real-routes/auth-routes.test.ts
tests/real-routes/payment-routes.test.ts
tests/real-routes/security-routes.test.ts
tests/security/auth-bypass.test.ts
tests/security/idor.test.ts
tests/security/rate-limiting.test.ts
tests/setup.ts
tests/test-app.ts
tests/unit/auth.test.ts
```

Restoring them also needs `@vitest/coverage-v8` and `@types/supertest` back in `devDependencies`.

### H4. `server/replit_integrations/auth/` was halved

| File                                          | Original | Current | Lost |
|-----------------------------------------------|----------|---------|------|
| `replit_integrations/auth/routes.ts`          | 453      | 207     | 246  |
| `replit_integrations/auth/replitAuth.ts`      | 274      | 122     | 152  |

This is the live auth system (still imported by `server/routes.ts` and `server/routes/ai.ts`). Need a focused diff review to see whether the removed lines were Replit-specific (Replit OAuth) or general auth logic (passport, session, password reset, etc.).

### H5. `server/migrate-payments.ts` lost 68 lines

Likely lost migration steps. If a Render deploy ever re-runs this, it'll be partial.

### H6. `server/static.ts` lost 26 of 31 lines

Down to 5 lines. Static-file serving may be too minimal for the production layout. Needs review.

---

## Things the migration did RIGHT — keep them

These additions/changes are correct and should not be reverted:

| Change                                                    | Reason to keep                                       |
|-----------------------------------------------------------|------------------------------------------------------|
| `package.json` script `build: vite build && tsc -p tsconfig.server.json` | Standard, no Replit dep on `script/build.ts`        |
| `package.json` script `dev: cross-env NODE_ENV=...`        | Works on Windows                                     |
| Added deps: `cross-env`, `dotenv`, `bcryptjs`, `postgres`  | Cross-platform / Render-friendly                     |
| New `tsconfig.server.json`                                 | Separate server build for Render                     |
| `migrations/0002_slow_gravity.sql` + meta snapshots        | New Supabase migrations                              |
| `vite.config.ts` — Replit plugins removed, `fileURLToPath` used | Replit-only stuff gone, runs on any Node            |
| `.gitignore` expanded                                      | Properly ignores `.env`, `.local/`, logs            |
| `server/db.ts` switch from `postgres-js` to `pg`           | Original commit notes a Drizzle Date-binding bug fix |

## Things the migration correctly omitted — do NOT restore

| Item                            | Why skip                                  |
|---------------------------------|-------------------------------------------|
| `.replit`                       | Replit runtime config, irrelevant on Render |
| `.agents/`, `.config/`, `.local/` | Replit IDE/agent state                  |
| `.upm/` (in original .gitignore) | Replit package manager                   |
| `script/build.ts` (singular)    | Replit-specific build wrapper; replaced by `vite build && tsc` |
| `@replit/vite-plugin-*`         | Already removed from `vite.config.ts`     |
| Heliumdb / `REPLIT_DOMAINS` references | Replace with Supabase + Render env vars |

---

## Proposed restoration batches

Each batch is independent and reversible. **Nothing applied until you approve the batch.**

### Batch A — Critical env fixes (zero file changes; you do these in `.env` and Render dashboard)

1. Fix line 4 of `.env`: rename `MPESA_CONSUMER_cYmGfA...` → `MPESA_CONSUMER_SECRET=cYmGfA...`
2. Replace `DATABASE_URL` with the real Supabase Postgres connection string (Session pooler)
3. **Rotate the Supabase service_role key in the Supabase dashboard** (it's been shipped to browsers)
4. Replace `VITE_SUPABASE_ANON_KEY` with the actual anon key
5. If server code needs service_role, add `SUPABASE_SERVICE_ROLE_KEY=...` (no `VITE_` prefix)
6. Mirror the same fixes in Render → Environment

**I can pre-fill an updated `.env` once you give me the correct values (or confirm I should leave secrets blank for you to fill).**

### Batch B — Cleanup (delete junk, low risk)

Delete:
- `(`, `8`, `Running`, `void`, `{` (zero-byte garbage in repo root)
- `server/server.js` (empty file)
- `redeploy.txt` (looks like an old Render "touch-this-to-redeploy" marker; confirm before deleting)
- `client/src/hooks/use-premium.ts.txt` (`.txt` suffix looks accidental — confirm rename to `.ts` or delete)

Confirm before deleting:
- `index.js` (root, 22-line stub) — only if Render's start command does NOT point to it
- `server/server-prod.ts` — only if Render's start command does NOT point to it
- `server/services/SUM_risk_points_.code-search` (VS Code search artifact)

### Batch C — Restore boot subsystems in `server/index.ts` (the big one)

Re-introduce the missing imports and startup calls so seed, queue, license checker, security monitor, STK recovery, portal health checker, and Firebase error logging actually run. This is the single change with the biggest functional impact. I'll preserve all the current improvements (process-level error handlers, structured shutdown, DB audit) and **graft the missing boot logic back in around them** rather than wholesale replacing.

Risk: medium. Each restored subsystem may need its own env vars to function (e.g. Firebase credentials for error logging). I'll list every new env var the restore introduces before applying.

### Batch D — Restore `server/db.ts` enhancements

Bring back: configurable pool size via env, statement/idle timeouts, pool stats + `getPoolStats`, `pool.on(...)` handlers, and `withTransaction()` deadlock-retry helper. Keep the current `pg`-driver choice and the `ssl: { rejectUnauthorized: false }` setting (needed for Supabase pooler).

Risk: low. Pure additions; existing imports keep working.

### Batch E — Restore `server/replit_integrations/auth/` (focused diff review)

Walk you through what was removed in `routes.ts` (−246 lines) and `replitAuth.ts` (−152 lines) so we can decide line-by-line whether the removal was correct (Replit OAuth removal) or accidental (lost passport/local strategy, reset flow, etc.). No changes until each removed block is classified.

Risk: medium. Touching auth is sensitive.

### Batch F — Restore `tests/` directory (22 files)

Copy the entire `tests/` tree from the original. Re-add `@vitest/coverage-v8` and `@types/supertest` to `devDependencies`. Add a `test` script to `package.json`. Tests will need their own setup env (test DB URL) which I'll document.

Risk: very low. Doesn't touch runtime.

### Batch G — Spot-check the 60+ "1-line-off" file diffs

Most are probably trailing newlines / BOM / line-ending changes. I'll script a check and report any that are actually substantive before touching them.

Risk: very low.

### Batch H — Focused review of remaining server file diffs

`server/migrate-payments.ts` (−68), `server/static.ts` (−26), `server/services/whatsapp.ts` (−18), `server/lib/openai.ts` (−10), etc. Diff each, classify each lost block as Replit-only / safe-to-restore / needs-discussion, and present.

---

## What I need from you to proceed

For each batch above, tell me **apply / skip / show me the diff first**. The recommended order is **A → B → C → D → E → F → H → G**, but they're independent so any order works.

For Batch A specifically I also need:
- The correct Supabase Postgres connection string (or permission to fetch it for you if your Supabase MCP is connected)
- Confirmation that you want to rotate the leaked service_role key (strongly recommended)
