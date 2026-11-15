import { describe, it, expect } from "vitest";
import { buildLiveActivity, initialsOf, countryName } from "../../server/lib/live-activity";

describe("live activity feed", () => {
  it("initials only — never full names", () => {
    expect(initialsOf("Anthony", "McLeod")).toBe("A. M.");
    expect(initialsOf("mary wanjiku", null)).toBe("M. W.");
    expect(initialsOf("", "")).toBe("Someone");
    expect(initialsOf(null, null)).toBe("Someone");
    expect(initialsOf("<script>", "x")).not.toContain("<");
  });

  it("maps countries and leaves unknown codes blank", () => {
    expect(countryName("KE")).toBe("Kenya");
    expect(countryName("ae")).toBe("UAE");
    expect(countryName("ZZ")).toBeNull();
  });

  it("newest first, skips unknown purchase types, de-duplicates echoes", () => {
    const items = buildLiveActivity(
      [
        // rows arrive newest first, as the SQL orders them
        { id: "2", payer: "u1", service: "tool_visa_check", first_name: "Anthony", last_name: "McLeod", country: "KE", at: "2026-11-15T10:03:00Z" },
        { id: "1", payer: "u1", service: "tool_visa_check", first_name: "Anthony", last_name: "McLeod", country: "KE", at: "2026-11-15T10:00:00Z" }, // echo
        { id: "3", payer: "u2", service: null, first_name: "X", last_name: "Y", country: "KE", at: "2026-11-15T11:00:00Z" },           // unknown → skipped
        { id: "4", payer: "u3", service: "plan_monthly", first_name: "Grace", last_name: "M", country: null, at: "2026-11-15T09:00:00Z" },
      ],
      [{ id: "a", kind: "ats", at: "2026-11-15T12:00:00Z" }],
    );
    expect(items.map((i) => i.id)).toEqual(["ats:a", "p:2", "p:4"]);
    expect(items[1]).toMatchObject({ who: "A. M.", where: "Kenya", action: "screened a visa" });
    expect(items[0]).toMatchObject({ who: "Someone", where: null });
    expect(JSON.stringify(items)).not.toMatch(/Anthony|McLeod|Grace/);
  });
});
