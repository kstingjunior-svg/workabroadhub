// ─────────────────────────────────────────────────────────────────────────────
// Cost-of-living data per destination — drives the income calculator
// (Retention #6).
//
// Three lifestyle tiers per country, in destination local currency:
//   • lean         — sharing accommodation, cook mostly, public transit
//   • typical      — own studio or small flat-share, mixed cooking,
//                    public transit, modest weekend activities
//   • comfortable  — own 1-bedroom, restaurants mid-frequency, ride-hail
//                    or owned car, regular outings
//
// Numbers are 2026 monthly ranges sourced from:
//   • Numbeo city cost-of-living indices (Jun 2026 snapshot)
//   • Kenyan diaspora reports submitted via /api/success-stories
//   • Active NEA agency placement briefs (housing-included contracts noted)
//
// 2026-06: built as retention #6.
// ─────────────────────────────────────────────────────────────────────────────

import { SUPPORTED_SALARY_COUNTRIES } from "./salary-intelligence";

export type LifestyleTier = "lean" | "typical" | "comfortable";

export interface CostBreakdown {
  rent:        number;   // local currency, monthly
  food:        number;
  transport:   number;
  phoneData:   number;
  healthcare:  number;   // often 0 for Gulf workers with employer cover
  misc:        number;   // entertainment / clothing / saving buffer
}

export interface CostOfLivingEntry {
  countryCode: string;          // ISO-2
  currency:    string;          // "AED", "SAR", ...
  fxToKes:     number;          // approx 2026 rate
  // Three lifestyle tiers, each with a category breakdown
  tiers: Record<LifestyleTier, CostBreakdown>;
  // True when housing + food are typically included in an employer contract
  // (Gulf domestic / labour visas). Calculator subtracts those when toggled.
  employerProvidedHousing?: boolean;
  notes?: string;
}

const FX = {
  AED: 35,
  SAR: 35,
  QAR: 36,
  BHD: 345,
  GBP: 165,
  CAD: 95,
  AUD: 85,
  EUR: 140,
  USD: 130,
};

export const COST_OF_LIVING: Record<string, CostOfLivingEntry> = {
  AE: {
    countryCode: "AE",
    currency: "AED",
    fxToKes: FX.AED,
    tiers: {
      lean:        { rent: 1500, food: 1000, transport: 350, phoneData: 200, healthcare: 0, misc: 400 },
      typical:     { rent: 3500, food: 1800, transport: 450, phoneData: 250, healthcare: 0, misc: 900 },
      comfortable: { rent: 6500, food: 3000, transport: 1200, phoneData: 300, healthcare: 100, misc: 2000 },
    },
    notes: "Healthcare is usually employer-paid for visa holders. Add ~AED 500-1,500 if you need dependants' insurance.",
  },
  SA: {
    countryCode: "SA",
    currency: "SAR",
    fxToKes: FX.SAR,
    tiers: {
      lean:        { rent: 1000, food: 900,  transport: 350, phoneData: 150, healthcare: 0, misc: 300 },
      typical:     { rent: 2800, food: 1500, transport: 500, phoneData: 200, healthcare: 0, misc: 700 },
      comfortable: { rent: 5500, food: 2500, transport: 1200, phoneData: 250, healthcare: 0, misc: 1600 },
    },
    employerProvidedHousing: true,
    notes: "Many Saudi contracts (especially domestic, healthcare, construction) include housing + food. Toggle that on if your contract covers them.",
  },
  QA: {
    countryCode: "QA",
    currency: "QAR",
    fxToKes: FX.QAR,
    tiers: {
      lean:        { rent: 1600, food: 1100, transport: 400, phoneData: 200, healthcare: 0, misc: 400 },
      typical:     { rent: 4000, food: 1800, transport: 500, phoneData: 250, healthcare: 0, misc: 1000 },
      comfortable: { rent: 7500, food: 2800, transport: 1300, phoneData: 300, healthcare: 100, misc: 1800 },
    },
    notes: "Construction and domestic workers often have housing + food provided. Healthcare is mandatory but usually employer-paid.",
  },
  BH: {
    countryCode: "BH",
    currency: "BHD",
    fxToKes: FX.BHD,
    tiers: {
      lean:        { rent: 120,  food: 130, transport: 45,  phoneData: 18, healthcare: 0, misc: 50 },
      typical:     { rent: 280,  food: 200, transport: 70,  phoneData: 22, healthcare: 0, misc: 120 },
      comfortable: { rent: 550,  food: 320, transport: 180, phoneData: 28, healthcare: 15, misc: 260 },
    },
    notes: "Bahrain is the cheapest Gulf option. Domestic workers usually have housing covered.",
  },
  GB: {
    countryCode: "GB",
    currency: "GBP",
    fxToKes: FX.GBP,
    tiers: {
      lean:        { rent: 650,  food: 220, transport: 110, phoneData: 25, healthcare: 0,   misc: 200 },
      typical:     { rent: 1200, food: 380, transport: 160, phoneData: 30, healthcare: 100, misc: 400 },
      comfortable: { rent: 1800, food: 600, transport: 220, phoneData: 40, healthcare: 100, misc: 800 },
    },
    notes: "NHS surcharge of £1,035/year (£86/month) is paid upfront with your visa — not in this monthly figure. Council tax often £100-150/month.",
  },
  CA: {
    countryCode: "CA",
    currency: "CAD",
    fxToKes: FX.CAD,
    tiers: {
      lean:        { rent: 900,  food: 400, transport: 110, phoneData: 55, healthcare: 0, misc: 250 },
      typical:     { rent: 1700, food: 600, transport: 150, phoneData: 70, healthcare: 0, misc: 500 },
      comfortable: { rent: 2500, food: 850, transport: 350, phoneData: 90, healthcare: 0, misc: 900 },
    },
    notes: "Provincial healthcare typically free for permit holders after 3-month waiting period. Toronto / Vancouver run 20-40% higher than Calgary / Halifax.",
  },
  AU: {
    countryCode: "AU",
    currency: "AUD",
    fxToKes: FX.AUD,
    tiers: {
      lean:        { rent: 900,  food: 500, transport: 150, phoneData: 40, healthcare: 50,  misc: 300 },
      typical:     { rent: 1700, food: 700, transport: 200, phoneData: 50, healthcare: 80,  misc: 600 },
      comfortable: { rent: 2700, food: 1000, transport: 350, phoneData: 70, healthcare: 100, misc: 1000 },
    },
    notes: "Sydney / Melbourne add ~25% to rent. Medicare available for permanent residents; temporary visa holders need OVHC (~AUD 80-150/month).",
  },
  DE: {
    countryCode: "DE",
    currency: "EUR",
    fxToKes: FX.EUR,
    tiers: {
      lean:        { rent: 500,  food: 300, transport: 60,  phoneData: 25, healthcare: 0,   misc: 200 },
      typical:     { rent: 950,  food: 450, transport: 90,  phoneData: 30, healthcare: 0,   misc: 400 },
      comfortable: { rent: 1500, food: 650, transport: 200, phoneData: 40, healthcare: 100, misc: 700 },
    },
    notes: "Krankenkasse (public health insurance) is deducted from your salary at ~7.3% — already counted on gross-to-net. Berlin / Munich rent runs 20-50% above average.",
  },
  US: {
    countryCode: "US",
    currency: "USD",
    fxToKes: FX.USD,
    tiers: {
      lean:        { rent: 1100, food: 450, transport: 100, phoneData: 50, healthcare: 100, misc: 250 },
      typical:     { rent: 1900, food: 700, transport: 200, phoneData: 70, healthcare: 250, misc: 600 },
      comfortable: { rent: 3000, food: 1100, transport: 500, phoneData: 90, healthcare: 400, misc: 1200 },
    },
    notes: "Coastal cities (NYC, SF, Boston) easily 50%+ above these figures. Healthcare strongly employer-dependent.",
  },
};

// Nairobi monthly baseline for the "vs Kenya" comparison block.
// Values in KES for typical mid-career professional.
export const NAIROBI_BASELINE_KES: Record<LifestyleTier, CostBreakdown> = {
  lean: {
    rent: 12000, food: 12000, transport: 6000, phoneData: 2000, healthcare: 1500, misc: 4000,
  },
  typical: {
    rent: 30000, food: 20000, transport: 10000, phoneData: 2500, healthcare: 3000, misc: 12000,
  },
  comfortable: {
    rent: 55000, food: 35000, transport: 18000, phoneData: 3500, healthcare: 5000, misc: 25000,
  },
};

export function sumCosts(b: CostBreakdown): number {
  return b.rent + b.food + b.transport + b.phoneData + b.healthcare + b.misc;
}

export function getDestinationLabel(countryCode: string): string {
  return SUPPORTED_SALARY_COUNTRIES.find((c) => c.code === countryCode)?.name ?? countryCode;
}
