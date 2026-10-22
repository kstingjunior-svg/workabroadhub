import { describe, it, expect } from "vitest";
import { parseIntlPhone } from "../../shared/intl-phone";

const ok = (raw: string) => { const r = parseIntlPhone(raw); if (!r.ok) throw new Error(r.error); return r.value; };

describe("parseIntlPhone", () => {
  it("accepts the Kuwait number from the support chat", () => {
    expect(ok("+96565662953")).toMatchObject({ digits: "96565662953", e164: "+96565662953", iso: "KW", national: "65662953" });
    expect(ok("+965 6566 2953").iso).toBe("KW");
    expect(ok("0096565662953").iso).toBe("KW");
    expect(ok("96565662953").iso).toBe("KW");
  });
  it("accepts Gulf / UK / US destination numbers", () => {
    expect(ok("+974 3312 3456").iso).toBe("QA");
    expect(ok("+971 50 123 4567").iso).toBe("AE");
    expect(ok("+966 55 123 4567").iso).toBe("SA");
    expect(ok("+44 7911 123456").iso).toBe("GB");
    expect(ok("+1 416 555 0199").iso).toBe("US");
  });
  it("keeps Kenyan local formats working", () => {
    expect(ok("0712 345 678").digits).toBe("254712345678");
    expect(ok("254712345678").iso).toBe("KE");
    expect(ok("+254 712 345 678").digits).toBe("254712345678");
    expect(ok("712345678").digits).toBe("254712345678");
    expect(ok("0112345678").digits).toBe("254112345678");
  });
  it("drops a trunk 0 typed after the country code", () => {
    expect(ok("+44 07911 123456").digits).toBe("447911123456");
  });
  it("rejects wrong lengths with a helpful message", () => {
    const r = parseIntlPhone("+965 6566 295");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("Kuwait");
    expect(parseIntlPhone("+254 7123").ok).toBe(false);
    expect(parseIntlPhone("12").ok).toBe(false);
    expect(parseIntlPhone("").ok).toBe(false);
  });
  it("accepts an unlisted country code only when typed with +", () => {
    expect(ok("+5511912345678").digits).toBe("5511912345678");
    expect(parseIntlPhone("5511912345678").ok).toBe(false);
  });
});
