/**
 * AUTHENTIC DATA POLICY guard rails (docs/architecture/AUTHENTIC_DATA_POLICY.md).
 * If one fails: connect the number to a real, defined source — never relax the test.
 */
import { describe, it, expect, vi } from "vitest";
import fs from "fs";
import path from "path";

const q = vi.fn();
vi.mock("../../server/db", () => ({ pool: { query: (...a: any[]) => q(...a) } }));

import { getPublicStats, invalidatePublicStats, METRIC_DEFINITIONS, MEMBER_SQL, INTERNAL_OR_TEST_USER_SQL } from "../../server/lib/platform-stats";
import { buildLiveActivity } from "../../server/lib/live-activity";

const ROOT = path.resolve(__dirname, "../..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");

describe("authentic data — no fabricated numbers in code", () => {
  it("removed fabrications stay removed", () => {
    expect(read("client/src/pages/dashboard.tsx")).not.toMatch(/87 users applied/);
    const routes = read("server/routes.ts");
    const urg = routes.slice(routes.indexOf('app.get("/api/urgency-stats"'), routes.indexOf('app.get("/api/urgency-stats"') + 2500);
    expect(urg).not.toMatch(/djb2|hash << 5|Math\.max\(2,/);
    expect(routes).not.toMatch(/\|\| 15;\s*$/m);
    expect(read("client/src/components/landing-trust-strip.tsx")).not.toMatch(/verified accounts only|Licensed agencies tracked/);
    expect(read("client/src/components/platform-stats-section.tsx")).not.toMatch(/suffix: "\+"/);
    expect(read("client/src/pages/tools/bulk-agency-verify.tsx")).not.toMatch(/1,294 agencies/);
    expect(read("client/src/pages/about.tsx")).not.toMatch(/4,200 users|7,000\+ members|1,000\+ consultations/);
  });

  it("no random-number generators feed public UI or stats", () => {
    for (const f of ["server/lib/platform-stats.ts", "server/lib/live-activity.ts", "client/src/components/live-activity-strip.tsx",
      "client/src/components/urgency-strip.tsx", "client/src/components/agency-alert-banner.tsx", "client/src/components/landing-trust-strip.tsx"]) {
      expect(read(f), f).not.toMatch(/Math\.random/);
    }
  });
});

describe("authentic data — metric definitions", () => {
  it("every public metric has a definition; member count excludes deleted/staff/test", () => {
    for (const k of ["registeredMembers", "verifiedMembers", "activeSubscribers", "newPayingMembers7d", "agenciesOnRegister", "agenciesExpiredOnRegister", "scamReports30d"]) {
      expect((METRIC_DEFINITIONS as any)[k], k).toBeTruthy();
    }
    expect(MEMBER_SQL).toMatch(/deleted_at IS NULL/);
    expect(MEMBER_SQL).toMatch(/is_active/);
    expect(INTERNAL_OR_TEST_USER_SQL).toMatch(/is_admin/);
  });

  it("test-account pattern catches test addresses but not real people", () => {
    const m = INTERNAL_OR_TEST_USER_SQL.match(/~\* '([^']+)'/)![1].replace(/\\\\/g, "\\");
    const re = new RegExp(m, "i");
    for (const e of ["test@x.com", "test1@x.com", "test.qa@x.com", "a+test@gmail.com", "qa2@x.com", "demo@x.com", "x@example.com", "x@mailinator.com"]) expect(re.test(e), e).toBe(true);
    for (const e of ["testertrends@gmail.com", "atest@gmail.com", "mulaanthonyke@gmail.com", "contestant@yahoo.com"]) expect(re.test(e), e).toBe(false);
  });

  it("unavailable data → null, never an invented fallback", async () => {
    invalidatePublicStats();
    q.mockRejectedValue(new Error("db down"));
    const s = await getPublicStats(true);
    for (const k of ["registeredMembers", "newPayingMembers7d", "agenciesExpiredOnRegister", "countriesWithPortals", "onlineNow"] as const) expect(s[k], k).toBeNull();
    q.mockReset();
  });

  it("zero countries is reported as unavailable, not a made-up 15", async () => {
    invalidatePublicStats();
    q.mockImplementation(async (sql: string) => /FROM countries/.test(sql) ? { rows: [{ n: 0 }] } : { rows: [{ n: 5 }] });
    const s = await getPublicStats(true);
    expect(s.countriesWithPortals).toBeNull();
    q.mockReset();
  });
});

describe("authentic data — activity feed privacy", () => {
  it("public activity never identifies anyone", () => {
    const items = buildLiveActivity(
      [{ id: "1", payer: "u1", service: "plan_pro", first_name: "Jane", last_name: "Wanjiku", country: "KE", at: "2026-11-24T10:00:00Z" }],
      [{ id: "a", kind: "ats", at: "2026-11-24T11:00:00Z" }],
    );
    const json = JSON.stringify(items);
    expect(json).not.toMatch(/Jane|Wanjiku|J\. W\.|Kenya/);
    expect(items.every((i) => i.who === "Someone" && i.where === null)).toBe(true);
  });
});
