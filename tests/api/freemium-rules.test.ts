/**
 * EXPLORE FIRST. PAY WHEN NECESSARY. — permanent regression guard (2026-11).
 * See docs/architecture/FREEMIUM_RULES.md. If one of these fails, do NOT relax
 * the test: move the payment prompt to a deliberate user tap instead.
 */
import { describe, it, expect, vi } from "vitest";
import fs from "fs";
import path from "path";

const q = vi.fn();
vi.mock("../../server/db", () => ({ pool: { query: (...a: any[]) => q(...a) } }));
const getUserPlan = vi.fn();
vi.mock("../../server/storage", () => ({ storage: { getUserPlan: (...a: any[]) => getUserPlan(...a) } }));

import { FEATURES, decideAccess, safeReturnPath, checkoutUrl, hasPlanFor, type FeatureId } from "../../shared/feature-access";
import { requireFeature } from "../../server/lib/feature-access";

const ROOT = path.resolve(__dirname, "../..");
const CLIENT = path.join(ROOT, "client/src");
function walk(dir: string, out: string[] = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(tsx?|jsx?)$/.test(e.name)) out.push(p);
  }
  return out;
}
const files = walk(CLIENT).filter((f) => !f.includes(`${path.sep}admin${path.sep}`));
const rel = (f: string) => path.relative(ROOT, f).replace(/\\/g, "/");

/** Extract the body of every `useEffect(` / `setTimeout(` / `setInterval(` call by paren matching. */
function callBodies(src: string, fn: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`\\b${fn}\\s*\\(`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    let depth = 0, i = m.index + m[0].length - 1;
    for (; i < src.length; i++) {
      if (src[i] === "(") depth++;
      else if (src[i] === ")" && --depth === 0) break;
    }
    out.push(src.slice(m.index, i + 1));
  }
  return out;
}
const PROMPT_CALL = /\b(openUpgradeModal|openJobUnlock|gate\.prompt|prompt\(\s*["'][a-z_]+["'])\s*\(|navigate\(\s*["'`]\/(pricing|payment)|setLocation\(\s*["'`]\/(pricing|payment)|location\.href\s*=\s*["'`]\/(pricing|payment)/;

describe("freemium — no automatic payment prompts", () => {
  it("the old auto-popup triggers are gone for good", () => {
    expect(fs.existsSync(path.join(CLIENT, "hooks/use-page-view-funnel.ts"))).toBe(false);
    expect(fs.existsSync(path.join(CLIENT, "components/exit-intent-popup.tsx"))).toBe(false);
    for (const f of files) {
      const s = fs.readFileSync(f, "utf8");
      expect(s, rel(f)).not.toMatch(/usePageViewFunnel|ExitIntentPopup|wah_page_views|wah_upgrade_last_prompt|exit_popup_shown/);
    }
  });

  it("no payment prompt or pricing redirect fires from useEffect / timers", () => {
    const offenders: string[] = [];
    for (const f of files) {
      const s = fs.readFileSync(f, "utf8");
      for (const fn of ["useEffect", "useLayoutEffect", "setTimeout", "setInterval"]) {
        for (const body of callBodies(s, fn)) {
          // Allowed: payment.tsx sends users to their *return* page after a VERIFIED payment.
          if (/navigate\(successDest\)/.test(body) && !PROMPT_CALL.test(body.replace(/navigate\(successDest\)/g, ""))) continue;
          // Allowed only inside an in-progress checkout the user started, with a written reason.
          if (/freemium-ok:\s*\S/.test(body) && rel(f) === "client/src/pages/payment.tsx") continue;
          if (PROMPT_CALL.test(body)) offenders.push(`${rel(f)} (${fn})`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("App shell, login, signup and auth flows never ask for money", () => {
    const authish = files.filter((f) => /(^|\/)(App\.tsx|signup[^/]*\.tsx|login[^/]*\.tsx|auth-modal\.tsx|use-auth\.tsx?|verify[^/]*\.tsx|onboarding[^/]*\.tsx)$/.test(rel(f)));
    expect(authish.length).toBeGreaterThan(2);
    for (const f of authish) {
      const s = fs.readFileSync(f, "utf8");
      // Navigation to pricing/payment, or opening a payment prompt. (Route *definitions* are fine.)
      expect(s, rel(f)).not.toMatch(/openUpgradeModal\(|openJobUnlock\(|(navigate|setLocation|location\.(assign|replace))\(\s*["'`]\/(pricing|payment)|location\.href\s*=\s*["'`]\/(pricing|payment)/);
    }
  });

  it("country pages are browsable by free accounts (no whole-page payment wall)", () => {
    const routes = fs.readFileSync(path.join(ROOT, "server/routes.ts"), "utf8");
    const start = routes.indexOf('app.get("/api/countries/:code"');
    const handler = routes.slice(start, routes.indexOf("app.get(", start + 10));
    expect(start).toBeGreaterThan(0);
    expect(handler).not.toMatch(/status\(403\)[^;]*Payment required/);
    expect(handler).toMatch(/url: _url/); // portal URLs never leave the server
    const page = fs.readFileSync(path.join(CLIENT, "pages/country.tsx"), "utf8");
    expect(page).not.toMatch(/portals-upgrade-wall/);
  });

  it("only one global upgrade modal exists (no stacked prompts)", () => {
    const app = fs.readFileSync(path.join(CLIENT, "App.tsx"), "utf8");
    expect(app.match(/<UpgradeModal\s*\/>/g)?.length).toBe(1);
    expect(app.match(/<JobUnlockHost\s*\/>/g)?.length).toBe(1);
  });
});

describe("freemium — central feature-access registry", () => {
  it("browsing is free; dashboard needs only an account", () => {
    for (const f of ["home", "country_pages", "service_descriptions", "kenya_jobs_browse", "kazi_karibu_browse", "pricing_page"] as FeatureId[]) {
      expect(decideAccess(f, { authenticated: false })).toEqual({ allowed: true });
    }
    expect(decideAccess("dashboard", { authenticated: true, plan: "free" })).toEqual({ allowed: true });
    expect(decideAccess("profile_settings", { authenticated: true, plan: "free" })).toEqual({ allowed: true });
    expect(decideAccess("dashboard", { authenticated: false })).toEqual({ allowed: false, reason: "SIGNIN" });
  });

  it("premium actions: free/expired → UPGRADE, paid/admin → allowed, keeps existing tiers", () => {
    expect(decideAccess("premium_job_links", { authenticated: true, plan: "free" })).toEqual({ allowed: false, reason: "UPGRADE" });
    for (const p of ["trial", "monthly", "yearly", "pro"]) expect(decideAccess("premium_job_links", { authenticated: true, plan: p }).allowed).toBe(true);
    // full_plan features keep the requireProPlan rule: trial is NOT enough
    expect(decideAccess("ai_auto_apply", { authenticated: true, plan: "trial" }).allowed).toBe(false);
    expect(decideAccess("ai_auto_apply", { authenticated: true, plan: "monthly" }).allowed).toBe(true);
    expect(decideAccess("ai_auto_apply", { authenticated: true, plan: "free", isAdmin: true }).allowed).toBe(true);
    expect(decideAccess("premium_job_links", { authenticated: false })).toEqual({ allowed: false, reason: "SIGNIN" });
    expect(hasPlanFor("any_paid", "free")).toBe(false);
  });

  it("every premium feature declares its tier, label and offer", () => {
    for (const [id, f] of Object.entries(FEATURES) as [string, any][]) {
      expect(f.label, id).toBeTruthy();
      if (f.access === "PREMIUM") { expect(f.tier, id).toBeTruthy(); expect(f.offer, id).toBeTruthy(); }
    }
  });

  it("checkout links keep prices/plans and return safely (no open redirect)", () => {
    expect(checkoutUrl("premium_job_links", "monthly", "/countries/canada")).toBe("/payment?plan=monthly&return=%2Fcountries%2Fcanada");
    expect(checkoutUrl("premium_job_links", "yearly", "/countries/canada")).toBe("/payment?plan=pro&return=%2Fcountries%2Fcanada");
    expect(checkoutUrl("local_job_contacts", "yearly", "/kazi-karibu/job/x")).toBe("/payment?plan=monthly&only=1&return=%2Fkazi-karibu%2Fjob%2Fx");
    for (const bad of ["//evil.com", "https://evil.com", "/\\evil.com", "/pricing", "/payment?x", "/api/x", "javascript:alert(1)", "/a\nb", ""]) {
      expect(safeReturnPath(bad), bad).toBeNull();
    }
    expect(safeReturnPath("/countries/canada?job=12")).toBe("/countries/canada?job=12");
  });
});

describe("freemium — server enforces premium independently of the UI", () => {
  const run = async (uid: string | null) => {
    const req: any = { user: uid ? { claims: { sub: uid } } : undefined, session: {} };
    let status = 200, body: any = null, nexted = false;
    const res: any = { status(s: number) { status = s; return this; }, json(b: any) { body = b; return this; } };
    await requireFeature("premium_job_links")(req, res, () => { nexted = true; });
    return { status, body, nexted };
  };

  it("signed-out → 401 (sign in, free); free → 402 with contextual body; paid/admin → next", async () => {
    expect((await run(null)).status).toBe(401);

    q.mockResolvedValueOnce({ rows: [{ role: "user", is_admin: false }] }); getUserPlan.mockResolvedValueOnce("free");
    const free = await run("u1");
    expect(free.status).toBe(402);
    expect(free.body.code).toBe("PAYWALL");
    expect(free.body.featureLabel).toBe("premium job links");
    expect(free.body.payUrl).toContain("plan=monthly");
    expect(free.body.payUrlYearly).toContain("plan=pro");

    q.mockResolvedValueOnce({ rows: [{ role: "user", is_admin: false }] }); getUserPlan.mockResolvedValueOnce("yearly");
    expect((await run("u2")).nexted).toBe(true);

    q.mockResolvedValueOnce({ rows: [{ role: "SUPER_ADMIN", is_admin: true }] });
    expect((await run("admin")).nexted).toBe(true);

    q.mockRejectedValueOnce(new Error("db down"));
    expect((await run("u3")).status).toBe(402); // deny by default, never grant on error
  });
});
