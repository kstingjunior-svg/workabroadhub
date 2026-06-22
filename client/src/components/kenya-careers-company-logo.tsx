/**
 * Company logo with initials fallback.
 *
 * 2026-06 Phase 3: until employers upload real logos via the claim-profile
 * flow (Phase 4), we render their initials in a colored circle. Color is
 * deterministic per company name so each employer has a consistent identity
 * across pages (Naivas always orange, Equity always purple, etc).
 *
 * Used by the company profile page, the job detail page, the featured-
 * employer strip, and any future card that displays an employer.
 */

interface CompanyLogoProps {
  name: string;
  logoUrl?: string | null;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

// Tailwind background classes — picked for good contrast with white text and
// enough variety that the 36 catalogue employers don't share too much.
const COLORS = [
  "bg-orange-500",
  "bg-red-500",
  "bg-amber-500",
  "bg-emerald-500",
  "bg-teal-500",
  "bg-cyan-500",
  "bg-sky-500",
  "bg-indigo-500",
  "bg-violet-500",
  "bg-purple-500",
  "bg-pink-500",
  "bg-rose-500",
];

const SIZE_CLASS: Record<NonNullable<CompanyLogoProps["size"]>, string> = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-14 w-14 text-base",
  xl: "h-20 w-20 text-2xl",
};

function hashColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return COLORS[Math.abs(h) % COLORS.length];
}

function initials(name: string): string {
  // "Naivas Supermarkets" → "NS", "Aga Khan University Hospital" → "AK"
  const words = name.replace(/[^a-zA-Z\s]/g, "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function CompanyLogo({ name, logoUrl, size = "md", className = "" }: CompanyLogoProps) {
  const sizeCls = SIZE_CLASS[size];

  if (logoUrl) {
    // Render actual image. Falls back to initials if the image fails to load.
    return (
      <div className={`relative ${sizeCls} ${className}`}>
        <img
          src={logoUrl}
          alt={`${name} logo`}
          className={`${sizeCls} rounded-lg object-cover bg-white ring-1 ring-border`}
          loading="lazy"
          onError={(e) => {
            // Hide the broken image — the fallback circle becomes visible
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
        <div
          className={`${sizeCls} absolute inset-0 -z-10 rounded-lg ${hashColor(name)} flex items-center justify-center text-white font-bold`}
          aria-hidden="true"
        >
          {initials(name)}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`${sizeCls} ${hashColor(name)} rounded-lg flex items-center justify-center text-white font-bold shrink-0 ${className}`}
      aria-label={`${name} logo`}
    >
      {initials(name)}
    </div>
  );
}
