#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// install-git-hooks.mjs — copy scripts/hooks/* to .git/hooks/ on npm install.
//
// Wired into the `prepare` npm script (runs after every `npm install`).
// Idempotent — safe to run repeatedly. No-op if not inside a git repo.
//
// WHY THIS EXISTS:
//   .git/hooks/ is NOT tracked by git, so a pre-push hook can't live there
//   directly. We keep the canonical hooks in scripts/hooks/ (tracked), and
//   this installer copies them into .git/hooks/ where git looks for them.
// ─────────────────────────────────────────────────────────────────────────────

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SRC_HOOKS = path.join(ROOT, "scripts", "hooks");
const GIT_HOOKS = path.join(ROOT, ".git", "hooks");

if (!fs.existsSync(path.join(ROOT, ".git"))) {
  // Not a git checkout (e.g. running from a tarball). No-op.
  process.exit(0);
}

if (!fs.existsSync(SRC_HOOKS)) {
  console.warn("[install-git-hooks] scripts/hooks/ does not exist; nothing to install.");
  process.exit(0);
}

if (!fs.existsSync(GIT_HOOKS)) {
  fs.mkdirSync(GIT_HOOKS, { recursive: true });
}

let installed = 0;
for (const name of fs.readdirSync(SRC_HOOKS)) {
  const srcPath = path.join(SRC_HOOKS, name);
  const dstPath = path.join(GIT_HOOKS, name);
  const stat = fs.statSync(srcPath);
  if (!stat.isFile()) continue;
  fs.copyFileSync(srcPath, dstPath);
  // chmod 755 so git will execute it (no-op on Windows but harmless).
  try { fs.chmodSync(dstPath, 0o755); } catch {}
  installed++;
}

console.log(`[install-git-hooks] installed ${installed} hook(s) into .git/hooks/`);
