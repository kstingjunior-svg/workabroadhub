#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// type-ratchet.mjs — fail CI if TypeScript errors INCREASE.
//
// Problem: strict tsc reports ~430 pre-existing errors (~164 server + ~265
// client). Un-muting the build entirely would block every push until each is
// fixed. Muting entirely (the previous state) lets NEW errors slip in silently
// — that's how the 5 crash bugs found by npm run type-check:server got there.
//
// Solution: snapshot the current error set as a baseline. On every run,
// compare current errors to baseline:
//
//   - Any error present now but NOT in baseline  → NEW ERROR → fail
//   - Any error in baseline but NOT present now  → error was fixed → note it
//   - Everything else stays green
//
// The dev fixes bugs at their own pace. When they've fixed some, they run:
//   npm run type-ratchet:save
// ...to lock in the improvement so it can never regress.
//
// Errors are compared by (file, code, message) — NOT by (line, col) which
// change on every edit. This means moving a broken line up or down inside its
// file doesn't trip the ratchet, but a new error in the SAME file DOES.
//
// USAGE:
//   node scripts/type-ratchet.mjs            # gate — exit 1 on regression
//   node scripts/type-ratchet.mjs --save     # snapshot current as baseline
//
// Wired into:
//   package.json: type-ratchet + type-ratchet:save
//   .github/workflows/ci.yml (blocking job — replaces report-only type-check)
// ─────────────────────────────────────────────────────────────────────────────

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const BASELINE_PATH = path.join(ROOT, ".type-ratchet.json");
const SAVE_MODE = process.argv.includes("--save");

const PROJECTS = [
  { name: "server", tsconfig: "tsconfig.server.json" },
  { name: "client", tsconfig: "tsconfig.json" },
];

// Parse a tsc error line into a stable identity.
// Example line:
//   server/routes.ts(8569,15): error TS2304: Cannot find name 'payments'.
// We drop line/col — they shift with every edit — and keep (file, code, msg).
const ERROR_RE = /^([^\s(].*?)\((\d+),(\d+)\):\s+error\s+(TS\d+):\s+(.*)$/;

function collectErrors(tsconfig) {
  const res = spawnSync("npx", ["tsc", "--noEmit", "--project", tsconfig], {
    cwd: ROOT,
    encoding: "utf8",
    // tsc writes errors to stdout, not stderr, and returns non-zero. We
    // want to always keep parsing regardless of exit code.
    maxBuffer: 50 * 1024 * 1024,
  });
  const raw = (res.stdout || "") + (res.stderr || "");
  const errors = new Set();
  for (const line of raw.split(/\r?\n/)) {
    const m = ERROR_RE.exec(line.trim());
    if (!m) continue;
    // Normalise path separators so Windows and Linux runs agree.
    const file = m[1].replace(/\\/g, "/");
    const code = m[4];
    const msg = m[5].trim();
    errors.add(`${file}|${code}|${msg}`);
  }
  return errors;
}

function loadBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"));
  } catch {
    console.error(`[type-ratchet] baseline file at ${BASELINE_PATH} is not valid JSON.`);
    process.exit(2);
  }
}

function saveBaseline(counts) {
  const payload = {
    _comment:
      "Snapshot of TypeScript errors accepted by CI. Do NOT hand-edit — regenerate with `npm run type-ratchet:save` after fixing errors. See scripts/type-ratchet.mjs.",
    updatedAt: new Date().toISOString(),
    ...counts,
  };
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(payload, null, 2) + "\n");
}

// ── Collect ────────────────────────────────────────────────────────────────
console.log("[type-ratchet] collecting TypeScript errors — this takes ~60s…");
const current = {};
for (const { name, tsconfig } of PROJECTS) {
  console.log(`[type-ratchet]   ${name}: tsc --noEmit -p ${tsconfig}`);
  current[name] = Array.from(collectErrors(tsconfig)).sort();
  console.log(`[type-ratchet]   ${name}: ${current[name].length} error(s)`);
}

// ── Save mode ──────────────────────────────────────────────────────────────
if (SAVE_MODE) {
  saveBaseline(current);
  console.log("");
  console.log(`[type-ratchet] ✅ baseline saved to .type-ratchet.json`);
  console.log(`[type-ratchet]    server: ${current.server.length}, client: ${current.client.length}`);
  console.log(`[type-ratchet]    commit this file so CI accepts the new lower bar.`);
  process.exit(0);
}

// ── Gate mode ──────────────────────────────────────────────────────────────
const baseline = loadBaseline();
if (!baseline) {
  console.log("");
  console.log("[type-ratchet] no baseline found — treating as first run.");
  console.log("[type-ratchet] run `npm run type-ratchet:save` to snapshot the current error set.");
  process.exit(0);
}

let anyRegression = false;
for (const { name } of PROJECTS) {
  const currentSet = new Set(current[name]);
  const baselineSet = new Set(baseline[name] || []);
  const added = [...currentSet].filter((e) => !baselineSet.has(e));
  const fixed = [...baselineSet].filter((e) => !currentSet.has(e));

  console.log("");
  console.log(`[type-ratchet] ${name}: current=${currentSet.size}  baseline=${baselineSet.size}  new=${added.length}  fixed=${fixed.length}`);

  if (added.length) {
    anyRegression = true;
    console.log("");
    console.log(`  ❌ NEW ${name.toUpperCase()} ERRORS (regression — fix these):`);
    for (const e of added) {
      const [file, code, msg] = e.split("|");
      console.log(`      ${file}: ${code}: ${msg}`);
    }
  }
  if (fixed.length) {
    console.log("");
    console.log(`  ✨ ${fixed.length} ${name} error(s) were FIXED since baseline — lock it in with:`);
    console.log(`      npm run type-ratchet:save`);
  }
}

if (anyRegression) {
  console.log("");
  console.log("[type-ratchet] ❌ FAIL — new type errors introduced. See list above.");
  process.exit(1);
}

console.log("");
console.log("[type-ratchet] ✅ pass — no new errors.");
