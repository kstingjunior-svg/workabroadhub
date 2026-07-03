import { describe, it, expect } from "vitest";
import {
  classifySensitivity,
  MEMORY_SENSITIVITY_BLOCK_THRESHOLD,
} from "../../../server/nanjila/memory";

// ─────────────────────────────────────────────────────────────────────────────
// Sensitivity gate — the trust firewall.
//
// The DB-touching functions (rememberFact, recallFact, etc.) are integration-
// tested against a real Postgres. Here we cover the pure classification
// logic that decides whether a candidate fact can be written at all.
// ─────────────────────────────────────────────────────────────────────────────

describe("classifySensitivity", () => {
  it("returns 0 for benign facts", () => {
    const { sensitivity, category } = classifySensitivity(
      "preferred_country",
      "UAE",
    );
    expect(sensitivity).toBe(0);
    expect(category).toBeNull();
  });

  it("flags health-related keys as high sensitivity", () => {
    const { sensitivity, category } = classifySensitivity(
      "diabetes_status",
      "type 2",
    );
    expect(sensitivity).toBeGreaterThan(MEMORY_SENSITIVITY_BLOCK_THRESHOLD);
    expect(category).toBe("health");
  });

  it("flags religion mentions as high sensitivity", () => {
    const { sensitivity, category } = classifySensitivity(
      "faith_practice",
      "muslim",
    );
    expect(sensitivity).toBeGreaterThan(MEMORY_SENSITIVITY_BLOCK_THRESHOLD);
    expect(category).toBe("religion");
  });

  it("flags LGBT/orientation mentions as very high sensitivity", () => {
    const { sensitivity, category } = classifySensitivity(
      "orientation",
      "gay",
    );
    expect(sensitivity).toBeGreaterThan(MEMORY_SENSITIVITY_BLOCK_THRESHOLD);
    expect(category).toBe("sexuality");
  });

  it("flags political affiliation as high sensitivity", () => {
    const { sensitivity, category } = classifySensitivity(
      "supports_party",
      "Azimio",
    );
    expect(sensitivity).toBeGreaterThan(MEMORY_SENSITIVITY_BLOCK_THRESHOLD);
    expect(category).toBe("politics");
  });

  it("flags tribal / ethnic identification as high sensitivity", () => {
    const { sensitivity, category } = classifySensitivity(
      "background",
      "Kikuyu",
    );
    expect(sensitivity).toBeGreaterThan(MEMORY_SENSITIVITY_BLOCK_THRESHOLD);
    expect(category).toBe("ethnicity");
  });

  it("flags credential-like values as very high sensitivity", () => {
    const { sensitivity, category } = classifySensitivity(
      "notes",
      "my password is Password123",
    );
    expect(sensitivity).toBeGreaterThan(MEMORY_SENSITIVITY_BLOCK_THRESHOLD);
    expect(category).toBe("credential");
  });

  it("does NOT flag legitimate career-relevant facts", () => {
    const cases: Array<[string, string]> = [
      ["preferred_country",  "Canada"],
      ["target_role",        "Senior chef"],
      ["experience_years",   "8"],
      ["english_level",      "advanced"],
      ["passport_expiry",    "2028-06-15"],
      ["saved_agency_slug",  "prime-personnel-ke"],
    ];
    for (const [k, v] of cases) {
      const { sensitivity } = classifySensitivity(k, v);
      expect(sensitivity).toBeLessThanOrEqual(MEMORY_SENSITIVITY_BLOCK_THRESHOLD);
    }
  });

  it("catches sensitive terms embedded in longer fact values", () => {
    // "I take medication for depression" should be flagged even though the
    // key is neutral.
    const { sensitivity, category } = classifySensitivity(
      "medical_notes",
      "I take medication for depression",
    );
    expect(sensitivity).toBeGreaterThan(MEMORY_SENSITIVITY_BLOCK_THRESHOLD);
    expect(category).toBe("health");
  });
});
