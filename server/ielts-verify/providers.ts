/**
 * providers.ts — official IELTS test partners + verification portals.
 *
 * 2026-07 (Tony's IELTS AI verifier spec): "Never recommend unofficial
 * verification websites." Every URL below verified against the official
 * IELTS partner domain. Content-checked 2026-07.
 *
 * The IELTS Verification Service (Results Verification Service) is
 * institution-only — candidates cannot use it directly. Test-takers verify
 * their own results via the Test Taker Portal of the provider they booked
 * their test with.
 */

export interface IeltsProvider {
  /** Machine key. */
  key: "british_council" | "idp" | "ielts_usa" | "cambridge";
  name: string;
  /** Countries where this provider is the primary IELTS partner. */
  operatingRegions: string[];
  links: {
    homepage:            string;
    testTakerPortal:     string;   // where candidates view their own results
    verificationService: string;   // institution-only verification
    findATestCentre:     string;
    resultsHelp:         string;
    fraudReporting:      string | null;
  };
  contacts: {
    supportEmail: string | null;
    supportPhone: string | null;
  };
  notes: string;
}

export const IELTS_PROVIDERS: IeltsProvider[] = [
  {
    key: "british_council",
    name: "British Council",
    operatingRegions: [
      "Kenya", "Uganda", "Tanzania", "Rwanda", "Ethiopia",
      "United Kingdom", "India", "Nigeria", "Ghana", "South Africa",
      "China (mainland — joint with BC/IDP)",
    ],
    links: {
      homepage:            "https://www.britishcouncil.org/exam/ielts",
      testTakerPortal:     "https://ielts.britishcouncil.org/track-your-results",
      verificationService: "https://ors.ielts.org/",
      findATestCentre:     "https://ielts.org/take-a-test/find-a-test-location",
      resultsHelp:         "https://ielts.org/take-a-test/after-the-test/getting-your-results",
      fraudReporting:      "https://www.britishcouncil.org/contact/report-fraud",
    },
    contacts: {
      supportEmail: "ielts.kenya@britishcouncil.org",
      supportPhone: "+254 20 283 6000",
    },
    notes:
      "British Council is the primary IELTS partner for Kenya, East Africa, UK, and parts of Asia. Kenyan candidates who booked through British Council use its portal to view results and download the eTRF.",
  },
  {
    key: "idp",
    name: "IDP Education (IDP IELTS)",
    operatingRegions: [
      "Australia", "New Zealand", "Canada", "Ireland", "Singapore",
      "Philippines", "Vietnam", "Nepal", "Sri Lanka", "Pakistan",
    ],
    links: {
      homepage:            "https://ielts.idp.com/",
      testTakerPortal:     "https://ielts.idp.com/results/preview-results",
      verificationService: "https://ors.ielts.org/",
      findATestCentre:     "https://ielts.idp.com/book",
      resultsHelp:         "https://ielts.idp.com/results",
      fraudReporting:      "https://ielts.idp.com/about/contact-us",
    },
    contacts: {
      supportEmail: null,
      supportPhone: null,
    },
    notes:
      "IDP is the IELTS partner for Australia, New Zealand, Canada and much of South-East Asia. Uses the shared ORS system (ors.ielts.org) for institutional verification.",
  },
  {
    key: "ielts_usa",
    name: "IELTS USA",
    operatingRegions: ["United States"],
    links: {
      homepage:            "https://www.ieltsusa.org/",
      testTakerPortal:     "https://www.ieltsusa.org/test-takers/after-the-test/results",
      verificationService: "https://www.ieltsusa.org/institutions/verify-results",
      findATestCentre:     "https://www.ieltsusa.org/test-takers/find-a-test-location",
      resultsHelp:         "https://www.ieltsusa.org/test-takers/after-the-test/results",
      fraudReporting:      null,
    },
    contacts: {
      supportEmail: "info@ieltsusa.org",
      supportPhone: "+1 800 315 4143",
    },
    notes:
      "IELTS USA runs IELTS in the United States. Institutional verification is separate from the global ORS system.",
  },
  {
    key: "cambridge",
    name: "Cambridge English (IELTS partner)",
    operatingRegions: ["Global test design + quality"],
    links: {
      homepage:            "https://www.cambridgeenglish.org/exams-and-tests/ielts/",
      testTakerPortal:     "https://ielts.org/take-a-test/after-the-test/getting-your-results",
      verificationService: "https://ors.ielts.org/",
      findATestCentre:     "https://ielts.org/take-a-test/find-a-test-location",
      resultsHelp:         "https://ielts.org/take-a-test/after-the-test/getting-your-results",
      fraudReporting:      null,
    },
    contacts: {
      supportEmail: null,
      supportPhone: null,
    },
    notes:
      "Cambridge is the third co-owner of IELTS (with British Council + IDP). Doesn't run test centres directly.",
  },
];

/**
 * Look up the most likely provider based on the test centre name / country
 * extracted by the AI vision model.
 */
export function findProvider(
  input: { testCentreName?: string | null; country?: string | null } = {},
): IeltsProvider | null {
  const centre  = (input.testCentreName ?? "").toLowerCase();
  const country = (input.country ?? "").toLowerCase();

  // Direct centre-name matches (highest precedence)
  if (centre.includes("british council"))      return IELTS_PROVIDERS[0];
  if (centre.includes("idp"))                  return IELTS_PROVIDERS[1];
  if (centre.includes("ielts usa"))            return IELTS_PROVIDERS[2];

  // Country-based inference — Kenya + East Africa → British Council
  if (country) {
    const bcCountries = ["kenya", "uganda", "tanzania", "rwanda", "ethiopia", "united kingdom", "uk", "britain", "nigeria", "ghana"];
    const idpCountries = ["australia", "new zealand", "canada", "ireland", "singapore", "philippines", "vietnam", "nepal"];
    const usaCountries = ["united states", "usa", "u.s.a"];
    if (bcCountries.some((c) => country.includes(c)))  return IELTS_PROVIDERS[0];
    if (idpCountries.some((c) => country.includes(c))) return IELTS_PROVIDERS[1];
    if (usaCountries.some((c) => country.includes(c))) return IELTS_PROVIDERS[2];
  }
  return null;
}

/**
 * Shared institutional verification portal. Every provider routes here for
 * institution verification, so we surface it in the recommendations regardless
 * of which provider issued the TRF.
 */
export const SHARED_INSTITUTION_VERIFICATION = {
  name: "IELTS Online Results Verification Service (ORS)",
  url:  "https://ors.ielts.org/",
  audience: "institutions_only",
  note: "Access to the ORS is restricted to organizations that register as verifiers (universities, employers, embassies). Candidates cannot use ORS directly — they view results via their test provider's Test Taker Portal.",
} as const;
