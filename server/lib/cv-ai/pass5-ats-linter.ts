// ─────────────────────────────────────────────────────────────────────────────
// Pass 5 — ATS-safety linter
//
// The Composer writes ATS-friendly markdown by prompt discipline. This
// pass enforces it with code, so any drift becomes a normalisation
// instead of a lost score.
//
// NO LLM. Deterministic, cheap, runs on every generation between Composer
// and Score-gate. If we ever port the pipeline off OpenAI, this stays.
//
// What it does:
//   • Rewrites non-standard section headers to the 8 canonical names
//     ("Career Journey" → "Experience", "My Learning" → "Education", etc.)
//   • Strips HTML tags and markdown tables — real ATS parsers can't read them
//   • Normalises bullet chars ("*", "•", "▪", "●", "→", "»", "◦") → "-"
//   • Normalises date separators ("–", "—", "to", "..") → "—"
//   • Strips emoji + fancy unicode dingbats + zero-width characters
//   • Removes exclamation marks (recruiter-tell, ATS-neutral)
//   • Collapses runs of blank lines (3+ → 2)
//   • Ensures h1 (candidate name) exists as the first line
//   • Enforces max 2 blank lines between sections
//
// Returns {cleaned, changes[]} so we can log what was fixed. Changes
// don't affect scoring — but if we see the same fix land repeatedly, we
// know a Composer prompt tweak is due.
// ─────────────────────────────────────────────────────────────────────────────

export interface LintResult {
  cleaned: string;
  changes: string[];
}

// Map of common "creative" section names → the ATS-safe canonical.
// Keys are lowercased normalised strings.
const HEADER_ALIASES: Record<string, string> = {
  "career journey": "Experience",
  "professional journey": "Experience",
  "work history": "Experience",
  "employment history": "Experience",
  "professional experience": "Experience",
  "work experience": "Experience",
  "career highlights": "Experience",
  "my learning": "Education",
  "academic background": "Education",
  "academic history": "Education",
  "educational background": "Education",
  "credentials": "Certifications",
  "licences": "Certifications",
  "licenses": "Certifications",
  "achievements": "Certifications", // usually mislabeled certs; safer than dropping
  "professional summary": "Summary",
  "about me": "Summary",
  "profile": "Summary",
  "objective": "Summary",
  "career objective": "Summary",
  "technical skills": "Skills",
  "core competencies": "Skills",
  "key skills": "Skills",
  "areas of expertise": "Skills",
  "spoken languages": "Languages",
  "language proficiency": "Languages",
  "personal projects": "Projects",
  "side projects": "Projects",
  "portfolio": "Projects",
};

const CANONICAL_HEADERS = new Set([
  "Summary", "Experience", "Education", "Certifications",
  "Skills", "Languages", "Projects",
]);

// Unicode ranges to strip: emoji + dingbats + private-use + variation selectors.
const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{E000}-\u{F8FF}\u{FE00}-\u{FE0F}\u{1F000}-\u{1F02F}]/gu;
const ZERO_WIDTH_RE = /[​-‍﻿]/g;

export function lintCv(md: string): LintResult {
  const changes: string[] = [];
  let out = md.replace(/\r\n/g, "\n");

  // ── Strip zero-width + emoji ──────────────────────────────────────────
  const withoutZw = out.replace(ZERO_WIDTH_RE, "");
  if (withoutZw !== out) changes.push("removed zero-width characters");
  out = withoutZw;

  const withoutEmoji = out.replace(EMOJI_RE, "");
  if (withoutEmoji !== out) changes.push("removed emoji / dingbats");
  out = withoutEmoji;

  // ── Strip HTML tags ──────────────────────────────────────────────────
  const withoutHtml = out.replace(/<[^>]+>/g, "");
  if (withoutHtml !== out) changes.push("stripped HTML tags");
  out = withoutHtml;

  // ── Strip markdown tables (any line containing an unescaped `|` pair) ─
  {
    const beforeLines = out.split("\n");
    const afterLines = beforeLines.filter((l) => {
      // Table body/header lines look like " | col | col | "
      // Column separator: "| --- | --- |"
      const t = l.trim();
      if (/^\|(.*\|)+\s*$/.test(t)) return false;
      if (/^\|?\s*(:?-{3,}:?)(\s*\|\s*:?-{3,}:?)+\s*\|?\s*$/.test(t)) return false;
      return true;
    });
    if (afterLines.length !== beforeLines.length) {
      changes.push(`removed ${beforeLines.length - afterLines.length} markdown-table line(s)`);
      out = afterLines.join("\n");
    }
  }

  // ── Normalise bullet chars → "- " ────────────────────────────────────
  {
    const before = out;
    out = out.replace(/^([ \t]*)[•▪●◦→»*·][ \t]+/gm, "$1- ");
    if (out !== before) changes.push("normalised bullet characters to '-'");
  }

  // ── Normalise date separators (en-dash / to / .. → em-dash) ──────────
  {
    const before = out;
    out = out.replace(
      /((?:19|20)\d{2}|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s*(?:–|-|to|\.\.)\s*((?:19|20)\d{2}|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|present)/gi,
      "$1 — $2",
    );
    if (out !== before) changes.push("standardised date-range separators");
  }

  // ── Remove exclamation marks (recruiter-tell) ────────────────────────
  {
    const count = (out.match(/!/g) || []).length;
    if (count > 0) {
      out = out.replace(/!+/g, ".");
      changes.push(`replaced ${count} exclamation mark${count === 1 ? "" : "s"} with periods`);
    }
  }

  // ── Rewrite non-standard section headers ─────────────────────────────
  {
    let renamed = 0;
    out = out.replace(/^(#{1,3})\s+(.+?)\s*$/gm, (full, hashes: string, name: string) => {
      const key = name.trim().toLowerCase().replace(/\s+/g, " ");
      const canonical = HEADER_ALIASES[key];
      if (canonical && canonical.toLowerCase() !== key) {
        renamed++;
        return `${hashes} ${canonical}`;
      }
      // If it's already canonical, force level-2 exactly (ATS parsers
      // sometimes stumble on inconsistent header levels).
      const asIs = titleCase(name.trim());
      if (CANONICAL_HEADERS.has(asIs) && hashes.length !== 2) {
        renamed++;
        return `## ${asIs}`;
      }
      return full;
    });
    if (renamed > 0) changes.push(`rewrote ${renamed} section header(s) to canonical form`);
  }

  // ── Ensure h1 (name) exists as the first non-blank line ──────────────
  {
    const lines = out.split("\n");
    const firstNonBlank = lines.findIndex((l) => l.trim().length > 0);
    if (firstNonBlank >= 0 && !/^#\s+\S/.test(lines[firstNonBlank]!)) {
      // Composer usually starts with the name — if it dropped the `#`,
      // add one so ATS parsers pick up the name as the primary heading.
      lines[firstNonBlank] = "# " + lines[firstNonBlank]!.trim();
      changes.push("promoted first line to h1 (candidate name)");
      out = lines.join("\n");
    }
  }

  // ── Collapse triple-blank runs → double ──────────────────────────────
  {
    const before = out;
    out = out.replace(/\n{3,}/g, "\n\n");
    if (out !== before) changes.push("collapsed excess blank lines");
  }

  // ── Trim trailing whitespace on every line + final trim ──────────────
  out = out.split("\n").map((l) => l.replace(/[ \t]+$/, "")).join("\n").trim() + "\n";

  return { cleaned: out, changes };
}

function titleCase(s: string): string {
  return s.split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}
