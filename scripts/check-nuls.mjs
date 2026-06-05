#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// check-nuls.mjs — scan every tracked source file for embedded NUL bytes (0x00)
//
// WHY THIS EXISTS:
//   OneDrive (and a few other sync tools) occasionally corrupt files mid-write,
//   leaving 0x00 padding at the end. tsc and Node parse those fine in a casual
//   read, but esbuild/vite reject them, breaking the Render build. We've eaten
//   multiple hours debugging exactly this. Stop it at the source.
//
// HOW IT WORKS:
//   1. `git ls-files` enumerates every tracked source file.
//   2. We read each file and look for a single 0x00 byte.
//   3. Any hit is reported. Exit code 1 if any poisoned files are found.
//
// USAGE:
//   npm run check:nuls
//   node scripts/check-nuls.mjs
//
// Wired into the pre-push git hook (scripts/install-git-hooks.mjs).
// ─────────────────────────────────────────────────────────────────────────────

import { execSync } from "node:child_process";
import fs from "node:fs";

const EXT_ALLOW = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".json", ".html", ".css", ".md", ".yml", ".yaml",
  ".sql",
]);

function tracked() {
  const out = execSync("git ls-files", { encoding: "utf8" });
  return out.split("\n").filter(Boolean);
}

function hasNul(filePath) {
  const buf = fs.readFileSync(filePath);
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] === 0) return i;
  }
  return -1;
}

const start = Date.now();
const files = tracked();
const poisoned = [];

for (const f of files) {
  const lastDot = f.lastIndexOf(".");
  const ext = lastDot >= 0 ? f.slice(lastDot) : "";
  if (!EXT_ALLOW.has(ext)) continue;

  try {
    const offset = hasNul(f);
    if (offset >= 0) {
      poisoned.push({ file: f, offset });
    }
  } catch (err) {
    // Missing file (race with checkout) — ignore.
  }
}

const ms = Date.now() - start;

if (poisoned.length === 0) {
  console.log(`[check-nuls] OK — scanned ${files.length} files (${ms}ms), no NUL bytes found.`);
  process.exit(0);
}

console.error(`[check-nuls] FAILED — ${poisoned.length} file(s) contain NUL bytes:`);
for (const p of poisoned) {
  console.error(`  • ${p.file} (first NUL at byte ${p.offset})`);
}
console.error(`
Most likely OneDrive corruption. To recover:
  1. Strip NULs from each file:    tr -d '\\000' < <file> > <file>.clean && mv <file>.clean <file>
  2. Compare with git:             git diff <file>
  3. Re-stage and re-commit.

Consider moving the repo outside any OneDrive-synced folder permanently.`);
process.exit(1);
