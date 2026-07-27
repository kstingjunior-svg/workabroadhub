/**
 * ShareSuccessCard — 1080x1080 branded share card.
 *
 * Rendered as a native SVG (not HTML) so the exact pixel-perfect visual
 * can be rasterized to PNG server-side or client-side via <canvas> +
 * drawImage(new Image() with data URL). Keeps the "screenshot" WYSIWYG.
 *
 * Used in two places:
 *   1. ShareSuccessModal — the in-app "your CV is ready, share it" modal
 *   2. /share/:token — the public landing page people arrive at from
 *      a friend's WhatsApp Status
 *
 * Design principles:
 *   - Big legible text that reads on a 3-inch phone screen crop
 *   - No word-wrap surprises: names are truncated to first-name + last initial
 *   - Colour palette matches the app's teal/cyan gradient
 *   - Brand mark bottom-right so cropping the top still keeps attribution
 */

import type { CSSProperties } from "react";

export interface ShareCardProps {
  firstName?: string | null;   // e.g. "Susan" — falls back to "I"
  serviceName?: string;        // e.g. "CV Revamp"
  targetCountry?: string | null; // e.g. "Canada"
  atsScore?: number | null;    // 0-100 — shown only when > 0
  variant?: "cv" | "linkedin" | "cover" | "sop" | "job-match" | "generic";
}

/**
 * Server-safe SVG string builder — used by /share/:token to embed the
 * same image without needing React. Also used by the modal for rasterization.
 */
export function buildShareCardSvg(p: ShareCardProps): string {
  const name    = firstOnly(p.firstName) || "I";
  const service = p.serviceName || "CV";
  const country = (p.targetCountry || "").trim();
  const score   = typeof p.atsScore === "number" && p.atsScore > 0 ? p.atsScore : null;

  // Choose accent colour by variant
  const accent = {
    cv:         "#14b8a6", // teal
    linkedin:   "#0a66c2", // linkedin blue
    cover:      "#f59e0b", // amber
    sop:        "#8b5cf6", // violet
    "job-match":"#22c55e", // green
    generic:    "#14b8a6",
  }[p.variant || "cv"];

  // Headline — chosen to feel human, not marketing-speak
  const headline = pickHeadline(p.variant || "cv", country);

  // Score badge — only when we have one
  const scoreBadge = score
    ? `
      <g transform="translate(540, 460)">
        <circle cx="0" cy="0" r="140" fill="${accent}" fill-opacity="0.15" stroke="${accent}" stroke-width="6"/>
        <text x="0" y="10" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="88" font-weight="800" fill="#ffffff">${score}%</text>
        <text x="0" y="60" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="28" font-weight="600" fill="${accent}">ATS SCORE</text>
      </g>
    `
    : "";

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
  <!-- Background gradient -->
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#1e293b"/>
    </linearGradient>
    <linearGradient id="accentBar" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${accent}"/>
      <stop offset="100%" stop-color="${lighten(accent)}"/>
    </linearGradient>
  </defs>

  <rect width="1080" height="1080" fill="url(#bg)"/>

  <!-- Top accent bar -->
  <rect x="0" y="0" width="1080" height="12" fill="url(#accentBar)"/>

  <!-- Corner decoration -->
  <circle cx="1000" cy="80" r="60" fill="${accent}" fill-opacity="0.1"/>
  <circle cx="1000" cy="80" r="30" fill="${accent}" fill-opacity="0.2"/>

  <!-- Kicker -->
  <text x="80" y="160" font-family="system-ui, -apple-system, sans-serif" font-size="32" font-weight="600" fill="${accent}" letter-spacing="2">
    ${service.toUpperCase()}
  </text>

  <!-- Headline (2 lines max) -->
  ${renderHeadline(headline, name)}

  ${scoreBadge}

  <!-- Country pill if present -->
  ${country ? `
    <g transform="translate(540, 700)">
      <rect x="-180" y="-40" width="360" height="80" rx="40" fill="#ffffff" fill-opacity="0.1" stroke="${accent}" stroke-width="3"/>
      <text x="0" y="15" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="36" font-weight="700" fill="#ffffff">
        for ${country}
      </text>
    </g>
  ` : ""}

  <!-- CTA / URL block -->
  <g transform="translate(0, 880)">
    <rect x="80" y="0" width="920" height="120" rx="24" fill="${accent}"/>
    <text x="540" y="55" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="36" font-weight="800" fill="#ffffff">
      Get YOURS for KES 99
    </text>
    <text x="540" y="95" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="26" font-weight="500" fill="#ffffff" fill-opacity="0.9">
      workabroadhub.tech
    </text>
  </g>

  <!-- Bottom brand -->
  <text x="540" y="1035" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="20" font-weight="600" fill="#64748b" letter-spacing="3">
    WORKABROADHUB · KENYA'S OVERSEAS JOBS PLATFORM
  </text>
</svg>`.trim();
}

/**
 * React component — renders the same SVG for in-modal preview.
 * (Reusing buildShareCardSvg keeps the preview and the downloaded PNG
 * pixel-identical, so users get what they see.)
 */
export function ShareSuccessCard(props: ShareCardProps & { className?: string; style?: CSSProperties }) {
  const svg = buildShareCardSvg(props);
  return (
    <div
      className={props.className}
      style={{ width: "100%", aspectRatio: "1 / 1", ...props.style }}
      dangerouslySetInnerHTML={{ __html: svg }}
      data-testid="share-success-card"
    />
  );
}

/* ── Helpers ───────────────────────────────────────────────────────────── */

function firstOnly(name?: string | null): string {
  if (!name) return "";
  const trimmed = name.trim();
  if (!trimmed) return "";
  // Keep first name only, but strip anything that looks like an email
  if (trimmed.includes("@")) return trimmed.split("@")[0].split(".")[0] || "";
  return trimmed.split(/\s+/)[0];
}

function pickHeadline(variant: string, country: string): string {
  switch (variant) {
    case "linkedin":
      return "just optimized my LinkedIn for overseas recruiters.";
    case "cover":
      return country
        ? `just got a killer cover letter for ${country}.`
        : "just got a killer cover letter written.";
    case "sop":
      return "just got my Statement of Purpose written.";
    case "job-match":
      return "just found real overseas job matches.";
    case "cv":
    default:
      return country
        ? `just optimized my CV for jobs in ${country}.`
        : "just got my CV optimized for overseas jobs.";
  }
}

/**
 * Render the headline as up to 2 tspan lines, avoiding cramped wraps.
 * The pattern: "<Name> [line 1 of headline]" then "[line 2]" below.
 */
function renderHeadline(headline: string, name: string): string {
  const full = `${name} ${headline}`;
  // Split on natural boundary: prefer to break after "just" or before "for"
  const words = full.split(" ");
  const mid = Math.ceil(words.length / 2);
  const line1 = words.slice(0, mid).join(" ");
  const line2 = words.slice(mid).join(" ");

  const y1 = 300;
  const y2 = 370;

  return `
    <text x="80" y="${y1}" font-family="system-ui, -apple-system, sans-serif" font-size="56" font-weight="800" fill="#ffffff">
      ${escapeXml(line1)}
    </text>
    <text x="80" y="${y2}" font-family="system-ui, -apple-system, sans-serif" font-size="56" font-weight="800" fill="#ffffff">
      ${escapeXml(line2)}
    </text>
  `;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Rough tint-up of a hex colour so the accent gradient has a bit of shine. */
function lighten(hex: string): string {
  const c = hex.replace("#", "");
  const r = Math.min(255, parseInt(c.slice(0, 2), 16) + 40);
  const g = Math.min(255, parseInt(c.slice(2, 4), 16) + 40);
  const b = Math.min(255, parseInt(c.slice(4, 6), 16) + 40);
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}
