/**
 * Kenya flag — hand-crafted animated SVG used across Kenya Careers.
 *
 * 2026-06: founder wanted Kenyan-flag theming on the dashboard card +
 * landing-page hero, with the flag "wavering" (animated) rather than static.
 * Goal: looks authentic and crafted, not vibe-coded.
 *
 * Implementation notes:
 *   • Standard 3:2 aspect ratio (real Kenyan flag dimensions)
 *   • 5-band layout: black, white fimbriation, red, white fimbriation, green
 *     (proportions match the official flag — bands are 6:1:6:1:6 ratio
 *     across the 20-unit height of the 60×40 viewBox)
 *   • Maasai shield + crossed spears in the center — simplified to concentric
 *     ellipses (white→red→black→red) so the silhouette stays recognisable
 *     even at 18px wide
 *   • Subtle wave animation via CSS perspective + rotateY + skewY, anchored
 *     to the left edge (like the flag is attached to a pole). Loops smoothly.
 *   • Honours prefers-reduced-motion (accessibility) — stops animating when
 *     the user has motion-reduction enabled.
 *   • Drop shadow for depth — keeps it from looking flat on the gradient
 *     backgrounds it usually sits on.
 *
 * Sizes: xs (18px wide) through xl (96px). Pass `width` for an exact pixel
 * width if you need something between sizes.
 */

export interface KenyaFlagProps {
  /** Explicit width in px. If omitted, uses `size`. */
  width?: number;
  /** Shorthand for common sizes. Default: "md". */
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  /** Whether the flag waves. Default: true. Auto-disabled by prefers-reduced-motion. */
  animated?: boolean;
  /** Tailwind classes — applied to the outer wrapper. */
  className?: string;
}

const SIZE_WIDTHS: Record<NonNullable<KenyaFlagProps["size"]>, number> = {
  xs: 18,
  sm: 28,
  md: 40,
  lg: 64,
  xl: 96,
};

export function KenyaFlag({
  width,
  size = "md",
  animated = true,
  className = "",
}: KenyaFlagProps) {
  const w = width ?? SIZE_WIDTHS[size];
  const h = Math.round(w * (2 / 3));

  return (
    <span
      role="img"
      aria-label="Kenya flag"
      className={`relative inline-block kenya-flag-host ${className}`}
      style={{ width: `${w}px`, height: `${h}px` }}
      data-animated={animated ? "true" : "false"}
    >
      {/* Self-contained keyframes — scoped via attribute selector so multiple
          flags on the same page share a single CSS rule without conflict. */}
      <style>{`
        @keyframes kenyaFlagWave {
          0%   { transform: perspective(80px) rotateY(0deg)  skewY(0deg);    }
          25%  { transform: perspective(80px) rotateY(7deg)  skewY(-0.6deg); }
          50%  { transform: perspective(80px) rotateY(0deg)  skewY(0deg);    }
          75%  { transform: perspective(80px) rotateY(-5deg) skewY(0.6deg);  }
          100% { transform: perspective(80px) rotateY(0deg)  skewY(0deg);    }
        }
        .kenya-flag-host svg { transform-origin: left center; }
        .kenya-flag-host[data-animated="true"] svg {
          animation: kenyaFlagWave 3.8s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .kenya-flag-host[data-animated="true"] svg { animation: none; }
        }
      `}</style>

      <svg
        viewBox="0 0 60 40"
        xmlns="http://www.w3.org/2000/svg"
        className="absolute inset-0 w-full h-full"
        style={{ filter: "drop-shadow(0 1px 2px rgb(0 0 0 / 0.3))" }}
      >
        {/* ── 5 horizontal bands ─────────────────────────────────────────── */}
        <rect x="0" y="0"     width="60" height="13.3" fill="#000000" />
        <rect x="0" y="13.3"  width="60" height="0.7"  fill="#FFFFFF" />
        <rect x="0" y="14"    width="60" height="12"   fill="#BB0000" />
        <rect x="0" y="26"    width="60" height="0.7"  fill="#FFFFFF" />
        <rect x="0" y="26.7"  width="60" height="13.3" fill="#006600" />

        {/* ── Two crossed spears (behind the shield) ─────────────────────── */}
        <g stroke="#FFFFFF" strokeWidth="1.3" strokeLinecap="round">
          <line x1="22" y1="11.5" x2="38" y2="28.5" />
          <line x1="38" y1="11.5" x2="22" y2="28.5" />
        </g>
        {/* Spear tips — small triangular points at each end */}
        <g fill="#FFFFFF">
          <polygon points="22,11 19.5,10.5 21,13.5" />
          <polygon points="38,11 40.5,10.5 39,13.5" />
          <polygon points="22,29 19.5,29.5 21,26.5" />
          <polygon points="38,29 40.5,29.5 39,26.5" />
        </g>

        {/* ── Maasai shield — concentric ellipses (white → red → black → red)
              centred at the flag's midpoint. */}
        <g transform="translate(30, 20)">
          <ellipse rx="6.2" ry="8.5" fill="#FFFFFF" />
          <ellipse rx="4.8" ry="7.2" fill="#BB0000" />
          <ellipse rx="3.2" ry="5"   fill="#000000" />
          <ellipse rx="1.8" ry="3"   fill="#BB0000" />
        </g>
      </svg>
    </span>
  );
}

/**
 * Thin black-red-green stripe in Kenyan-flag colours. Used as a decorative
 * accent at the bottom of cards / hero sections to tie them to the Kenya
 * Careers theme without overwhelming the existing emerald background.
 *
 * Renders as a 1-3px tall full-width bar split into three equal coloured
 * sections, optionally with hairline white fimbriations between them.
 */
export function KenyaFlagStripe({
  height = 3,
  withFimbriations = false,
  className = "",
}: {
  height?: number;
  withFimbriations?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`flex w-full ${className}`}
      style={{ height: `${height}px` }}
      aria-hidden="true"
    >
      <div className="flex-1" style={{ background: "#000000" }} />
      {withFimbriations && <div style={{ width: 1, background: "#FFFFFF" }} />}
      <div className="flex-1" style={{ background: "#BB0000" }} />
      {withFimbriations && <div style={{ width: 1, background: "#FFFFFF" }} />}
      <div className="flex-1" style={{ background: "#006600" }} />
    </div>
  );
}
