// 2026-11-27 (Tony): pasting the sign-in code sometimes sent the wrong digits.
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { extractOtp } from "../../client/src/components/otp-input";

describe("sign-in code paste", () => {
  it("finds the code in whatever was copied", () => {
    expect(extractOtp("482913")).toBe("482913");
    expect(extractOtp(" 482913 \n")).toBe("482913");
    expect(extractOtp("4\t \t8\t \t2\t \t9\t \t1\t \t3")).toBe("482913"); // boxed email cells
    expect(extractOtp("4 8 2 9 1 3")).toBe("482913");
    expect(extractOtp("Your code is 482913. It expires in 10 minutes.")).toBe("482913");
    expect(extractOtp("expires in 10 minutes 482913")).toBe("482913");
    expect(extractOtp("To copy: 482913")).toBe("482913");
  });

  it("a full pasted code replaces every box; clipboard autofill never auto-submits", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../client/src/components/otp-input.tsx"), "utf8");
    expect(src).toMatch(/if \(d\.length === length\) \{\s*setDigits\(d\.split\(""\)\);/);
    expect(src).toMatch(/setDigits\(match\[1\]\.split\(""\), false\)/);
  });

  it("the email carries the whole code as one copyable word", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../server/services/identityVerification.ts"), "utf8");
    expect(src).toMatch(/To copy: <span[^>]*>\$\{code\}<\/span>/);
  });
});
