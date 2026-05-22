# WorkAbroadHub — Final Repair Patch

**Date:** 2026-05-22
**Source:** `F:\DOWNLOADS\WorkAbroadHub (3)\WorkAbroadHub` (original Replit)
**Target:** `C:\Users\Twd\Desktop\workabroadhub_clean` (current Render/Supabase)

This document is the single definitive reference. It supersedes `MIGRATION_AUDIT.md`
and `MIGRATION_RESTORE_SUMMARY.md`. Everything below is the *applied* state of
the repair; PowerShell verification commands and remaining manual actions are at
the end.

---

## 1. Files to copy from original — ALREADY DONE

Only one directory tree needed restoring from `F:\DOWNLOADS\WorkAbroadHub (3)\WorkAbroadHub`:

- `tests/` — all 22 test files (api, compliance, integration, payment, performance, real-routes, security, unit) plus `app-factory.ts`, `setup.ts`, `test-app.ts`. Copied via `cp -r` during Batch F.

PowerShell to re-copy if you ever need to redo:

```powershell
Copy-Item -Path 'F:\DOWNLOADS\WorkAbroadHub (3)\WorkAbroadHub\tests' `
          -Destination 'C:\Users\Twd\Desktop\workabroadhub_clean\tests' `
          -Recurse -Force
```

**No other files need to be copied from the original.** Everything else is either:
(a) Identical between both folders (498 files), (b) intentionally rewritten during
migration (the auth files, build script, etc.), or (c) Replit-only and excluded.

---

## 2. Files merged manually — ALREADY DONE

Listed in the order they were applied. All these files combine the migration's
correct decisions with restored functionality from the original.

| File | What was merged | Lines (orig→curr now) |
|---|---|---|
| `server/index.ts` | Kept the migration's Render-friendly structure (listen-first, dynamic imports), restored 5 missing boot subsystems: `seedFraudDetectionRules` / `seedVisaJobs` / `seedUsaVisaJobs` / `ensureIndexes` / `syncNeaAgencies` / `deduplicateNeaAgencies` / `syncServicePrices` calls, `initSecurityMonitor()`, `registerQueueHandlers()`, Firebase RTDB error mirror in global error handler | 1374 → 528 (correct: most original lines were Replit-OIDC setup) |
| `server/db.ts` | Kept the migration's `pg` driver switch (fixed a Drizzle Date-binding bug), restored `getPoolStats()`, `withTransaction()` with deadlock retry, pool monitoring + warnings, configurable `DB_POOL_MAX`/`DB_POOL_MIN` env vars, `pool.on("error"/"connect")` handlers | 107 → 97 |
| `server/lib/openai.ts` | Restored `askGPT()` function (used 10x in `routes.ts` via dynamic import — was undefined). Removed the dangerous `\|\| "sk-test"` fallback that silently used a fake API key. Removed `// @ts-nocheck` | 18 → 23 |
| `server/services/whatsapp.ts` | Restored `sendWhatsApp()` function (used by 5 modules statically — they all failed to load before). Kept the migration's conditional Twilio init pattern (no-op when env vars missing) | 30 → 51 |
| `server/replit_integrations/auth/replitAuth.ts` | Kept the entire migration rewrite (Replit OIDC → email/password with bcryptjs + express-session + sameSite cookie fix). Deleted the duplicate dead `registerAuthRoutes` function. Added missing `export` to `getSession()` | 274 → 74 |
| `server/replit_integrations/auth/routes.ts` | Kept the migration's email+password routes (your post-migration commits include forgot-password, reset-password, stale session destruction). Bumped bcrypt rounds 10→12 (backward-compatible). Removed `REPLIT_DOMAINS` fallback from `appBaseUrl()` | 453 → 207 |
| `server/static.ts` | **Restored from original** — the migration's stub was incompatible with single-Render-Web-Service architecture. Now serves `dist/public/` with cache-Control headers + SPA fallback | 5 → 43 |
| `server/mpesa.ts` | Removed `REPLIT_DOMAINS` fallback in `getCallbackBaseUrl()`; rely on `MPESA_CALLBACK_URL` or `APP_URL` | (small in-place edit) |
| `server/routes.ts` | Removed 3 `REPLIT_DOMAINS` references (callback URL builder + admin debug endpoint) | (small in-place edits) |
| `server/security.ts` | Removed `REPL_SLUG ?? REPL_ID` check in `httpsEnforced` detector; rely on `NODE_ENV === "production"` (Render sets it automatically) | (one-line edit) |
| `client/src/components/report-share-bar.tsx` | Added `FaLinkedin` import from `react-icons/fa`, swapped `SiLinkedin` JSX usage (Simple Icons removed LinkedIn in v5.4.0) | (two-line edit) |
| `client/src/pages/tools/tool-report.tsx` | Same `FaLinkedin` fix as above, plus fixed the LinkedIn share button that was rendering `<SiFacebook>` | (three-line edit) |
| `package.json` | See section 5 below — full rewrite with corrected deps + new scripts + engines field | 170 → 178 |
| `client/src/hooks/use-premium.ts` | Renamed from `use-premium.ts.txt` (had stray `.txt` suffix). File is unused by any other file; left intact for if/when you wire it up | (renamed) |
| `.env` | Fixed corrupt `MPESA_CONSUMER_SECRET` line, added placeholders + comments for `DATABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, added `APP_URL` and `ADDITIONAL_CORS_ORIGINS` | (full rewrite) |

PowerShell to verify all merges are in place:

```powershell
cd C:\Users\Twd\Desktop\workabroadhub_clean
node -e "['db','lib/openai','services/whatsapp','static','index'].forEach(m => { try { require.resolve('./server/' + m + '.ts'); console.log('  exists: server/' + m + '.ts'); } catch(e) { console.log('  MISSING: server/' + m + '.ts'); } })"
Select-String -Path 'server\db.ts' -Pattern 'export function (getPoolStats|withTransaction)'
Select-String -Path 'server\lib\openai.ts' -Pattern 'export async function askGPT'
Select-String -Path 'server\services\whatsapp.ts' -Pattern 'export async function sendWhatsApp'
Select-String -Path 'server\static.ts' -Pattern 'express.static'
```

---

## 3. Files deleted because they were broken migration artifacts — ALREADY DONE

| File | Reason |
|---|---|
| `(`, `8`, `Running`, `void`, `{` (5 zero-byte files in repo root) | Accidental PowerShell redirection artifacts |
| `server/server.js` | Empty file (0 bytes) |
| `server/services/SUM_risk_points_.code-search` | VS Code "Find in Files" save artifact |

PowerShell to re-delete if any reappear:

```powershell
cd C:\Users\Twd\Desktop\workabroadhub_clean
Remove-Item -LiteralPath '(', '8', 'Running', 'void', '{' -ErrorAction SilentlyContinue
Remove-Item 'server\server.js' -ErrorAction SilentlyContinue
Remove-Item 'server\services\SUM_risk_points_.code-search' -ErrorAction SilentlyContinue
```

### Probable orphans — DELETE AFTER CONFIRMING RENDER START COMMAND

These two were created during your Render debugging and are likely not referenced
anywhere. Render's "Start Command" in the dashboard determines if they matter:

| File | Status | Action |
|---|---|---|
| `index.js` (repo root, 22-line "hello world" stub) | Not referenced by `package.json` `start` script | Delete if Render → Settings → Start Command says `npm start` or `node dist/server/index.js` |
| `server/server-prod.ts` (47-line minimal Express stub) | Not referenced by `package.json` `build` or `start` | Delete in same case |
| `redeploy.txt` | Render "touch this to trigger redeploy" marker | Keep if you still use this pattern, else delete |

PowerShell to delete after you confirm:

```powershell
cd C:\Users\Twd\Desktop\workabroadhub_clean
# Only run this block AFTER verifying Render Start Command points to npm start / node dist/server/index.js
Remove-Item 'index.js' -Force
Remove-Item 'server\server-prod.ts' -Force
# Remove-Item 'redeploy.txt' -Force   # only if you've moved off the touch-file pattern
```

---

## 4. Replit-only files — DO NOT RESTORE

These exist in the original but are correctly absent from current. **Never copy them back.**

| Original path | Why we exclude it |
|---|---|
| `.replit` | Replit runtime config; meaningless on Render |
| `script/` directory | Empty after removing `build.ts` |
| `script/build.ts` | Replit-specific build wrapper; replaced by `vite build && tsc --project tsconfig.server.json` |
| `.agents/` directory | Replit IDE/agent state |
| `.config/` directory | Replit IDE config |
| `.local/` directory | Replit cache |
| `.upm/` (if present in any extract) | Replit Universal Package Manager state |

### Replit-only packages — already removed from `package.json`

- `@replit/vite-plugin-cartographer`
- `@replit/vite-plugin-dev-banner`
- `@replit/vite-plugin-runtime-error-modal`

(All three were unused by `vite.config.ts` after the migration; we removed them
from `devDependencies` in section 5.)

### Replit-only code — already replaced

| Old reference | Where it was | Replacement |
|---|---|---|
| `process.env.REPLIT_DOMAINS` | server/index.ts CORS list | `process.env.ADDITIONAL_CORS_ORIGINS` (comma-separated) |
| `process.env.REPLIT_DOMAINS` | server/mpesa.ts callback base URL | `process.env.APP_URL` |
| `process.env.REPLIT_DOMAINS` | server/replit_integrations/auth/routes.ts password reset email base URL | `process.env.APP_URL` + hardcoded production fallback |
| `process.env.REPLIT_DOMAINS` | server/routes.ts (3 spots: callback URL + admin debug endpoint) | `process.env.APP_URL` |
| `process.env.REPL_SLUG ?? process.env.REPL_ID` | server/security.ts HTTPS-enforced detector | `process.env.NODE_ENV === "production"` |

### Intentionally left alone

- `server/sms.ts` lines 35-55 still reference `REPLIT_CONNECTORS_HOSTNAME` and `REPL_IDENTITY` as a Twilio credential fallback path. On Render these env vars are never set, so the `if (hostname && xReplitToken)` block silently no-ops. Removing it would require restructuring the credential lookup flow — not worth the risk. **Leave alone.**

---

## 5. Corrected `package.json`

Already applied (178 lines, valid JSON, 23 `@types/*` packages in devDeps, no `@replit/*`, no vestigial `postgres`, `engines.node` set, `db:migrate` + `test:*` scripts added).

The exact contents are in your `package.json` on disk. You can re-validate at any time:

```powershell
cd C:\Users\Twd\Desktop\workabroadhub_clean
node -e "const p = JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('Valid. Scripts:', Object.keys(p.scripts).join(', '))"
```

**Key facts to remember:**

- `"type": "commonjs"` — correct because the compiled server (`dist/server/`) is CommonJS; `tsx` handles ESM source files in dev
- `"engines.node": ">=20.18.0"` — Render reads this automatically
- 4 scripts that matter for Render: `build`, `start`, `db:migrate`, `db:push`
- `bcrypt` AND `bcryptjs` both kept — `bcrypt` (with `@types/bcrypt`) is what live code uses; `bcryptjs` is a defensive shim

---

## 6. Render build / start settings

### Use this OR a `render.yaml`

A `render.yaml` Blueprint file is already at the repo root. If you deploy via
Blueprint, Render reads it automatically. If you deploy manually via the
dashboard, use these values:

| Setting | Value |
|---|---|
| Service type | Web Service |
| Runtime | Node |
| Build Command | `npm ci && npm run build` |
| Start Command | `npm start` |
| Health Check Path | `/api/health` |
| Node Version | (auto from `package.json` engines, or set `NODE_VERSION=20.18.0`) |
| Auto-Deploy | On (recommended) |
| Plan | Starter or higher (Free plan sleeps after 15 min idle, which breaks background jobs) |

**One-app architecture:** the Express server (compiled to `dist/server/index.js`)
serves both the API at `/api/*` and the React SPA at every other route via
`server/static.ts` reading from `dist/public/`. Do NOT split into Web + Static
Site — the current code is wired for the single-service mode.

PowerShell to verify your local build works before pushing:

```powershell
cd C:\Users\Twd\Desktop\workabroadhub_clean
npm ci
npm run build
Test-Path dist\public\index.html       # should be True
Test-Path dist\server\index.js         # should be True
```

---

## 7. Supabase environment variables

### `.env` (local dev — already has placeholders + comments)

Required values you must fill in:

```
DATABASE_URL=<Supabase → Settings → Database → Connection string → Session pooler>
SUPABASE_URL=https://pvsxecrqfexgwspuqvlp.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<newly rotated key — do NOT use the old one>
SUPABASE_ANON_KEY=<anon public key from Supabase → Settings → API>
VITE_SUPABASE_URL=https://pvsxecrqfexgwspuqvlp.supabase.co
VITE_SUPABASE_ANON_KEY=<same anon public key — NOT service_role>
SESSION_SECRET=<any long random string for express-session signing>
```

### Critical action: rotate the leaked service_role key

Go to Supabase Dashboard → Settings → API → "Reset service_role key". The old
one was previously shipped in your `VITE_SUPABASE_ANON_KEY` env (it decoded to
`"role":"service_role"`), so it leaked to every browser that loaded the site.

### Why three "URL" vars and two "anon" vars

- `SUPABASE_URL` — backend (`server/supabaseClient.ts`) — has fallback to hardcoded
- `VITE_SUPABASE_URL` — frontend (`client/src/lib/supabase.ts`) — required by Vite bundle
- `SUPABASE_SERVICE_ROLE_KEY` — backend only; bypasses RLS for trusted server writes
- `SUPABASE_ANON_KEY` — backend fallback if no service_role configured
- `VITE_SUPABASE_ANON_KEY` — frontend (browser); MUST be the anon key, never service_role

### Render dashboard — paste the same values

In Render → Service → Environment, add every variable from `.env` (without comments).
The `render.yaml` already declares each one with `sync: false` so Render prompts you
on first Blueprint deploy.

---

## 8. Code changes that replaced Replit-specific logic — ALL APPLIED

Summary table — every change is already on disk:

| File | Before | After |
|---|---|---|
| `server/index.ts` | `...(process.env.REPLIT_DOMAINS?.split(",").map(d => \`https://${d}\`) || [])` in CORS list | `...(process.env.ADDITIONAL_CORS_ORIGINS?.split(",").map(o => o.trim()).filter(Boolean) || [])` |
| `server/mpesa.ts` `getCallbackBaseUrl()` | Fallback to `REPLIT_DOMAINS` after `APP_URL` | Just `APP_URL`, then localhost dev fallback |
| `server/replit_integrations/auth/routes.ts` `appBaseUrl()` | Fallback chain APP_URL → REPLIT_DOMAINS → hardcoded | APP_URL → hardcoded |
| `server/routes.ts` (M-Pesa callback URL builder) | `${APP_URL || \`https://${REPLIT_DOMAINS.split(",")[0]}\`}/api/mpesa/callback` | `${APP_URL || "https://workabroadhub.tech"}/api/mpesa/callback` |
| `server/routes.ts` (`/api/admin/mpesa/callback-url` debug endpoint) | Returned `replitDomains` field and "(not set — using REPLIT_DOMAINS fallback)" message | Returns just `appUrl` with "(not set — set APP_URL in Render env vars)" message |
| `server/security.ts` `httpsEnforced` | `NODE_ENV === "production" \|\| Boolean(REPL_SLUG ?? REPL_ID)` | `NODE_ENV === "production"` |

Plus the auth rewrite which the migration did correctly and we kept:

| Original | Current |
|---|---|
| `openid-client` + Replit OIDC (`https://replit.com/oidc`) | `bcrypt` + email/password + `express-session` backed by Postgres `sessions` table |
| Required `REPL_ID`, `ISSUER_URL` | Requires `SESSION_SECRET` only |

---

## What you still need to do (the only remaining blockers)

Nothing in this list is code work — it's all values + dashboard actions.

1. **Supabase Dashboard → Settings → API → Reset service_role key.** Mandatory.
2. **Fill `.env`** with the rotated service_role key, the anon public key, and the real `DATABASE_URL` (Session Pooler form from Supabase → Database → Connection string).
3. **Mirror those values in Render** → Service → Environment.
4. **Confirm Render Start Command** in the dashboard. If it's `npm start` (or `node dist/server/index.js`), delete `index.js` and `server/server-prod.ts` (see section 3 cleanup commands).
5. **Push to git** including `render.yaml`. Deploy.
6. **Smoke test:**
   - `GET https://workabroadhub.onrender.com/api/health` → 200 OK
   - `GET https://workabroadhub.onrender.com/` → React SPA renders
   - Try a sign-up + login flow
   - Try an M-Pesa STK push if M-Pesa is configured

When all six are done, the Replit → Supabase/Render migration repair is fully complete.
