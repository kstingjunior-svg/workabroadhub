// 2026-11-28 (Tony): catch mistyped email domains before a code is sent, and
// send at most ONE "finish signing up" reminder.
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { suggestEmailFix } from "../../shared/email-typo";

describe("email typo checker", () => {
  it("catches the typos real users made", () => {
    for (const [typed, fixed] of [
      ["a@gmai.com", "a@gmail.com"], ["a@gmaim.com", "a@gmail.com"], ["a@1gmail.com", "a@gmail.com"],
      ["a@gmial.com", "a@gmail.com"], ["a@gnail.com", "a@gmail.com"], ["a@gmail.co", "a@gmail.com"],
      ["a@gmail.con", "a@gmail.com"], ["a@gamil.com", "a@gmail.com"], ["a@yaho.com", "a@yahoo.com"],
      ["a@hotmial.com", "a@hotmail.com"], ["a@outlok.com", "a@outlook.com"], ["a@icloud.con", "a@icloud.com"],
    ]) expect(suggestEmailFix(typed), typed).toBe(fixed);
  });
  it("never 'corrects' real addresses", () => {
    for (const ok of ["a@gmail.com", "a@ymail.com", "a@mail.com", "a@email.com", "a@googlemail.com",
      "a@yahoo.co.uk", "a@live.com", "a@aol.com", "a@gmx.com", "a@mstj.co.tz", "a@workabroadhub.tech", "a@uonbi.ac.ke", "a@me.com"]) {
      expect(suggestEmailFix(ok), ok).toBeNull();
    }
  });
});

describe("verification reminders", () => {
  it("only one reminder tier remains", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../server/lib/verification-reminder-sweep.ts"), "utf8");
    const tiers = src.slice(src.indexOf("= ["), src.indexOf("];", src.indexOf("= [")));
    expect((tiers.match(/\{ stage:/g) || []).length).toBe(1);
  });
});
