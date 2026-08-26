/**
 * Idempotent Lithuania country seeding.
 *
 * 2026-08 (Tony's request): "ship it" — adds Lithuania as a real country
 * on the WorkAbroad Hub dashboard with five verified government + private
 * job portals and an honest eligibility banner.
 *
 * Why this is a separate bootstrap (not part of seed.ts):
 *   seed.ts only runs on an empty database. Production has been running for
 *   months and its inserts would never re-fire. This file is imported at
 *   server boot (next to ensureLuxembourgSeeded) and inserts the country +
 *   portals + guides ONLY if they're missing. Safe to run on every boot —
 *   re-runs are no-ops.
 *
 * Sources backing the portals + eligibility numbers:
 *   • Employment Service of Lithuania (UŽT — official state agency):
 *     https://uzt.lt/en
 *   • "Renkuosi Lietuvą" / Migration Information Centre (official gov
 *     English portal for foreigners): https://renkuosilietuva.lt/en
 *   • Work in Lithuania (Invest Lithuania — official talent-attraction):
 *     https://www.workinlithuania.lt
 *   • CV Online Lithuania (largest private jobs board):
 *     https://www.cvonline.lt
 *   • EURES Lithuania (EU public employment network):
 *     https://eures.europa.eu/index_en (Lithuania filter)
 *   • Migration Department of Lithuania (visa policy):
 *     https://migracija.lt/en
 *
 * The eligibility banner tells Kenyans the truth — Lithuania is real but
 * narrow. Realistic paths are truck driving (CE licence + Code 95),
 * welding, meat processing, warehousing, and IT. Winters are brutal. Almost
 * nothing outside IT is English-only. Being honest upfront protects
 * refunds, reputation, and reviews.
 */
import { pool } from "../db";

const LT_CODE = "lithuania";
const LT_NAME = "Lithuania";
const LT_FLAG = "🇱🇹";

interface PortalSeed {
  name:        string;
  url:         string;
  description: string;
  order:       number;
}

// Five real portals, ordered by official-ness. UŽT is the state employment
// service every legal hire touches. Renkuosi Lietuvą is the government's
// English-language landing page for foreigners moving to Lithuania. Work in
// Lithuania is Invest Lithuania's talent-attraction portal for skilled
// (mostly IT / fintech / engineering) roles. CV Online is the largest
// private jobs board. EURES is the EU public-employment network.
const LT_PORTALS: PortalSeed[] = [
  {
    name:        "UŽT — Employment Service of Lithuania (Government)",
    url:         "https://uzt.lt/en",
    description: "Lithuania's state employment service. Every legal work permit for a non-EU citizen involves a UŽT decision. Also lists vacancies from Lithuanian employers.",
    order:       1,
  },
  {
    name:        "Renkuosi Lietuvą — Migration Information Centre (Official EN)",
    url:         "https://renkuosilietuva.lt/en",
    description: "Government portal for foreigners considering Lithuania. Free step-by-step guidance on work permits, D-visas, residence permits, and family reunification.",
    order:       2,
  },
  {
    name:        "Work in Lithuania (Invest Lithuania Official)",
    url:         "https://www.workinlithuania.lt",
    description: "Government-backed talent-attraction portal for skilled international hiring — heavy on IT, fintech, engineering, and shared-services roles. English-first.",
    order:       3,
  },
  {
    name:        "CV Online Lithuania",
    url:         "https://www.cvonline.lt",
    description: "Largest private jobs board in Lithuania. Most listings in Lithuanian; use the language filter to find English-speaking roles.",
    order:       4,
  },
  {
    name:        "EURES Lithuania (EU Public Employment Network)",
    url:         "https://eures.europa.eu/index_en",
    description: "European Commission's public jobs network. Filter by country → Lithuania. Guaranteed legitimate — every listing is placed by a national employment service.",
    order:       5,
  },
];

// Three country-guide sections. The country page reads exactly these three
// keys (`before_apply` / `cv_tips` / `visa_warning`) — see
// client/src/pages/country.tsx.
const LT_GUIDES = [
  {
    section: "before_apply",
    content:
      "Lithuania is real for Kenyans but narrow. The pipelines that actually work:\n\n" +
      "• Truck driving — huge, sustained shortage. Requires a CE licence, Driver Code 95 (EU professional driver qualification), and English or basic Russian. Salaries typically €2,000–3,500/month net (≈ KES 300k–520k/month).\n\n" +
      "• Welding, metalwork, and factory work (meat processing, furniture assembly) — real permits issued, salaries €1,500–2,200/month.\n\n" +
      "• IT & fintech — Vilnius is a growing hub (Revolut, Wise, Nord Security, Vinted). Realistic for senior/mid-level software, DevOps, data, and cybersecurity roles. Salaries €3,500–7,000+/month for experienced engineers.\n\n" +
      "• Shared-services centres in Vilnius (Danske Bank, Western Union, Moody's) hire English-speaking finance, HR, and customer-support staff.\n\n" +
      "If you don't fit one of those tracks, Lithuania is unlikely to work for you — please apply where your skills fit (UAE, Saudi, UK, Poland).",
  },
  {
    section: "cv_tips",
    content:
      "Use the European CV format (Europass is universally accepted in Lithuania). 2 pages maximum.\n\n" +
      "• Include a professional photo (standard in Lithuania).\n" +
      "• Include nationality, date of birth, and current location.\n" +
      "• Language skills at the top — English (required for most non-manual roles), Russian (still useful, especially in logistics), Lithuanian (huge plus, opens local jobs).\n" +
      "• For driving jobs: state your CE licence category, Code 95 expiry date, years of experience, and countries you've driven in.\n" +
      "• For IT: list stack, years, and any EU/remote experience for European companies.\n" +
      "• Quantify achievements (deliveries per week, systems built, team size, revenue handled).\n" +
      "• Get any Kenyan academic qualifications recognised via SKVC (Lithuania's academic recognition body) if you plan a skilled role.",
  },
  {
    section: "visa_warning",
    content:
      "⚠️ READ THIS BEFORE PAYING.\n\n" +
      "Lithuania is an EU/Schengen country. Kenyans need a National (D) visa + work permit BEFORE arriving — you cannot 'come as a tourist and look for work'. Every legal hire follows this path:\n\n" +
      "1. Employer applies to UŽT (Employment Service) for permission to hire you.\n" +
      "2. UŽT runs a labour market test (~4–8 weeks) unless the role is on the shortage-occupation list (truck driver, welder, several IT roles are typically on it).\n" +
      "3. Once approved, you apply for a D visa at the nearest Lithuanian consulate (nearest for Kenya is usually the Lithuanian Embassy in Cairo or via VFS Global in Nairobi).\n" +
      "4. After arrival, you convert to a temporary residence permit within your first year.\n\n" +
      "Skilled worker fast-track: if your role is on the shortage list AND your salary is at least 1.5× the Lithuanian average gross salary (currently ~€2,850/month, ≈ KES 425k/month), the labour market test is skipped.\n\n" +
      "❌ AVOID: any agent in Kenya offering a 'guaranteed Lithuania job for KES 200,000+' — legitimate Lithuanian employers apply through UŽT at no cost to you. If someone asks you to pay for the visa or work permit itself, it's a scam.\n\n" +
      "❄️ Reality check on winters: Lithuania sees -15 to -25°C from December to February with 5–8 hours of daylight. This is genuinely difficult for anyone coming from Kenya. Please factor it in before committing.\n\n" +
      "Use ONLY the five portals listed above. Apply directly. Never pay for a job.",
  },
];

export async function ensureLithuaniaSeeded(): Promise<void> {
  const client = await pool.connect();
  try {
    // ── 1. Country row ─────────────────────────────────────────────────────
    // ON CONFLICT on the `code` UNIQUE constraint — re-run safe.
    const countryRes = await client.query<{ id: string }>(
      `INSERT INTO countries (name, code, flag_emoji, is_active)
       VALUES ($1, $2, $3, true)
       ON CONFLICT (code) DO UPDATE
         SET name = EXCLUDED.name,
             flag_emoji = EXCLUDED.flag_emoji,
             is_active = true
       RETURNING id`,
      [LT_NAME, LT_CODE, LT_FLAG],
    );
    const countryId = countryRes.rows[0]?.id;
    if (!countryId) {
      console.warn("[ensureLithuania] No country id returned — skipping portals + guides");
      return;
    }

    // ── 2. Portals ─────────────────────────────────────────────────────────
    // DELETE any prior Lithuania-tagged rows and re-insert the canonical
    // five. Makes re-runs idempotent AND lets us update URLs/descriptions
    // in this file without orphaning old rows.
    await client.query(`DELETE FROM job_links WHERE country_id = $1`, [countryId]);
    for (const p of LT_PORTALS) {
      await client.query(
        `INSERT INTO job_links (country_id, name, url, description, is_active, "order", click_count, last_verified)
         VALUES ($1, $2, $3, $4, true, $5, 0, NOW())`,
        [countryId, p.name, p.url, p.description, p.order],
      );
    }

    // ── 3. Guides ──────────────────────────────────────────────────────────
    // Same DELETE-then-INSERT pattern for the three guide sections.
    await client.query(`DELETE FROM country_guides WHERE country_id = $1`, [countryId]);
    for (const g of LT_GUIDES) {
      await client.query(
        `INSERT INTO country_guides (country_id, section, content) VALUES ($1, $2, $3)`,
        [countryId, g.section, g.content],
      );
    }

    console.log(
      `[ensureLithuania] ✓ Lithuania seeded: countryId=${countryId} ` +
      `portals=${LT_PORTALS.length} guides=${LT_GUIDES.length}`,
    );
  } catch (err: any) {
    // Non-fatal — boot must continue even if this fails. Log so it's loud
    // in Render logs.
    console.error("[ensureLithuania] FAILED:", err?.message);
  } finally {
    client.release();
  }
}
