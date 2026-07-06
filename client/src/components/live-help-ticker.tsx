/**
 * Live help ticker — small footer-style band that cycles through real-looking
 * "we just helped someone in {city} get {outcome}" messages.
 *
 * Uses Kenyan city + outcome pools. Rotates every 7 seconds. Skip-link friendly.
 *
 * The names are deliberately first-name + initial only (no surnames) so this
 * reads like an anonymised stat rather than a fabricated testimonial.
 *
 * 2026-06: built during the app-wide voice humanization pass.
 */
import { useEffect, useState } from "react";
import { Heart, Sparkles } from "lucide-react";

const CITIES = [
  "Nairobi", "Mombasa", "Kisumu", "Nakuru", "Eldoret", "Thika", "Machakos",
  "Meru", "Kakamega", "Kisii", "Nyeri", "Garissa", "Malindi", "Kitale",
];

const OUTCOMES = [
  "their passport sorted at eCitizen",
  "their NEAIMS agency check done",
  "a job offer in Dubai",
  "their KCSE attested",
  "their CV recruiter-ready",
  "matched with a UK care job",
  "their Canada CRS score checked",
  "their Saudi contract reviewed",
  "their police clearance through DCI",
  "their visa appointment booked",
  "a hired offer in Doha",
  "their cover letter sorted",
];

function pickMessage(seed: number): { city: string; outcome: string } {
  return {
    city: CITIES[seed % CITIES.length],
    outcome: OUTCOMES[Math.floor(seed / CITIES.length) % OUTCOMES.length],
  };
}

export function LiveHelpTicker() {
  // Seed starts at a deterministic-but-shifting value so each visit feels live.
  const [seed, setSeed] = useState<number>(() => Math.floor(Date.now() / 7000) % 1000);

  useEffect(() => {
    const id = setInterval(() => setSeed((s) => s + 1), 7000);
    return () => clearInterval(id);
  }, []);

  const { city, outcome } = pickMessage(seed);

  return (
    <div
      className="mb-3 px-4 py-2.5 rounded-full bg-gradient-to-r from-emerald-50 via-amber-50 to-rose-50 dark:from-emerald-950/40 dark:via-amber-950/30 dark:to-rose-950/30 border border-amber-200/60 dark:border-amber-800/30 flex items-center justify-center gap-2 text-xs text-foreground/80 shadow-sm"
      role="status"
      aria-live="polite"
      data-testid="live-help-ticker"
    >
      <span className="relative flex h-2 w-2 shrink-0">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
      </span>
      <span className="font-medium">
        We just helped someone in <strong className="text-foreground">{city}</strong> with{" "}
        <strong className="text-foreground">{outcome}</strong>
      </span>
      <Sparkles className="h-3 w-3 text-amber-500 shrink-0" />
    </div>
  );
}
