import { describe, it, expect } from "vitest";
import {
  applyPersonaGuards,
  appendSignature,
  scrubForbiddenPhrases,
  SIGNATURE_STANDARD,
  SIGNATURE_WARNING,
  SIGNATURE_CELEBRATION,
} from "../../../server/ai/persona-guards";

// ─────────────────────────────────────────────────────────────────────────────
// scrubForbiddenPhrases
// ─────────────────────────────────────────────────────────────────────────────

describe("scrubForbiddenPhrases", () => {
  it("strips 'As an AI language model' opener", () => {
    const { scrubbed, matched } = scrubForbiddenPhrases(
      "As an AI language model, I can help with visa questions."
    );
    expect(scrubbed).toBe("I can help with visa questions.");
    expect(matched).toContain("ai_language_model");
  });

  it("strips 'That's a great question!' opener", () => {
    const { scrubbed, matched } = scrubForbiddenPhrases(
      "That's a great question! Let me explain."
    );
    expect(scrubbed).toBe("Let me explain.");
    expect(matched).toContain("great_question");
  });

  it("softens 'I would recommend that you consider' to 'I'd suggest'", () => {
    const { scrubbed } = scrubForbiddenPhrases(
      "I would recommend that you consider applying via Express Entry."
    );
    expect(scrubbed).toMatch(/I'd suggest applying via Express Entry\./i);
  });

  it("softens overpromise 'guaranteed visa' to 'a strong visa case'", () => {
    const { scrubbed, matched } = scrubForbiddenPhrases(
      "This is a guaranteed visa opportunity."
    );
    expect(scrubbed).toMatch(/a strong visa case/);
    expect(matched).toContain("guaranteed_visa");
  });

  it("strips 'I'm here to help!' opener", () => {
    const { scrubbed } = scrubForbiddenPhrases(
      "I'm here to help! Here's how visas work."
    );
    expect(scrubbed).toBe("Here's how visas work.");
  });

  it("leaves clean replies unchanged", () => {
    const clean = "The UAE work permit takes 3-6 weeks once MOHRE approves.";
    const { scrubbed, matched } = scrubForbiddenPhrases(clean);
    expect(scrubbed).toBe(clean);
    expect(matched).toHaveLength(0);
  });

  it("handles multiple forbidden phrases in one reply", () => {
    const { scrubbed, matched } = scrubForbiddenPhrases(
      "That's a great question! I would recommend that you consider Express Entry."
    );
    expect(scrubbed).toMatch(/I'd suggest Express Entry\./);
    expect(matched.length).toBeGreaterThanOrEqual(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// appendSignature
// ─────────────────────────────────────────────────────────────────────────────

describe("appendSignature", () => {
  it("appends standard signature to a normal-length reply", () => {
    const r = appendSignature("The UAE work permit takes 3-6 weeks once MOHRE approves.");
    expect(r).toContain(SIGNATURE_STANDARD);
  });

  it("skips signature when reply is short (< 40 chars)", () => {
    const r = appendSignature("Yes.");
    expect(r).toBe("Yes.");
    expect(r).not.toContain("I'm Nanjila");
  });

  it("skips signature when reply already contains 'I'm Nanjila'", () => {
    const r = appendSignature("I'm Nanjila and I already signed this one.");
    expect(r.match(/I'?m Nanjila/gi)?.length).toBe(1);
  });

  it("uses warning signature when reply contains 'High Risk'", () => {
    const r = appendSignature("This looks like High Risk. Multiple red flags present.");
    expect(r).toContain(SIGNATURE_WARNING);
    expect(r).not.toContain(SIGNATURE_STANDARD);
  });

  it("uses warning signature when reply contains 'do not pay'", () => {
    const r = appendSignature("Please do not pay anything to this recruiter yet.");
    expect(r).toContain(SIGNATURE_WARNING);
  });

  it("uses warning signature when reply contains a red-flag emoji", () => {
    const r = appendSignature("🚩 I found three signals I need you to look at.");
    expect(r).toContain(SIGNATURE_WARNING);
  });

  it("uses celebration signature on congratulations", () => {
    const r = appendSignature("Congratulations on the offer! You did great work.");
    expect(r).toContain(SIGNATURE_CELEBRATION);
  });

  it("honours explicit mode override", () => {
    const r = appendSignature("Some short reply.", { mode: "warning" });
    expect(r).toContain(SIGNATURE_WARNING);
  });

  it("suppresses signature when mode is 'none'", () => {
    const r = appendSignature("This is a normal-length reply about visas and permits.", {
      mode: "none",
    });
    expect(r).not.toContain("I'm Nanjila");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// applyPersonaGuards — the combined pipeline
// ─────────────────────────────────────────────────────────────────────────────

describe("applyPersonaGuards", () => {
  it("scrubs forbidden phrase AND appends standard signature", () => {
    const r = applyPersonaGuards(
      "As an AI language model, I can tell you the UAE permit takes 3-6 weeks."
    );
    expect(r.reply).not.toMatch(/As an AI language model/);
    expect(r.reply).toContain(SIGNATURE_STANDARD);
    expect(r.scrubbedPhrases).toContain("ai_language_model");
    expect(r.signatureApplied).toBe("standard");
  });

  it("uses warning signature when scrubbed reply is a scam alert", () => {
    const r = applyPersonaGuards(
      "🚩 High Risk: this recruiter is asking for an upfront fee. Do not pay."
    );
    expect(r.reply).toContain(SIGNATURE_WARNING);
    expect(r.signatureApplied).toBe("warning");
  });

  it("passes through a clean, well-formed reply", () => {
    const raw = "The UAE MOHRE process takes 3-6 weeks once your employer submits.";
    const r = applyPersonaGuards(raw);
    expect(r.reply).toContain(raw);
    expect(r.reply).toContain(SIGNATURE_STANDARD);
    expect(r.scrubbedPhrases).toHaveLength(0);
  });

  it("does not double-sign an already-signed reply", () => {
    const r = applyPersonaGuards(
      "The UAE permit takes 3-6 weeks. I'm Nanjila. Let's build your future abroad — safely."
    );
    expect(r.reply.match(/I'?m Nanjila/gi)?.length).toBe(1);
  });
});
