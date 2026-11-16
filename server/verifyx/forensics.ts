/**
 * Document forensics + payment + recruiter-email checks (Intelligence Engine,
 * increment 1 — 2026-11).
 *
 * PURE — no I/O. Inputs come from the single extraction call (where the
 * applicant is named on each page, which payments are requested) and from an
 * optional recruiter email the customer pasted. Every comparison here is
 * deterministic and reproducible; whether a contradiction is shown as
 * "confirmed" is still decided by validateFindings() (both readings must be
 * clear, or confirmed by the customer).
 *
 * Privacy: passport numbers are never echoed in full — only the last three
 * characters appear in a finding.
 */
import { makeFinding, OCR_CONFIRM_THRESHOLD, type Finding } from "./evidence";
import { FREE_EMAIL } from "./employer-findings";
import { registrableDomain } from "./names";
import { getSource, ruleSource } from "./sources";

// ── Types ───────────────────────────────────────────────────────────────

export interface IdentityMention {
  name: string | null;
  passportNumber: string | null;
  dateOfBirth: string | null;
  /** Where it appears, e.g. "page 1 header", "page 2 body", "signature block". */
  location: string;
  page: number | null;
  /** 0-100 how clearly this mention could be read. */
  confidence: number | null;
}

export interface PaymentRequest {
  amount: number | null;
  currency: string | null;
  purpose: string | null;
  payTo: string | null;
  method: string | null;
  accountRef: string | null;
  quote: string | null;
}

// ── Normalisation ───────────────────────────────────────────────────────

const HONORIFICS = /^(mr|mrs|ms|miss|dr|eng|prof|mx|sir|madam|hon)$/;

export function nameTokens(name: string | null | undefined): string[] {
  if (!name) return [];
  return name
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s'-]/g, " ")
    .split(/[\s'-]+/)
    .filter((t) => t.length > 1 && !HONORIFICS.test(t));
}

export type NameRelation = "same" | "variant" | "different" | "unknown";

/**
 * Compare two names without being fooled by order, titles, case or a missing
 * middle name. "different" = no token in common at all (after removing titles).
 * "variant" = shares a token but neither is contained in the other
 * (e.g. "Mary Wanjiku Otieno" vs "Mary Achieng Otieno").
 */
export function compareNames(a: string | null, b: string | null): NameRelation {
  const A = nameTokens(a), B = nameTokens(b);
  if (A.length === 0 || B.length === 0) return "unknown";
  const setB = new Set(B);
  const common = A.filter((t) => setB.has(t)).length;
  if (common === 0) {
    // Initials: "J. Kamau" vs "John Kamau" is handled by the shared surname;
    // with no shared token at all the names are different.
    return "different";
  }
  const aInB = A.every((t) => setB.has(t));
  const bInA = B.every((t) => new Set(A).has(t));
  if (aInB || bInA) return "same";
  return "variant";
}

export function normalizePassport(v: string | null | undefined): string | null {
  if (!v) return null;
  const s = v.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return s.length >= 5 && s.length <= 12 ? s : null;
}

export function maskPassport(v: string | null): string {
  const n = normalizePassport(v);
  if (!n) return "(unreadable)";
  return `•••••${n.slice(-3)}`;
}

/** YYYY-MM-DD only; anything else is ignored rather than guessed. */
function isoDate(v: string | null | undefined): string | null {
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

const confOf = (m: IdentityMention) => m.confidence;

// ── 1. Applicant identity across the document ──────────────────────────

export function identityFindings(mentions: IdentityMention[], now: Date): Finding[] {
  const at = now.toISOString();
  const out: Finding[] = [];
  const named = mentions.filter((m) => nameTokens(m.name).length > 0);

  // Names
  let worst: { a: IdentityMention; b: IdentityMention; rel: NameRelation } | null = null;
  for (let i = 0; i < named.length; i++) {
    for (let j = i + 1; j < named.length; j++) {
      const rel = compareNames(named[i].name, named[j].name);
      if (rel === "different" && worst?.rel !== "different") worst = { a: named[i], b: named[j], rel };
      else if (rel === "variant" && !worst) worst = { a: named[i], b: named[j], rel };
    }
  }
  if (worst?.rel === "different") {
    out.push(makeFinding({
      code: "applicant_name_mismatch", status: "confirmed_discrepancy", priority: "high", checkedAt: at,
      title: "Applicant name differs between parts of the document",
      examined: `Every place the applicant is named (${named.length} places found).`,
      documentSays: `${cap(worst.a.location)}: “${worst.a.name}”. ${cap(worst.b.location)}: “${worst.b.name}”.`,
      evidenceSays: "The two names share no name in common. One document issued to one person should name the same person throughout.",
      whyItMatters: "Offer letters edited from someone else's letter often keep the original person's name in a header, footer or second page.",
      howToVerify: "Ask the employer to confirm, in writing from its official email domain, the full name the offer was issued to. If you typed the name yourself, check it matches your passport.",
      documentRefs: [
        { field: `applicant@${worst.a.location}`, value: worst.a.name, ocrConfidence: confOf(worst.a) },
        { field: `applicant@${worst.b.location}`, value: worst.b.name, ocrConfidence: confOf(worst.b) },
      ],
      method: "deterministic", check: { name: "applicant_name_cross_location", version: 1, result: "different" },
    }));
  } else if (worst?.rel === "variant") {
    out.push(makeFinding({
      code: "applicant_name_variant", status: "potential_risk_indicator", priority: "medium", checkedAt: at,
      title: "Applicant name is written differently in different places",
      examined: `Every place the applicant is named (${named.length} places found).`,
      documentSays: `${cap(worst.a.location)}: “${worst.a.name}”. ${cap(worst.b.location)}: “${worst.b.name}”.`,
      evidenceSays: "The names share part of the name but differ in other parts.",
      whyItMatters: "Small differences are often typing mistakes, but your name must match your passport exactly for a visa or work permit.",
      howToVerify: "Ask the employer to correct the letter so your name matches your passport everywhere.",
      documentRefs: [
        { field: `applicant@${worst.a.location}`, value: worst.a.name, ocrConfidence: confOf(worst.a) },
        { field: `applicant@${worst.b.location}`, value: worst.b.name, ocrConfidence: confOf(worst.b) },
      ],
      method: "deterministic", check: { name: "applicant_name_cross_location", version: 1, result: "variant" },
    }));
  }

  // Passport numbers
  const pp = mentions.filter((m) => normalizePassport(m.passportNumber));
  const ppDiff = firstPair(pp, (a, b) => normalizePassport(a.passportNumber) !== normalizePassport(b.passportNumber));
  if (ppDiff) {
    const [a, b] = ppDiff;
    out.push(makeFinding({
      code: "applicant_passport_mismatch", status: "confirmed_discrepancy", priority: "high", checkedAt: at,
      title: "Two different passport numbers for the applicant",
      examined: "Passport numbers printed for the applicant.",
      documentSays: `${cap(a.location)} ends ${maskPassport(a.passportNumber)}; ${b.location} ends ${maskPassport(b.passportNumber)}.`,
      evidenceSays: "The same person cannot have two different passport numbers in one document.",
      whyItMatters: "A wrong passport number will be rejected by immigration, and can mean the letter was prepared for someone else.",
      howToVerify: "Compare both numbers with your passport, then ask the employer to correct the letter in writing.",
      documentRefs: [
        { field: `passport@${a.location}`, value: maskPassport(a.passportNumber), ocrConfidence: confOf(a) },
        { field: `passport@${b.location}`, value: maskPassport(b.passportNumber), ocrConfidence: confOf(b) },
      ],
      method: "deterministic", check: { name: "applicant_passport_cross_location", version: 1 },
    }));
  }

  // Dates of birth
  const dob = mentions.filter((m) => isoDate(m.dateOfBirth));
  const dobDiff = firstPair(dob, (a, b) => isoDate(a.dateOfBirth) !== isoDate(b.dateOfBirth));
  if (dobDiff) {
    const [a, b] = dobDiff;
    out.push(makeFinding({
      code: "applicant_dob_mismatch", status: "confirmed_discrepancy", priority: "high", checkedAt: at,
      title: "Two different dates of birth for the applicant",
      examined: "Dates of birth printed for the applicant.",
      documentSays: `${cap(a.location)}: ${isoDate(a.dateOfBirth)}; ${b.location}: ${isoDate(b.dateOfBirth)}.`,
      evidenceSays: "One person has one date of birth.",
      whyItMatters: "A wrong date of birth will not match your passport and can mean the letter was prepared for someone else.",
      howToVerify: "Check against your passport and ask the employer to correct the letter in writing.",
      documentRefs: [
        { field: `dob@${a.location}`, value: isoDate(a.dateOfBirth), ocrConfidence: confOf(a) },
        { field: `dob@${b.location}`, value: isoDate(b.dateOfBirth), ocrConfidence: confOf(b) },
      ],
      method: "deterministic", check: { name: "applicant_dob_cross_location", version: 1 },
    }));
  }
  return out;
}

/** Summary used by the "Document internally consistent" verification state. */
export function identityConsistency(mentions: IdentityMention[]): "consistent" | "inconsistent" | "not_enough" {
  const named = mentions.filter((m) => nameTokens(m.name).length > 0);
  const clear = named.filter((m) => (m.confidence ?? 0) >= OCR_CONFIRM_THRESHOLD);
  if (clear.length < 2) return "not_enough";
  for (let i = 0; i < named.length; i++)
    for (let j = i + 1; j < named.length; j++)
      if (compareNames(named[i].name, named[j].name) !== "same") return "inconsistent";
  const pp = new Set(mentions.map((m) => normalizePassport(m.passportNumber)).filter(Boolean));
  const dob = new Set(mentions.map((m) => isoDate(m.dateOfBirth)).filter(Boolean));
  return pp.size > 1 || dob.size > 1 ? "inconsistent" : "consistent";
}

// ── 2. Payment requests ─────────────────────────────────────────────────

const PERSONAL_PAYEE = /\b(m-?pesa|mpesa|airtel money|send money|till|paybill|western union|moneygram|world ?remit|crypto|bitcoin|usdt|binance|personal account|agent'?s? (?:number|phone))\b/i;
const GOVT_PURPOSE = /\b(visa application fee|government fee|immigration fee|biometric|vfs|tls ?contact|embassy fee|ihs|immigration health surcharge)\b/i;

export function paymentFindings(payments: PaymentRequest[], countryCode: string | null, now: Date, officialFeeUrl: string | null): Finding[] {
  const at = now.toISOString();
  const out: Finding[] = [];
  payments.slice(0, 5).forEach((p, i) => {
    const amt = p.amount != null ? `${p.currency ?? ""} ${p.amount.toLocaleString("en-US")}`.trim() : "an amount";
    const toPerson = PERSONAL_PAYEE.test(`${p.method ?? ""} ${p.payTo ?? ""} ${p.accountRef ?? ""}`);
    const govt = GOVT_PURPOSE.test(`${p.purpose ?? ""} ${p.quote ?? ""}`);
    const caRule = countryCode === "CA" && !govt;
    out.push(makeFinding({
      code: toPerson ? "payment_to_personal_account" : "payment_requested",
      status: "potential_risk_indicator", priority: toPerson || caRule ? "high" : "medium", checkedAt: at,
      title: toPerson ? `You are asked to pay ${amt} to a personal or mobile-money account` : `You are asked to pay ${amt}`,
      examined: "Payment instructions in the document.",
      documentSays: [
        p.purpose ? `Purpose: ${p.purpose}.` : null,
        p.payTo ? `Pay to: ${p.payTo}.` : null,
        p.method ? `Method: ${p.method}.` : null,
        p.quote ? `“${p.quote.slice(0, 200)}”` : null,
      ].filter(Boolean).join(" ") || "A payment is requested.",
      evidenceSays: caRule
        ? "Canadian regulations prohibit employers of temporary foreign workers from charging, or letting recruiters charge, hiring fees (government application fees excluded)."
        : govt
          ? "Government visa fees are paid to the government or its official visa centre, not to an employer or recruiter. We have not checked this amount against an official fee table."
          : "We have not found an official requirement for a worker to pay this. Legitimate employers normally pay their own recruitment costs.",
      whyItMatters: toPerson
        ? "Money sent to a personal or mobile-money account is very hard to recover, and is the most common way job scams collect payment."
        : "Being asked to pay to get a job is the most common pattern in overseas job fraud reported to us.",
      howToVerify: govt
        ? "Pay government fees only on the official government or visa-centre website, and compare the amount with the fee published there."
        : "Do not pay until the employer confirms the payment in writing from its official email, and you have checked the agency on the NEA register.",
      howToVerifyUrl: govt ? (officialFeeUrl ?? undefined) : getSource("ke_nea_register")?.url,
      source: caRule ? ruleSource("CA.EMPLOYER.NO_HIRING_FEES") : undefined,
      uncertainty: "Read from the document; the purpose and payee are as written there.",
      documentRefs: [{ field: `payment#${i + 1}`, value: amt, ocrConfidence: null }],
      method: "text_pattern", check: { name: "payment_request", version: 1, result: { toPerson, govt } },
    }));
  });
  return out;
}

// ── 3. Recruiter email (pasted by the customer) ─────────────────────────

export interface ParsedEmail {
  from: string | null;
  replyTo: string | null;
  returnPath: string | null;
  body: string;
}

const EMAIL_RX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

function header(text: string, name: string): string | null {
  const m = new RegExp(`^\\s*${name}\\s*:\\s*(.+)$`, "im").exec(text);
  if (!m) return null;
  const e = EMAIL_RX.exec(m[1]);
  return e ? e[0].toLowerCase() : null;
}

export function parsePastedEmail(raw: string | null | undefined): ParsedEmail | null {
  if (!raw) return null;
  const text = raw.slice(0, 20_000);
  if (text.trim().length < 20) return null;
  const from = header(text, "from") ?? (EMAIL_RX.exec(text)?.[0].toLowerCase() ?? null);
  return { from, replyTo: header(text, "reply-to"), returnPath: header(text, "return-path"), body: text };
}

/** Levenshtein distance (small strings only). */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

export function isLookalike(candidate: string, real: string): boolean {
  if (!candidate || !real || candidate === real) return false;
  const c = candidate.split(".")[0], r = real.split(".")[0];
  if (c === r) return candidate !== real; // same name, different ending (e.g. .co vs .com)
  if (r.length < 4) return false;
  return editDistance(c, r) <= (r.length >= 8 ? 2 : 1) || (c.includes(r) && c !== r);
}

const EMAIL_PAY = /\b(pay|payment|deposit|processing fee|registration fee|visa fee|medical fee|ticket fee|send (?:the )?money|m-?pesa|western union|moneygram)\b/i;
const EMAIL_PRESSURE = /\b(within (?:24|48|72) ?h(?:ours|rs)?|today only|urgent(?:ly)?|immediately|last chance|slot (?:will be )?(?:given|lost)|limited slots?)\b/i;

export function emailFindings(
  email: ParsedEmail | null,
  ctx: { employerName: string | null; companyWebsite: string | null; letterEmail: string | null },
  now: Date,
): Finding[] {
  if (!email) return [];
  const at = now.toISOString();
  const out: Finding[] = [];
  const fromDom = email.from ? registrableDomain(email.from.split("@")[1]) : "";
  const replyDom = email.replyTo ? registrableDomain(email.replyTo.split("@")[1]) : "";
  const officialDom = ctx.companyWebsite ? registrableDomain(ctx.companyWebsite)
    : ctx.letterEmail && !FREE_EMAIL.has(registrableDomain(ctx.letterEmail.split("@")[1])) ? registrableDomain(ctx.letterEmail.split("@")[1]) : "";

  if (email.from && email.replyTo && fromDom !== replyDom) {
    out.push(makeFinding({
      code: "email_reply_to_differs", status: "potential_risk_indicator", priority: "high", checkedAt: at,
      title: "Replies to the email go to a different address",
      examined: "The From and Reply-To lines of the email you pasted.",
      documentSays: `From: ${email.from}. Reply-To: ${email.replyTo}.`,
      whyItMatters: "Setting a different Reply-To is a common way to make an email look like it came from a company while answers go to someone else.",
      howToVerify: "Write to the employer using an address from its official website, not by pressing Reply.",
      method: "deterministic", check: { name: "email_reply_to", version: 1 },
    }));
  }
  if (fromDom && FREE_EMAIL.has(fromDom) && ctx.employerName) {
    out.push(makeFinding({
      code: "email_free_mailbox_for_company", status: "potential_risk_indicator", priority: "medium", checkedAt: at,
      title: "The recruiter writes from a free personal mailbox",
      examined: "The sender address of the email you pasted.",
      documentSays: `Sender: ${email.from}, writing for ${ctx.employerName}.`,
      whyItMatters: "Established employers normally email from their own company domain.",
      howToVerify: "Find the employer's official website yourself and confirm the offer through the contact details listed there.",
      method: "deterministic", check: { name: "email_free_mailbox", version: 1 },
    }));
  }
  if (fromDom && officialDom && fromDom !== officialDom) {
    const look = isLookalike(fromDom, officialDom);
    if (look || !FREE_EMAIL.has(fromDom)) {
      out.push(makeFinding({
        code: look ? "email_lookalike_domain" : "email_domain_differs_from_employer",
        status: "potential_risk_indicator", priority: look ? "high" : "medium", checkedAt: at,
        title: look ? "The sender's domain looks like the employer's but is different" : "The email comes from a different domain than the employer's",
        examined: "The sender domain compared with the employer domain on the letter.",
        documentSays: `Email domain: ${fromDom}. Employer domain on the letter: ${officialDom}.`,
        whyItMatters: look
          ? "Domains that differ by one or two characters from a real company are registered to impersonate it."
          : "Recruiters can use their own domain, but you should confirm they act for this employer.",
        howToVerify: "Type the employer's web address yourself and confirm the recruiter through the contact details listed there.",
        method: "deterministic", check: { name: "email_domain_vs_employer", version: 1, result: { fromDom, officialDom, look } },
      }));
    }
  }
  const pay = EMAIL_PAY.exec(email.body);
  if (pay) {
    out.push(makeFinding({
      code: "email_requests_payment", status: "potential_risk_indicator", priority: "high", checkedAt: at,
      title: "The recruiter's email talks about paying money",
      examined: "The text of the email you pasted.",
      documentSays: `“${snippet(email.body, pay.index)}”`,
      whyItMatters: "Being asked to pay to get a job is the most common pattern in overseas job fraud reported to us.",
      howToVerify: "Do not pay until the employer confirms in writing from its official email, and check the agency on the NEA register.",
      howToVerifyUrl: getSource("ke_nea_register")?.url,
      uncertainty: "Based on wording; the context may change its meaning.",
      method: "text_pattern", check: { name: "email_payment_wording", version: 1 },
    }));
  }
  const pr = EMAIL_PRESSURE.exec(email.body);
  if (pr) {
    out.push(makeFinding({
      code: "email_pressure", status: "potential_risk_indicator", priority: "medium", checkedAt: at,
      title: "The email pushes you to act quickly",
      examined: "The text of the email you pasted.",
      documentSays: `“${snippet(email.body, pr.index)}”`,
      whyItMatters: "Short deadlines stop people from checking. Real employers give time to review a contract.",
      howToVerify: "Take the time you need. Ask for the deadline to be confirmed by the employer directly.",
      uncertainty: "Based on wording; the context may change its meaning.",
      method: "text_pattern", check: { name: "email_pressure_wording", version: 1 },
    }));
  }
  return out;
}

// ── helpers ─────────────────────────────────────────────────────────────

function cap(s: string): string { return s ? s[0].toUpperCase() + s.slice(1) : s; }
function snippet(text: string, idx: number): string {
  const start = Math.max(0, idx - 60);
  return text.slice(start, idx + 100).replace(/\s+/g, " ").trim();
}
function firstPair<T>(xs: T[], diff: (a: T, b: T) => boolean): [T, T] | null {
  for (let i = 0; i < xs.length; i++) for (let j = i + 1; j < xs.length; j++) if (diff(xs[i], xs[j])) return [xs[i], xs[j]];
  return null;
}

// ── Parsing model output safely ─────────────────────────────────────────

export function parseMentions(v: any): IdentityMention[] {
  if (!Array.isArray(v)) return [];
  return v.slice(0, 12).map((m: any) => ({
    name: typeof m?.name === "string" && m.name.trim() ? m.name.trim().slice(0, 120) : null,
    passportNumber: typeof m?.passportNumber === "string" ? m.passportNumber.trim().slice(0, 20) : null,
    dateOfBirth: typeof m?.dateOfBirth === "string" ? m.dateOfBirth.trim().slice(0, 10) : null,
    location: typeof m?.location === "string" && m.location.trim() ? m.location.trim().slice(0, 60).toLowerCase() : "unspecified place",
    page: Number.isFinite(Number(m?.page)) ? Number(m.page) : null,
    confidence: Number.isFinite(Number(m?.confidence)) ? Math.max(0, Math.min(100, Math.round(Number(m.confidence)))) : null,
  })).filter((m) => m.name || m.passportNumber || m.dateOfBirth);
}

export function parsePayments(v: any): PaymentRequest[] {
  if (!Array.isArray(v)) return [];
  const s = (x: any, n = 200) => (typeof x === "string" && x.trim() ? x.trim().slice(0, n) : null);
  return v.slice(0, 8).map((p: any) => {
    const n = typeof p?.amount === "string" ? Number(p.amount.replace(/[^0-9.]/g, "")) : Number(p?.amount);
    return {
      amount: Number.isFinite(n) && n > 0 ? n : null,
      currency: s(p?.currency, 8), purpose: s(p?.purpose), payTo: s(p?.payTo), method: s(p?.method, 80),
      accountRef: s(p?.accountRef, 80), quote: s(p?.quote, 300),
    };
  }).filter((p) => p.amount != null || p.quote || p.purpose);
}
