/** Write-from-Scratch payment reminder copy (2026-11). */
import { describe, it, expect } from "vitest";
import { buildReminderEmail, esc } from "../../server/lib/wfs-payment-reminder";

describe("finish-your-payment reminder", () => {
  const e = buildReminderEmail({ firstName: "Testa", docType: "cv", draftId: "00000000-0000-0000-0000-000000000001", amount: 300, jobTitle: "Private Chef" });
  it("links straight back to the saved draft", () => {
    expect(e.link).toMatch(/\/tools\/write-from-scratch\?draftId=00000000-0000-0000-0000-000000000001$/);
    expect(e.html).toContain(e.link);
  });
  it("is honest: real price, saved details, one reminder only, no discount or fake urgency", () => {
    expect(e.text).toMatch(/KES 300/);
    expect(e.subject).toBe("Finish your CV, details saved");
    expect(e.text).toMatch(/is saved but not paid yet/);
    expect(e.text).toMatch(/for the Private Chef job/);
    expect(e.text).toMatch(/only remind you once/);
    expect(e.text).not.toMatch(/discount|% off|expires|last chance|hurry/i);
    expect(e.text).toMatch(/\+254 111 467 601/);
  });
  it("escapes user-supplied text in HTML", () => {
    expect(esc('<b>"x"</b>')).toBe("&lt;b&gt;&quot;x&quot;&lt;/b&gt;");
    const x = buildReminderEmail({ firstName: "<script>", docType: "cv", draftId: "a", amount: 100, jobTitle: null });
    expect(x.html).not.toContain("<script>");
  });
});
