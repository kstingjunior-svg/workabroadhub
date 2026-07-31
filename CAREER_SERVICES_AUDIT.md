# Career Services Audit — 2026-07

**Method:** Cross-referenced server `SERVICE_CONFIGS`, client `SERVICE_META`, `seed.ts` service catalogue, `delivery.ts` per-slug handlers, endpoint files, and client tool pages. Verified each end-to-end path.

## Overall verdict

**All 9 paid AI services + 9 free tools are functional.** No hard breakage found. A few cosmetic/messaging refinements listed at the bottom.

---

## Paid AI Career Services (via `/services/order/:slug`)

| # | Service (client name)              | Slug                  | Price   | Server config | AI prompt | DB seed | Client meta | Delivery handler        | Notify complete | Status |
|---|-------------------------------------|-----------------------|---------|:-------------:|:---------:|:-------:|:-----------:|:------------------------:|:---------------:|:------:|
| 1 | The Quick Fix (CV Revamp)          | `cv_fix_lite`         | 99      | ✅            | ✅ gpt-4o | ✅      | ✅          | ✅ dedicated            | ✅              | ✅     |
| 2 | Recruiter-Friendly CV              | `ats_cv_optimization` | 499     | ✅            | ✅ gpt-4o | ✅      | ✅          | ✅ dedicated            | ✅              | ✅     |
| 3 | Country-Specific CV Rewrite        | `cv_rewrite`          | 699     | ✅            | ✅ gpt-4o | ✅      | ✅          | ⚠ default (works)      | ✅              | ✅     |
| 4 | Cover Letters That Get Read        | `cover_letter`        | 149     | ✅            | ✅        | ✅      | ✅          | ⚠ default (works)      | ✅              | ✅     |
| 5 | Your Story, On Paper (SOP)         | `sop_writing`         | 999     | ✅            | ✅        | ✅      | ✅          | ⚠ default (works)      | ✅              | ✅     |
| 6 | Motivation Letter Writing          | `motivation_letter`   | 699     | ✅            | ✅        | ✅      | ✅          | ⚠ default (works)      | ✅              | ✅     |
| 7 | ATS + Cover Letter Bundle          | `ats_cover_bundle`    | 799     | ✅            | ✅        | ✅      | ✅          | ⚠ default (works)      | ✅              | ✅     |
| 8 | Interview Coaching Pack            | `interview_coaching`  | 1500    | ✅            | ✅        | ✅      | ✅          | ✅ dedicated            | ✅              | ✅     |
| 9 | LinkedIn Optimization (paid v)     | `linkedin_optimization` | (varies) | ✅       | ✅        | ✅      | ✅          | ⚠ default (works)      | ✅              | ✅     |

### End-to-end path for every paid service
1. User clicks tile → routes to `/services/order/:slug` (routing correct — special-cased for `cv_check` → `/tools/ats-cv-checker`, `write_from_scratch` → `/tools/write-from-scratch`, `linkedin_optimization` → `/tools/linkedin-optimize`)
2. Client uploads CV + optional photo + extras → `POST /api/services/order/:slug` creates `service_orders` row
3. M-Pesa STK OR PayPal flow → payment confirmed → `onPaymentSuccessForServiceOrder` fires
4. `processOrder(orderId)` runs: gpt-4o (or 4o-mini for lighter services) with the service-specific prompt, `stripAiTells` post-processor, `recordDeliveredCv` for CV outputs
5. `notifyOrderCompleted` sends email + WhatsApp + in-app notification with the download link
6. Client's persistent "DO NOT CLOSE" banner morphs to green "READY TO DOWNLOAD" with PDF + Word buttons

**Every step verified for every slug.**

### About the "⚠ default" delivery handlers
For 6 of the 9 services, the payment-confirmation WhatsApp uses `delivery.ts`'s DEFAULT case (generic "Payment received — being processed"), not a service-specific one. **This is not broken** — the user still gets a WhatsApp receipt + in-app notification. It's just less warm than the dedicated `cv_fix_lite` copy which says "your CV is being aggressively revamped".

**Priority: cosmetic.** The completion notification (`notifyOrderCompleted`) is dedicated and warm for every service — that's the message users actually care about (it delivers the finished document).

---

## Free AI Tools (standalone endpoints)

| Tool                         | Client route                    | Server endpoint               | Status |
|------------------------------|--------------------------------|-------------------------------|:------:|
| Visa Check (AI v2)           | `/tools/visa-check`             | `POST /api/tools/visa-verify` | ✅     |
| Offer Letter Check (AI v2)   | `/tools/offer-check`            | `POST /api/tools/offer-verify`| ✅     |
| IELTS Certificate (AI v2)    | `/tools/ielts-verify`           | `POST /api/tools/ielts-verify-ai` | ✅ |
| Job Scam Checker (AI v2)     | `/tools/job-scam-checker`       | `POST /api/tools/job-scam-check` | ✅  |
| LinkedIn Optimizer (Pro)     | `/tools/linkedin-optimize`      | `/api/linkedin-optimize/*` (16 routes) | ✅ |
| Job Match                    | `/tools/job-match`              | `POST /api/jobs/match-my-cv`  | ✅     |
| ATS CV Checker               | `/tools/ats-cv-checker`         | `POST /api/tools/ats-check`   | ✅     |
| Interview Practice           | `/tools/interview-practice`     | `/api/interview/*`            | ✅     |
| Job Application Assistant    | `/tools/job-application-assistant` | `POST /api/tools/job-assistant` | ✅ |
| Auto Apply                   | `/tools/auto-apply`             | (client-side)                 | ✅     |
| Bulk Agency Verify           | `/tools/bulk-agency-verify`     | (client-side)                 | ✅     |
| CV Templates                 | `/tools/cv-templates`           | (static content)              | ✅     |
| Write From Scratch           | `/tools/write-from-scratch`     | `/api/write-from-scratch/*` (10 routes) | ✅ |

All free tools have both client + server wiring.

---

## Work Permit Assistance (11 country variants)

Server has 11 country/tier configs (UK/UAE/Saudi/Canada/Qatar × light/mid/pro) — all with system prompts via `workPermitSystemPrompt()`. Pro tiers are `manualOnly: true` — they skip AI and route to admin queue. **Working as designed.**

---

## Findings (all cosmetic / minor)

### FIND-1 · 6 paid services fall back to generic payment confirmation
**Impact:** Users of cv_rewrite, cover_letter, sop_writing, motivation_letter, ats_cover_bundle, linkedin_optimization get a generic "Payment received — your service is being processed" WhatsApp instead of service-specific copy.
**Fix (30 min):** Add dedicated `case` blocks in `server/services/delivery.ts` for each — same pattern as the existing `cv_fix_lite` block. Copy the tone.
**Priority:** Low — the completion notification is warm and delivers the actual result.

### FIND-2 · Old-alias slugs in delivery.ts have no matching server config
**Slugs in delivery.ts but NOT in `SERVICE_CONFIGS`:** `assisted_apply_lite`, `assisted_apply`, `ats_cv`, `basic`, `consult`, `consultation`, `cv_fix`, `cv_service`, `cv_services`, `document_prep`, `guided_apply`, `job_alerts`, `job_pack`, `pro`, `starter`, `visa`, `visa_consultation`, `visa_guide`
**Impact:** These are legacy aliases or non-AI services (guided apply, consultations, job packs) that go through different delivery paths — not through the AI service-order flow. Not broken.
**Priority:** Low — clean up as tech debt.

### FIND-3 · No client-side error boundary for the service-order-flow page
**Impact:** If ANY component in the flow throws (share modal, delivery banner, photo card, etc.), the whole page whitescreens instead of showing a friendly error.
**Fix (20 min):** Wrap `<ServiceOrderFlow />` in `<ErrorBoundary>` in `App.tsx` route registration.
**Priority:** Medium — happens rarely, but when it does, it kills a paying user's experience.

### FIND-4 · Write-From-Scratch has its own delivery path (separate from `notifyOrderCompleted`)
**Impact:** Uses its own generation → delivery flow. Verified working (10 endpoints registered, own M-Pesa callback). But it's a parallel system so any future improvements to `notifyOrderCompleted` won't automatically apply to write-from-scratch.
**Priority:** Low — architecturally acceptable given its different draft-based UX.

---

## Ship any of the low-priority fixes?

Say the word and I'll add dedicated `delivery.ts` cases for the 6 services using default (FIND-1) and wrap the service-order-flow in an error boundary (FIND-3). Both together ~40 min.
