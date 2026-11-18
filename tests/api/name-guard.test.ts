/**
 * Name Guard test suite (2026-11). Pure engine, no network.
 * Measures false positives (real names blocked) and false negatives
 * (abuse let through) over labelled corpora.
 */
import { describe, it, expect } from "vitest";
import { decideName } from "../../server/name-guard/decide";
import { SEED_TERMS } from "../../server/name-guard/lexicon";
import { views } from "../../server/name-guard/normalize";
import { normTerm } from "../../server/name-guard/normalize";
import { classifyAbuse } from "../../server/name-guard/abuse";

const opts = { terms: SEED_TERMS };
const decide = (n: string, extra: any = {}) => decideName(n, { ...opts, ...extra });

// Must NEVER be rejected (accept or review are both fine).
const LEGIT = [
  // Kenya
  "Wanjiku Kamau", "Otieno Ochieng", "Achieng' Odhiambo", "Kipchoge Keino", "Mwangi wa Kariuki", "Njeri", "Chebet Jepkosgei",
  "Mohamed Abdi Hussein", "Wafula Chebukati", "Akinyi Adhiambo", "Kiprono arap Sang", "Nyokabi Wambui", "Barasa Wekesa",
  "Mutua Musyoka", "Nekesa", "Jeptoo Kiplagat", "Atieno Awino-Onyango", "Gathoni wa Muchomba", "Mbugua Ng'ang'a",
  // Africa
  "Chukwuemeka Okafor", "Oluwaseun Adeyemi", "Nkosazana Dlamini-Zuma", "Kwame Nkrumah", "Abebe Bikila", "Tsegaye Shitaye",
  "Ngozi Okonjo-Iweala", "Thandiwe Mthembu", "Yaw Boateng", "Fatoumata Diawara", "Mamadou N'Diaye", "Amadou Bâ",
  // Arabic / Gulf / Asia
  "Abdullah bin Rashid Al Maktoum", "Aisha Al-Farsi", "عبد الله الحربي", "Nguyen Van Anh", "Kumar Patel", "Priya Raghunathan",
  "Li Wei", "李伟", "Kuma Takeshi", "Siddharth Ranganathan", "Thich Nhat Hanh", "Zhang Xiaoming",
  // Europe / Americas
  "José María García-López", "Siobhán O'Connor", "Zoë Brontë", "Łukasz Brzęczyszczykiewicz", "Jean-Luc Picard", "Llwyd ap Iwan",
  "Dick Johnson", "Berty Liberty", "Mavi Yılmaz", "Alberto Tomba", "Malaya Reyes", "Sasa Petrovic", "Saša Ivanović", "Ana", "Bo", "Xu",
  "Dr. Mary Wambui", "Mary-Jane Smith-Jones", "Hermione Granger", "Anne-Marie", "O'Brien",
];

// Must be REJECTED.
const ABUSE = [
  // English
  "Fuck You", "f u c k", "fuuuuck", "F.U.C.K", "Fvck Off", "Bitch", "B1tch Please", "Shit Head", "Motherfucker", "Asshole",
  "cunt", "Pussy Lover", "Bastard", "Kill Yourself", "Your Mother", "nigger", "n1gger", "Faggot",
  // Kiswahili
  "Kuma Mamako", "kumamako", "kuma nyoko", "Kumanyoko", "Mkundu", "Kahaba Wewe", "Msenge", "Mjinga Sana", "Mpumbavu", "Mshenzi Wewe",
  "Takataka", "Nguruwe", "Nakutomba",
  // Sheng
  "Bwege", "Mafala",
  // Evasion
  "k u m a m a k o", "m.k.u.n.d.u", "Мјinga", "ＦＵＣＫ", "b!tch", "a$$hole",
];

// Must be REJECTED as random / not a name.
const JUNK = [
  "asdfgh", "qwerty", "zxcvbnm", "sdfgh jklmn", "12345", "0712345678", "John123", "J0hn Do3", "@@@@", "!!!!", "%%% ***",
  "www.cheapjobs.com", "Call 0712345678", "aaaaaa", "Hello my name is John", "I am looking for a job", "Test User", "admin",
  "Buy bitcoin now", "WhatsApp me", "please help me get a job abroad now", "x",
];

describe("Name Guard — legitimate names are never rejected (false positives)", () => {
  it("accepts or reviews every legitimate name", async () => {
    const fp: string[] = [];
    for (const n of LEGIT) {
      const d = await decide(n);
      if (d.decision === "reject") fp.push(`${n} → ${d.category} ${JSON.stringify(d.signals.hard)} ${d.signals.lexicon.map((h) => h.term)}`);
    }
    expect(fp).toEqual([]);
  });
  it("most common names are accepted outright (not just reviewed)", async () => {
    let accepted = 0;
    for (const n of LEGIT) if ((await decide(n)).decision === "accept") accepted++;
    expect(accepted / LEGIT.length).toBeGreaterThan(0.85);
  });
});

describe("Name Guard — abuse is blocked (false negatives)", () => {
  it("rejects offensive names in English, Kiswahili and Sheng, including evasions", async () => {
    const fn: string[] = [];
    for (const n of ABUSE) {
      const d = await decide(n);
      if (d.decision !== "reject") fn.push(`${n} → ${d.decision}`);
    }
    expect(fn).toEqual([]);
  });
  it("rejects random text, numbers, symbols, links, sentences and adverts", async () => {
    const fn: string[] = [];
    for (const n of JUNK) {
      const d = await decide(n);
      if (d.decision !== "reject") fn.push(`${n} → ${d.decision} ${JSON.stringify(d.signals)}`);
    }
    expect(fn).toEqual([]);
  });
  it("messages never reveal the matched word", async () => {
    const d = await decide("Kuma Mamako");
    expect(d.message).toMatch(/appropriate personal name/);
    expect(d.message?.toLowerCase()).not.toContain("kuma");
  });
});

describe("Name Guard — AI layer", () => {
  it("works when the AI is unavailable (throws or returns null)", async () => {
    const down = async () => { throw new Error("timeout"); };
    expect((await decide("Wanjiku Kamau", { ai: down })).decision).toBe("accept");
    expect((await decide("Kuma Mamako", { ai: down })).decision).toBe("reject");
    expect((await decide("Kuma Takeshi", { ai: down })).decision).toBe("review");
  });
  it("AI alone can never reject an unfamiliar name", async () => {
    const hostile = async () => ({ category: "CLEAR_PROFANITY" as const, confidence: 0.99, meaning: "x", language: "y" });
    // No lexicon hit and no random signal → AI cannot reject.
    expect((await decide("Ngwlwyd Mbwkr", { ai: hostile })).decision).not.toBe("reject");
    expect((await decide("Xochitl Quetzalli", { ai: hostile })).decision).toBe("accept");
  });
  it("AI can confirm an ambiguous lexicon hit", async () => {
    const offensive = async () => ({ category: "CLEAR_PROFANITY" as const, confidence: 0.95, meaning: "vulgar", language: "sw" });
    expect((await decide("Kuma Yako", { ai: offensive })).decision).toBe("reject");
    const plausible = async () => ({ category: "PLAUSIBLE_NAME" as const, confidence: 0.95, meaning: null, language: null });
    expect((await decide("Kuma Takeshi", { ai: plausible })).decision).toBe("review"); // lexicon hit keeps it flagged
  });
});

describe("Name Guard — whitelist / false-positive correction", () => {
  it("an admin-whitelisted name is always accepted", async () => {
    const allow = new Set([views("Malaya Reyes").joined]);
    expect((await decide("Malaya Reyes", { allow })).decision).toBe("accept");
    const allowWord = new Set([normTerm("Kuma")]);
    expect((await decide("Kuma Takeshi", { allow: allowWord })).decision).toBe("accept");
  });
});

describe("Name Guard — repeat abuse", () => {
  const now = Date.now();
  const ev = (minAgo: number, decision: "reject" | "accept" | "review", category = "offensive") => ({ at: new Date(now - minAgo * 60_000), decision, category });
  it("restricts after repeated offensive or random attempts in a short time", () => {
    expect(classifyAbuse([ev(1, "reject"), ev(2, "reject"), ev(3, "reject")], now).restricted).toBe(false);
    const r = classifyAbuse([ev(1, "reject"), ev(2, "reject"), ev(3, "reject"), ev(4, "reject", "random"), ev(5, "reject")], now);
    expect(r.restricted).toBe(true);
    expect(r.minutes).toBeGreaterThan(0);
  });
  it("one ambiguous or one bad attempt is never a restriction", () => {
    expect(classifyAbuse([ev(1, "review", "uncertain")], now).restricted).toBe(false);
    expect(classifyAbuse([ev(1, "reject")], now).restricted).toBe(false);
  });
  it("old attempts expire", () => {
    expect(classifyAbuse([ev(200, "reject"), ev(201, "reject"), ev(202, "reject"), ev(203, "reject"), ev(204, "reject")], now).restricted).toBe(false);
  });
});
