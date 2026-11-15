/**
 * Platform numbers shown in marketing copy — always from the database.
 *
 * 2026-11 (Tony: "I need them to match"): "30+ portals" and "6 countries" were
 * hard-coded while the database held 177 job-portal links across 19 country
 * hubs. Every place that quotes these numbers now reads /api/public/stats.
 * The fallbacks are the real values on 15 Nov 2026, used only while loading.
 */
import { useQuery } from "@tanstack/react-query";

interface PublicStatsLite {
  jobPortals?: number;
  countriesServed?: number;
  portalsByCountry?: Record<string, number>;
}

/** 177 → "170+" (never overstates). */
export function roundDownLabel(n: number): string {
  if (n < 10) return String(n);
  const step = n >= 1000 ? 100 : 10;
  return `${Math.floor(n / step) * step}+`;
}

export function usePlatformNumbers() {
  const { data } = useQuery<PublicStatsLite>({
    queryKey: ["/api/public/stats"],
    staleTime: 5 * 60 * 1000,
  });
  const portals = data?.jobPortals && data.jobPortals > 0 ? data.jobPortals : 177;
  const countries = data?.countriesServed && data.countriesServed > 0 ? data.countriesServed : 19;
  return {
    portals,
    portalsLabel: roundDownLabel(portals),
    countries,
    portalsFor: (code: string): number | null => data?.portalsByCountry?.[code] ?? null,
  };
}
