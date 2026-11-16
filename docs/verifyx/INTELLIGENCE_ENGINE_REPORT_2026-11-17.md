# Intelligence Engine — technical report (17 Nov 2026)

Plan and audit: `INTELLIGENCE_ENGINE_PLAN.md`. This report covers what shipped, how it was tested, and what is left.

## Shipped

**One extraction call, more evidence (no new AI agents).** The offer-letter extraction prompt now also returns:
- every place the applicant is named, with page, location and confidence, plus any passport numbers and dates of birth shown;
- every payment the applicant is asked to make (amount, currency, purpose, payee, method, account).

PDFs with a text layer keep `=== Page N ===` markers, so locations are real. Output budget went from 2,400 to 3,200 tokens. That is the only cost increase, and there are no extra model calls.

**Deterministic checks** (`server/verifyx/forensics.ts`, pure):
- **Applicant name across the document.** Names are compared regardless of word order, titles or a missing middle name. Two names with no word in common produce a *confirmed discrepancy* only when both readings are at least 85% confidence. Otherwise the existing validator downgrades it to a risk indicator ("may be a reading error").
- **Passport numbers and dates of birth across locations.** Passport numbers are masked to their last 3 characters in every output.
- **Payment requests.**
  - A payment to a personal or mobile-money account is high priority.
  - For Canada, the reviewed hiring-fee rule is cited.
  - Government fees are never given an invented figure; the check links the official site instead.
- **Optional pasted recruiter email.** Checks:
  - a From and Reply-To mismatch;
  - a free mailbox used for a company;
  - a look-alike of the employer's domain (edit distance, or a different domain ending);
  - a sender domain different from the employer's;
  - payment wording;
  - pressure wording.

**Risk level and verification states** (`server/verifyx/risk.ts`):
- Every report now carries `risk`: LOW, MODERATE, HIGH, CRITICAL or INSUFFICIENT_EVIDENCE.
  - Each level comes with reasons and a recommended action.
  - Every report states: "This is a risk assessment, not a legal determination".
- It also carries five separate states:
  - authenticity confirmed by issuer (never "confirmed" without an issuer channel);
  - employer independently verified;
  - document internally consistent;
  - immigration information verified;
  - overall "Verification incomplete".
- The customer report shows these at the top, laid out mobile-first. Older stored reports without these fields still render.

**Private Scam Intelligence Network** (`server/intel/*`, migration `0059_intel_network.sql`):
- **Indexing.** Every finished offer check is indexed after the customer has their result:
  - recruiter phone, email, domain and name;
  - agency name;
  - payment accounts;
  - pasted-email sender;
  - a letter-template hash, which ignores the applicant's name and all numbers.
- **Matching.** Indicators are matched against other customers' checks and against all scam reports. Phones are normalised to the last 9 digits, so M-Pesa, WhatsApp and phone records match each other. Submissions by the same person (account, or reporter IP/UA hash) are not counted as independent.
- **Alerts.** A match creates an `intel_alerts` row and an `intel_alert` event to the admin socket room. Customers are told nothing.
- **What customers see.** A customer sees a neutral note only for details an admin marked **Confirmed**, and confirming requires an evidence note. Names can never be confirmed on their own. The note never names an agency and never says "scam".
- **False positives.** "False positive" stops alerts for that detail and dismisses the open ones. Every review is logged in `intel_review_log`.
- **Live data today.** 11 details link reports from different reporters (9 phone/M-Pesa numbers, 1 email, 1 bank account). All are unreviewed.

**Admin**
- **New page `/admin/intelligence`:**
  - stat cards: new matches, linked details, offer checks indexed, scam reports pending;
  - risk-level mix for the last 30 days;
  - forensics, payment and email finding counts;
  - match queue and all linked details;
  - an evidence dialog with the linked reports and checks, and Watch / Confirm / False positive / Reset actions;
  - an "Add them now" button that indexes earlier offer checks.
- **VerifyX case screen (Inspector):**
  - risk badge and the five verification states;
  - the confidence of every value read;
  - a **Review notes** box with Send to review / Approve report / False positive / Missed risk, scoped to the whole report or to one finding.

  These decisions go to `verifyx_review_cases` and the audit log. They feed the existing false-positive/negative metrics and never change the customer's report.

## Tests
- `tests/api/intel-engine.test.ts`: 23 tests, synthetic names and numbers only. They cover:
  - name equivalence;
  - mismatch confirmed vs downgraded;
  - passport masking;
  - payment rules;
  - email checks;
  - risk levels;
  - verification states;
  - an end-to-end `evaluateOffer` (synthetic letter → CRITICAL);
  - backward compatibility with old extractions;
  - phone/email/domain/account/name/template normalisation.
- Full API suite: 166/166 pass.
- Server and client `tsc` clean; vite build and esbuild bundle OK.
- The SQL in the unified indicator view was run read-only against production to confirm it parses and returns real links.

## Unchanged by this work
Accounts, subscriptions, M-Pesa, PayPal and tool-credit charging are untouched. The offer endpoint only gained an optional `recruiterEmail` text field. A failed intel lookup never blocks a report.

## After deploy (Tony)
1. Push, then wait for the Render deploy.
2. Open **Admin → Scam Intelligence** and press **Add them now** to index earlier offer checks still within the 30-day retention period.
3. Review the 11 linked details. Confirm only where the reports themselves support the link.

## Remaining phases (not built — each needs a decision or a data source)
| Phase | What it needs |
|---|---|
| Live fee tables for 11 countries | Per-country official fee pages sourced, dated and admin-reviewed as `verifyx_rules`. Until then, no fee figures are shown. |
| Employer web / company-registry search | An API (e.g. OpenCorporates, or a search API) plus a budget decision. |
| Multi-document cases | A `verifyx_cases` table and an upload flow for several files; the comparison functions are ready to reuse. |
| PDF download of the report | A server-side PDF render of the stored report. |
| Visa-check forensics on the same model | Extend the visa extraction with location-tagged identity, as was done for offers. |
| Specialist agents | Only where tests show an accuracy gain over the current single call. |
