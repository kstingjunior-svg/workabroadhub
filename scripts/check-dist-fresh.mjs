#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// check-dist-fresh.mjs — verify committed dist/server/ matches what tsc would
// emit from current source.
//
// WHY THIS EXISTS:
//   Render runs the COMMITTED dist/server/*.js files (the package.json build
//   command + Render dashboard skip server tsc). If your source moves but
//   dist/ doesn't, the deployed code is silently a month stale. This script
//   detects that BEFORE the push, not 30 minutes after deploy.
//
// HOW IT WORKS:
//   1. tsc emits the server bundle to a throwaway directory (.dist-check/).
//   2. We diff every file in .dist-check/server vs dist/server.
//   3. If any pair differs, we print the file list and fail with exit 1.
//   4. Cleanup the temp dir on success or failure.
//
// USAGE:
//   npm run check:dist
//   node scripts/check-dist-fresh.mjs
//
// Wired into the pre-push git hook (scripts/install-git-hooks.mjs).
// To fix a failure:
//   npx tsc --project tsconfig.server.json
//   git add dist/server
//   git commit -m "rebuild dist"
// ─────────────────────────────────────────────────────────────────────────────

import { execSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const ROOT = process.cwd();
const TMP_DIR = path.join(ROOT, ".dist-check");
const COMMITTED_DIST = path.join(ROOT, "dist", "server");

function cleanup() {
  try { fs.rmSync(TMP_DIR, { recursive: true, force: true }); } catch {}
}

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walk(full));
    else if (ent.isFile()) out.push(full);
  }
  return out;
}

// ── Run tsc to a temp dir ────────────────────────────────────────────────────
cleanup();
console.log(`[check-dist] compiling source -> ${TMP_DIR} ...`);

const tscArgs = [
  "tsc",
  "--project", "tsconfig.server.json",
  "--outDir", TMP_DIR,
  "--incremental", "false",
];

const r = spawnSync("npx", ["--yes", "--package=typescript", "--", ...tscArgs], {
  cwd: ROOT,
  encoding: "utf8",
  shell: process.platform === "win32",
});

// tsc may emit errors but STILL emit JS files because tsconfig.server.json
// has noEmitOnError:false. We only fail if tsc didn't produce any output at
// all — actual mismatch detection is done by the diff below.
const tmpServer = path.join(TMP_DIR, "server");
if (!fs.existsSync(tmpServer)) {
  console.error("[check-dist] FAILED — tsc produced no output.");
  console.error(r.stdout?.slice?.(0, 2000) ?? "");
  console.error(r.stderr?.slice?.(0, 2000) ?? "");
  cleanup();
  process.exit(1);
}

// ── Diff temp dist/server vs committed dist/server ───────────────────────────
const tmpFiles = walk(tmpServer).map((p) => path.relative(tmpServer, p));
const mismatches = [];
const missingInCommit = [];

for (const rel of tmpFiles) {
  const tmpPath = path.join(tmpServer, rel);
  const committedPath = path.join(COMMITTED_DIST, rel);
  if (!fs.existsSync(committedPath)) {
    missingInCommit.push(rel);
    continue;
  }
  const a = fs.readFileSync(tmpPath);
  const b = fs.readFileSync(committedPath);
  if (a.length !== b.length || !a.equals(b)) {
    mismatches.push(rel);
  }
}

cleanup();

if (mismatches.length === 0 && missingInCommit.length === 0) {
  console.log(`[check-dist] OK — ${tmpFiles.length} files all match committed dist/.`);
  process.exit(0);
}

console.error(`[check-dist] FAILED — committed dist/ is stale.`);
if (missingInCommit.length > 0) {
  console.error(`  ${missingInCommit.length} file(s) NEW from source but not yet committed:`);
  for (const f of missingInCommit.slice(0, 20)) console.error(`    + dist/server/${f}`);
  if (missingInCommit.length > 20) console.error(`    ... and ${missingInCommit.length - 20} more`);
}
if (mismatches.length > 0) {
  console.error(`  ${mismatches.length} file(s) DIFFER from committed dist:`);
  for (const f of mismatches.slice(0, 20)) console.error(`    ~ dist/server/${f}`);
  if (mismatches.length > 20) console.error(`    ... and ${mismatches.length - 20} more`);
}
console.error(`
To fix:
  npx tsc --project tsconfig.server.json
  git add dist/server
  git commit -m "rebuild dist to match source"
  git push`);
process.exit(1);
