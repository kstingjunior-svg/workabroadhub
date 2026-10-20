/**
 * Kenya Careers employer directory — query building, listing types and
 * signed unfollow tokens. Pure tests (no DB): server/lib/employer-directory.ts
 */
import { describe, it, expect } from "vitest";
import {
  normaliseDirectoryQuery, buildDirectoryWhere, listingTypeOf,
  signFollowToken, verifyFollowToken, DIRECTORY_CHIPS, DIRECTORY_PAGE_SIZE_MAX,
} from "../../server/lib/employer-directory";

describe("normaliseDirectoryQuery", () => {
  it("defaults to page 1, 12 per page, all employers", () => {
    const q = normaliseDirectoryQuery({});
    expect(q).toMatchObject({ page: 1, pageSize: 12, status: "all", search: null, county: null, industry: null, category: null });
  });
  it("treats 'all' and blank values as no filter", () => {
    const q = normaliseDirectoryQuery({ county: "all", industry: "  ", category: "all", search: "" });
    expect([q.county, q.industry, q.category, q.search]).toEqual([null, null, null, null]);
  });
  it("caps page size and rejects junk page numbers", () => {
    expect(normaliseDirectoryQuery({ pageSize: 9999 }).pageSize).toBe(DIRECTORY_PAGE_SIZE_MAX);
    expect(normaliseDirectoryQuery({ page: "-4" }).page).toBe(1);
    expect(normaliseDirectoryQuery({ page: "abc" }).page).toBe(1);
  });
  it("ignores unknown category chips and statuses", () => {
    const q = normaliseDirectoryQuery({ category: "casino", status: "verified" });
    expect(q.category).toBeNull();
    expect(q.status).toBe("all");
  });
  it("trims and limits search length", () => {
    expect(normaliseDirectoryQuery({ search: "  naivas   supermarket  " }).search).toBe("naivas supermarket");
    expect(normaliseDirectoryQuery({ search: "x".repeat(200) }).search!.length).toBe(80);
  });
});

describe("buildDirectoryWhere", () => {
  const base = normaliseDirectoryQuery({});
  it("only ever lists approved companies", () => {
    const { where, params } = buildDirectoryWhere(base);
    expect(where).toBe("c.status = 'approved'");
    expect(params).toEqual([]);
  });
  it("parameterises search (no SQL injection) and escapes wildcards", () => {
    const { where, params } = buildDirectoryWhere({ ...base, search: "50%_'; DROP TABLE x;--" });
    expect(where).toContain("c.name ILIKE $1");
    expect(where).not.toContain("DROP");
    expect(params[0]).toBe("%50\\%\\_'; DROP TABLE x;--%");
  });
  it("matches county on HQ or any branch", () => {
    const { where, params } = buildDirectoryWhere({ ...base, county: "Mombasa" });
    expect(where).toContain("c.county = $1 OR EXISTS (SELECT 1 FROM branches b");
    expect(params).toEqual(["Mombasa"]);
  });
  it("maps chips to industry patterns; Education also includes schools", () => {
    const energy = buildDirectoryWhere({ ...base, category: "energy" });
    expect(energy.params[0]).toEqual(DIRECTORY_CHIPS.energy.patterns);
    expect(energy.where).toContain("ILIKE ANY($1)");
    const edu = buildDirectoryWhere({ ...base, category: "education" });
    expect(edu.where).toContain("c.institution_type = 'school'");
  });
  it("separates invited from hiring employers", () => {
    expect(buildDirectoryWhere({ ...base, status: "invited" }).where).toContain("NOT (EXISTS (SELECT 1 FROM company_admins");
    const hiring = buildDirectoryWhere({ ...base, status: "hiring" }).where;
    expect(hiring).toContain("EXISTS (SELECT 1 FROM company_admins");
    expect(hiring).not.toContain("NOT (EXISTS");
  });
  it("numbers params in order when filters combine", () => {
    const { where, params } = buildDirectoryWhere({ ...base, search: "bank", county: "Nairobi", industry: "Banking", category: "banking" });
    expect(params.length).toBe(4);
    expect(where).toContain("$4");
  });
});

describe("listingTypeOf — never overstates status", () => {
  it("verified only when an admin verified the employer", () => {
    expect(listingTypeOf({ verified_at: new Date(), is_live: false })).toBe("verified");
    expect(listingTypeOf({ verified_at: null, is_live: true })).toBe("registered");
    expect(listingTypeOf({ verified_at: null, is_live: false })).toBe("invited");
  });
});

describe("follow tokens", () => {
  const id = "4aa8974c-47c2-49b5-9cba-da082f39016a";
  it("round-trips", () => {
    expect(verifyFollowToken(signFollowToken(id))).toBe(id);
  });
  it("rejects tampered or malformed tokens", () => {
    const t = signFollowToken(id);
    expect(verifyFollowToken(t.slice(0, -2) + "xx")).toBeNull();
    expect(verifyFollowToken(`ec79d24a-1d59-4ce2-b99c-07e789a34177.${t.split(".")[1]}`)).toBeNull();
    expect(verifyFollowToken("nope")).toBeNull();
    expect(verifyFollowToken("")).toBeNull();
  });
});
