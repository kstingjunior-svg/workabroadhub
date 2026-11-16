# WorkAbroadHub — AI Employment Intelligence Engine: audit + plan (2026-11-17)

## 1. What already exists (audited)

| Directive phase | Status before this work | Where |
|---|---|---|
| 8 Evidence pipeline | **Present.** Upload → byte-level file check → one extraction call (gpt-4o, JSON) → deterministic checks + registry lookups → `validateFindings()` (downgrades/rejects unsupported claims) → stored report, audit log, customer corrections, dispute/review queue. | `server/verifyx/*`, `server/offer-verify/analyzer.ts` |
| 3 Employer verification | **Partial.** UK sponsor register (synced), NL IND register (synced), Kenya NEA register (NEAIMS), email-domain DNS/MX, free/disposable mailbox checks. No company-registry or web search API configured. | `employer-lookup.ts`, `employer-findings.ts`, `source-sync.ts` |
| 4 Immigration intelligence | **Partial.** Official-source registry (19 sources, 6 reviewed rules), guidance-page change detection, per-country official links. No live fee tables. | `sources.ts`, `source-sync.ts`, `visa-verify/countries.ts` |
| 5 Fee / payment fraud | **Text patterns only** ("fee", "deposit", personal account). No structured amount / payee / purpose. Canada hiring-fee rule is the only reviewed fee rule. | `offer-verify/fraud-patterns.ts`, `offer-findings.ts` |
| 2 Document forensics | **Visa only** (MRZ check digits, MRZ vs printed DOB/expiry, PDF signature/incremental update). Offer letters: no per-page identity comparison; PDF text lost page boundaries. | `visa-findings.ts`, `guards.ts`, `utils/extract-text.ts` |
| 6 Recruiter / email investigation | **Partial** (sender domain vs website, MX). No pasted email, no Reply-To / look-alike domain checks. | `employer-findings.ts` |
| 7 Cross-document case | **Missing.** One document per request. | — |
| 9 Report UI | **Present** (6 evidence statuses, no verdicts). Missing: overall risk level and the separate verification states. No PDF download. | `client/src/components/verifyx-report.tsx` |
| 10 DB / RLS | **Present** — 14 `verifyx_*` tables, RLS on, server-only access. Passport numbers are never stored in plain text outside the extraction JSON; reports are purged on schedule. | `migrations/0055_verifyx_core.sql` |
| 13 Admin | **Present:** `/admin/verifyx` (volumes, outcomes, latency, cost, review queue with false-positive / false-negative flags, sources, rules). Missing: risk-level analytics, linked-indicator intelligence. | `client/src/pages/admin/verifyx.tsx` |
| Scam Intelligence Network | **Partial:** scam reports are cross-referenced with each other (`scam-cross-ref.ts`, 156 contacts / 84 reports). Offer checks are not linked to reports and there is no admin alert or review state. | `server/lib/scam-cross-ref.ts` |

Live volumes (17 Nov 2026): 40 VerifyX requests, 402 legacy offer checks, 503 visa checks, 84 scam reports (all pending review), 156 report contacts.

## 2. Priority plan (Tony's order) and what ships in this round

1. **Document forensics (shipped)** — the single extraction call now also returns every place the *applicant* is named (page, header/footer/body/signature block, with confidence) and passport numbers / dates of birth beside them. A deterministic comparison raises "Applicant name differs between parts of the document". It is shown as a *confirmed discrepancy* only when both readings are ≥85% confidence or confirmed by the customer; otherwise it is a risk indicator. PDF text keeps page markers so locations are real. Passport numbers are masked in every finding (last 3 characters).
2. **Official immigration fact-checking (partial — unchanged rules, no invented fees)** — payment requests are compared only against rules already reviewed against an official source (Canada hiring-fee rule). For other countries the report links the official fee page; it never states a fee figure we have not sourced. Live fee tables for the 11 countries are the next phase and need an admin-reviewed fee rule per country.
3. **Employer verification (unchanged + new verification state)** — the report now shows separately: issuer authenticity, employer verification, internal consistency, immigration information, and overall "verification incomplete".
4. **Recruitment fee intelligence (shipped)** — structured payment requests (amount, currency, purpose, payee, method) with a finding per request; payment to a personal / mobile-money account is high priority.
5. **Email / recruiter investigation (shipped)** — optional pasted recruiter email: From vs Reply-To, free mailbox for a company, look-alike of the employer's domain, sender domain vs letter domain, payment instructions and pressure wording in the email.
6. **Cross-document analysis (next)** — needs a "case" that groups several uploads; planned as `verifyx_cases` + reuse of the same comparison functions.
7. **Scam Intelligence Network (shipped, private)** — every offer check's recruiter phone / email / domain / payment account / recruiter name is matched against previous checks and scam reports. Matches create **admin-only alerts**. Nothing is shown to customers unless an admin marks the link "confirmed"; then the customer sees a neutral, evidence-reviewed note. Admins can mark false positives.
8. **Advanced admin analytics (shipped, first cut)** — `/admin/intelligence`: risk-level distribution, linked indicators, alerts, review actions.

## 3. Risk level rules (deterministic, explainable)

| Level | Rule |
|---|---|
| INSUFFICIENT EVIDENCE | Outcome is "insufficient information" (too little could be read or checked). |
| CRITICAL | A confirmed discrepancy on applicant identity, **or** a confirmed discrepancy together with a payment request, **or** an admin-confirmed link to reviewed scam reports together with a payment request. |
| HIGH | Any confirmed discrepancy, or any high-priority risk indicator / manual-review item. |
| MODERATE | Any other risk indicator or manual-review item. |
| LOW | None of the above. Shown with "low risk is not confirmation that the document is genuine". |

Every report states: "This is a risk assessment, not a legal determination."

## 4. Not done / needs a decision or a paid service

- Live fee tables for the 11 countries (needs per-country sourcing + admin review).
- Company-registry / web search for employers (needs an API: e.g. OpenCorporates or a search API key).
- Multi-document cases.
- PDF export of the report.
- Specialist agents — deliberately not built; the single extraction call + deterministic checks is cheaper and auditable.
