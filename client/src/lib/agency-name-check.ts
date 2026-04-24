// ── Agency name suspicious-language checker ───────────────────────────────────
// Flags marketing claims in agency names / user-submitted names that are
// either illegal under Kenyan recruitment law (e.g. "guaranteed visa") or
// strongly associated with fraud (e.g. "inside person", "100% success").

export interface NameCheckResult {
  warning: boolean;
  risk: "HIGH" | "MEDIUM" | null;
  matches: string[];
  message: string;
}

interface NamePattern {
  pattern: RegExp;
  label: string;
  risk: "HIGH" | "MEDIUM";
}

const NAME_PATTERNS: NamePattern[] = [
  // ── HIGH — illegal / definitive fraud indicators ─────────────────────────────
  { pattern: /guaranteed\s+visa/i,                   label: "guaranteed visa",           risk: "HIGH" },
  { pattern: /100%\s*(?:success|guaranteed|placement|visa|approval)/i, label: "100% success/guaranteed", risk: "HIGH" },
  { pattern: /special\s+connection/i,                label: "special connection",         risk: "HIGH" },
  { pattern: /inside\s+person/i,                     label: "inside person",              risk: "HIGH" },
  { pattern: /no[- ]?rejection|zero\s+rejection/i,   label: "no rejection claim",         risk: "HIGH" },
  { pattern: /instant\s+visa|visa\s+instant/i,       label: "instant visa",               risk: "HIGH" },
  { pattern: /backdoor\s+visa|visa\s+backdoor/i,     label: "backdoor visa",              risk: "HIGH" },
  { pattern: /vip\s+visa|visa\s+vip/i,               label: "VIP visa claim",             risk: "HIGH" },
  { pattern: /direct\s+embassy\s+link|embassy\s+connection/i, label: "direct embassy connection", risk: "HIGH" },
  { pattern: /fast[- ]?track\s+visa|visa\s+express/i, label: "fast-track / express visa", risk: "HIGH" },
  { pattern: /bypass\s+(?:immigration|embassy|queue)/i, label: "immigration bypass claim", risk: "HIGH" },

  // ── MEDIUM — suspicious but not conclusively fraudulent ──────────────────────
  { pattern: /easy\s+(?:abroad|overseas|visa|jobs?)/i, label: "easy overseas/visa claim", risk: "MEDIUM" },
  { pattern: /free\s+visa(?!\s+(?:countries|advice|info))/i, label: "free visa claim",    risk: "MEDIUM" },
  { pattern: /rush\s+passport|passport\s+rush/i,     label: "rush passport services",     risk: "MEDIUM" },
  { pattern: /urgent\s+placement|placement\s+urgent/i, label: "urgent placement",         risk: "MEDIUM" },
  { pattern: /guaranteed\s+job|job\s+guaranteed/i,   label: "guaranteed job",             risk: "MEDIUM" },
  { pattern: /direct\s+employer(?!\s+(?:contact|services))/i, label: "direct employer access claim", risk: "MEDIUM" },
  { pattern: /no\s+experience\s+required/i,          label: "no experience required",     risk: "MEDIUM" },
  { pattern: /work\s+from\s+home\s+abroad/i,         label: "work from home abroad",      risk: "MEDIUM" },
];

export function checkAgencyName(name: string): NameCheckResult {
  if (!name?.trim()) return { warning: false, risk: null, matches: [], message: "" };

  const highMatches: string[] = [];
  const mediumMatches: string[] = [];

  for (const { pattern, label, risk } of NAME_PATTERNS) {
    if (pattern.test(name)) {
      if (risk === "HIGH") highMatches.push(label);
      else mediumMatches.push(label);
    }
  }

  const allMatches = [...highMatches, ...mediumMatches];

  if (highMatches.length > 0) {
    return {
      warning: true,
      risk: "HIGH",
      matches: allMatches,
      message: `This agency uses suspicious language: ${allMatches.join(", ")}`,
    };
  }

  if (mediumMatches.length > 0) {
    return {
      warning: true,
      risk: "MEDIUM",
      matches: allMatches,
      message: `Possibly suspicious language detected: ${allMatches.join(", ")}`,
    };
  }

  return { warning: false, risk: null, matches: [], message: "" };
}
