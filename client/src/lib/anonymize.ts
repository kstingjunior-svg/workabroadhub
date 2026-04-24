/**
 * User anonymization utilities.
 *
 * RULE: public-facing displays MUST NEVER expose full name, email, phone,
 * or exact location. Only initials, city, country, and month/year of
 * membership are allowed.
 */

export interface AnonymizedUser {
  initials: string;
  city: string | null;
  country: string | null;
  memberSince: string;
}

/**
 * Convert a full user record into a safe, anonymous public representation.
 * Matches the canonical anonymizeUser() spec:
 *   initials  = firstName[0] + ' ' + lastName[0]   (e.g. "J D")
 *   city      = userData.city
 *   country   = userData.country
 *   memberSince = month/year from createdAt         (e.g. "4/2025")
 *
 * NEVER included: full name, email, phone, exact address.
 */
export function anonymizeUser(userData: {
  firstName?: string | null;
  lastName?: string | null;
  city?: string | null;
  country?: string | null;
  createdAt?: string | Date | number | null;
}): AnonymizedUser {
  const first = userData.firstName?.trim()?.[0]?.toUpperCase() ?? "";
  const last = userData.lastName?.trim()?.[0]?.toUpperCase() ?? "";
  const initials = [first, last].filter(Boolean).join(" ") || "?";

  const date = userData.createdAt ? new Date(userData.createdAt as string | number | Date) : null;
  const memberSince =
    date && !isNaN(date.getTime())
      ? `${date.getMonth() + 1}/${date.getFullYear()}`
      : "";

  return {
    initials,
    city: userData.city ?? null,
    country: userData.country ?? null,
    memberSince,
  };
}

/**
 * Anonymize a display name string (for cases where only a name string
 * is available, e.g. admin-curated success stories).
 *
 * "John Doe"  → "J D"
 * "Sarah K."  → "S K"
 * "Maria"     → "M"
 * ""          → "?"
 */
export function anonymizeDisplayName(name: string): string {
  if (!name?.trim()) return "?";
  return name
    .trim()
    .split(/\s+/)
    .map((part) => part.replace(/\./g, "")[0]?.toUpperCase() ?? "")
    .filter(Boolean)
    .join(" ");
}

/**
 * Format a createdAt timestamp as "month/year" for public display.
 * e.g. new Date("2025-03-15") → "3/2025"
 */
export function formatMemberSince(
  createdAt: string | Date | number | null | undefined,
): string {
  if (!createdAt) return "";
  const date = new Date(createdAt as string | number | Date);
  if (isNaN(date.getTime())) return "";
  return `${date.getMonth() + 1}/${date.getFullYear()}`;
}
