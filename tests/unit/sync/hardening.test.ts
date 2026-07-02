import { describe, it, expect } from "vitest";
import { validateConfig, HARDENING_AUDIT } from "../../../server/sync/hardening";

describe("validateConfig", () => {
  it("returns ok:true when DATABASE_URL + SESSION_SECRET are present", () => {
    const r = validateConfig({
      DATABASE_URL: "postgres://x", SESSION_SECRET: "s",
      NODE_ENV: "production",
    } as NodeJS.ProcessEnv);
    expect(r.ok).toBe(true);
    expect(r.missing).toEqual([]);
  });

  it("flags missing DATABASE_URL", () => {
    const r = validateConfig({
      SESSION_SECRET: "s", NODE_ENV: "production",
    } as NodeJS.ProcessEnv);
    expect(r.ok).toBe(false);
    expect(r.missing).toContain("DATABASE_URL");
  });

  it("emits soft warnings for missing SENTRY_DSN", () => {
    const r = validateConfig({
      DATABASE_URL: "x", SESSION_SECRET: "s", NODE_ENV: "production",
    } as NodeJS.ProcessEnv);
    expect(r.warnings.some((w) => /SENTRY_DSN/.test(w))).toBe(true);
  });

  it("warns about unexpected NODE_ENV", () => {
    const r = validateConfig({
      DATABASE_URL: "x", SESSION_SECRET: "s", NODE_ENV: "staging",
    } as NodeJS.ProcessEnv);
    expect(r.warnings.some((w) => /NODE_ENV/.test(w))).toBe(true);
  });
});

describe("HARDENING_AUDIT", () => {
  it("documents at least 10 findings, each with id, area, status", () => {
    expect(HARDENING_AUDIT.length).toBeGreaterThanOrEqual(10);
    for (const h of HARDENING_AUDIT) {
      expect(h.id).toMatch(/^H-\d{3}$/);
      expect(["concurrency", "config", "storage", "error-handling", "observability"]).toContain(h.area);
      expect(["fixed", "mitigated", "deferred", "accepted-risk"]).toContain(h.status);
      expect(h.finding.length).toBeGreaterThan(0);
      expect(h.notes.length).toBeGreaterThan(0);
    }
  });

  it("has unique ids", () => {
    const ids = HARDENING_AUDIT.map((h) => h.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
