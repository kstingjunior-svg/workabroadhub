# Kazi Karibu — Individual Employer Postings Strategy

**Version:** 1.0 (2026-07-03)
**Author:** WorkAbroad Hub product-architecture working session
**Prior art:** `docs/nanjila/OS_EVOLUTION_PLAN.md`, `docs/nanjila/MASTER_PLAN.md`, `docs/LEGAL_COMPLIANCE_AUDIT.md`
**Status:** Approved by founder — build begins Phase 1 after this doc is committed

---

## 0. Executive summary

WorkAbroad Hub today has two job surfaces: the **Overseas board** (formal recruiters, visa-sponsored roles) and **Kenya Careers** (approved Kenyan employers — Naivas, Quickmart, hospitals). This document defines a third surface: **Kazi Karibu** — "Job Nearby" — where individual Kenyans, households, and micro-businesses post short-term or informal work: house helps, cooks, drivers, tutors, fundis, cleaners, gardeners, watchmen.

The value proposition to the user: *"WorkAbroad Hub is where you find work — including the kind of work you can start tomorrow, not just the visa jobs 8 months away."*

The economic proposition to the business: **posters pay to list, applicants apply free**. Every post is a paid transaction that funds moderation, KYC, and Nanjila pre-publish review. The fee itself is the first fraud filter.

The instruction is clear: **we do not launch until the six-layer trust model is enforced**. One viral scam post can undo years of trust. This document exists to hold that line.

---

## Part I — Product foundation

## 1. Rules of engagement

Ratified constraints that bind every recommendation in this document:

1. **No cross-contamination with existing tiers.** Kazi Karibu posting fees are *service payments* (like CV Fix Lite), not subscription payments. Buying a post never grants overseas Pro access. This mirrors the "CV Fix Lite separation" rule already enforced in `server/routes.ts` (§CANONICAL_TIERS).
2. **No poster is anonymous.** Every post is tied to a phone-verified WorkAbroad Hub account, an M-Pesa payment record, and a public poster profile. No "guest posting."
3. **No applicant pays.** Applicants apply free with their existing WAH profile. Any post that asks the applicant for upfront money is auto-rejected at Layer 3.
4. **No direct contact leak.** Applicants do not see poster phone numbers or emails until the poster releases them in-platform. Contact isolation is a design invariant, not an option.
5. **No launch without moderation coverage.** If admin moderation isn't staffed to hit our target response SLA (below), we don't turn the feature on. Better to delay than to launch a fraud vector.
6. **Feature-flagged rollout.** The whole surface is behind `KAZI_KARIBU_ENABLED` (default OFF). Pilot Nairobi-only for 30 days before expanding.
7. **Reuse over rebuild.** M-Pesa STK, KYC, scam rules, Nanjila orchestrator, fraud_reports, admin queue — all exist. This feature is a composition of them, not a new stack.

## 2. Scope

**In scope for Phase 1:** short-term, individual-poster job postings within Kenya. Payment gate. Automated rules. Nanjila pre-publish review. Applicant apply flow with contact isolation. Admin moderation queue. Basic reputation record (post-hire feedback captured, not yet surfaced).

**In scope for Phase 2:** Verified Poster badge (ID + selfie KYC). In-platform messaging. Post-hire feedback surfaced as reputation on posts. Boost/featured tier.

**In scope for Phase 3:** Bulk poster subscription tier for micro-businesses. Optional escrow. Category expansion. Regional pricing tiers.

**Explicitly out of scope, permanently:** overseas jobs (that's the main platform); business-opportunity/MLM posts; loans and financial services; anything asking for a training fee or starter-kit purchase; adult/escort work; anything drug-mule adjacent; job placements where WAH is the employer of record (we are a listing platform, not a staffing agency).

## 3. Categories

### Allowed at Phase 1

| Category | Typical posters | Typical duration |
|---|---|---|
| House help / nanny | Households | Recurring / permanent |
| Cleaner (one-off or recurring) | Households, small offices | Half-day to weekly |
| Cook / caterer | Households, event organizers | One-off or recurring |
| Driver (day rate or contract) | Households, small businesses | Daily / weekly |
| Fundi — mason, plumber, electrician, painter, carpenter | Households, landlords | Project-based |
| Delivery / errand runner | Small shops, individuals | Same-day / daily |
| Security guard / watchman | Households, small businesses | Nightly / recurring |
| Gardener / shamba boy | Households | Weekly / recurring |
| Tutor (primary / secondary / adult) | Parents | Recurring |
| Sales promoter (single event) | Event organizers, brands | 1-3 days |

### Rejected outright (rule engine blocks at submit)

- Overseas placement of any kind → goes to the main board, not this one.
- "Business opportunity", MLM, network marketing, agency recruitment for "unlimited earnings".
- Loans, "quick money", cash advance.
- Adult, escort, massage-adjacent, "companionship."
- Anything asking applicants to pay training fees, buy starter kits, deposit refundable amounts, or purchase products first.
- "Move packages", "carry items across borders", "deliver items on my behalf without opening" — drug-mule pattern.
- Positions where the poster is impersonating a corporate employer (Naivas, KRA, banks, etc.) — those must go through Kenya Careers with company verification.

## 4. Position relative to existing surfaces

| Axis | Overseas board | Kenya Careers | **Kazi Karibu (new)** |
|---|---|---|---|
| Poster | Licensed recruiter / employer | Approved corporate employer | Individual Kenyan or micro-business |
| Duration horizon | 3-12 months to placement | Weeks to hire | Same-day to few weeks |
| Fee model | Applicant subscription (KES 99/1000/4500 for time-bounded access) | Applicant subscription (same) | **Poster pays per post** (KES 100+) |
| Applicant charged? | Yes (access subscription) | Yes (access subscription) | **No** — free to apply |
| Contact model | Recruiter contacts shortlisted | Employer contacts shortlisted | Contact-isolated in-platform |
| KYC on poster | Company license verified | Company registration verified | Phone + optional Verified badge |
| Moderation | Recruiter onboarding + spot checks | Corporate approval on signup | Every post moderated |

Kazi Karibu is the only surface where the *poster* pays and the *applicant* is free. This inversion is deliberate: it makes each post a self-funded moderation transaction and puts the fraud cost on the party most likely to be a fraudster.

## 5. Non-goals

- We are **not** competing with employment agencies. We do not vet workers, guarantee outcomes, or hold employer/employee relationships.
- We are **not** an escrow service in Phase 1. Money changes hands off-platform. (Phase 3 revisits this.)
- We are **not** replacing WhatsApp groups for local hiring. We're offering a searchable, moderated, reputation-tracked alternative that WhatsApp cannot provide.
- We are **not** promising instant hires. Marketing must avoid "hire in 24 hours" language even if that often happens.

---

## Part II — The Six-Layer Trust Model

The core design principle: **no single layer is trusted to stop fraud alone**. Each layer stops a different class of joker. Removing any one layer creates a specific fraud vector we can predict.

## 6. Layer 1 — Payment gate

**Rule:** No post goes live without a successful M-Pesa payment recorded in `payments` with `service_type = 'kazi_karibu_post'`.

**Why it works:** KES 100 is small enough that a legitimate household doesn't blink but large enough that "let me post 50 fake jobs" becomes KES 5,000 — an unattractive economics for a scammer whose expected return per fake post is under KES 500.

**Implementation reuse:** existing M-Pesa STK push pipeline (`server/lib/mpesa-*.ts`, `server/routes/payments.ts`). New `service_type` code added to the `services` catalogue. On successful callback, the post moves from `draft` to `pending_moderation`. On failed/timed-out callback, the draft is retained for 24 hours in case the user retries payment, then purged.

**Refund policy:** Payment forfeit if the post fails moderation for fraud (Layer 3 or 4). Payment refunded if the post fails moderation for a fixable reason (missing info, ambiguous language) and the poster does not re-submit within 48 hours. This is written into the terms shown at checkout.

**Metric to watch:** `pct_posts_paid_but_rejected` — if this rises above 15%, the rule engine is too aggressive and needs tuning. If it drops below 2%, the rule engine may be missing fraud.

## 7. Layer 2 — Poster identity

**Rule:** Every poster must have a WorkAbroad Hub account (already required for payment), phone-verified via OTP within the last 90 days, and the M-Pesa payer number must match the account's registered phone.

**Why it works:** This ties every post to a real, contactable Kenyan phone number owned by the poster. Burner numbers can be rate-limited and blocked. Fraudsters willing to spin up new SIMs face SIM-registration friction (Kenya requires ID for SIM registration under the Kenya Information and Communications Act).

**Implementation reuse:** existing OTP flow (`server/routes/auth-phone.ts` or equivalent), existing `users.phone_verified_at` column. New check: at post submit, if `phone_verified_at < NOW() - INTERVAL '90 days'`, force re-verify. New check: M-Pesa payer phone must equal `users.phone` (normalized to +254 form).

**Failure mode handled:** poster paying from someone else's phone. In that case they must attach the payer as a "billing contact" and it's flagged for human review at Layer 4.

**Metric:** `pct_posts_mismatched_payer` — should be under 3% for legitimate use.

## 8. Layer 3 — Automated content review

**Rule:** Every submitted post runs through a rule engine before it can be paid for. Rules are ordered by strictness: **auto-reject rules** block the post outright with a friendly explanation; **flag rules** allow the post to proceed but mark it for enhanced review at Layer 4.

### Auto-reject patterns

Reused from and extended beyond `server/lib/job-scam-checker.ts`:

| Pattern | Example match | Reason surfaced to poster |
|---|---|---|
| Applicant-pays language | "pay KES 500 for uniform first" | "Kazi Karibu never asks applicants to pay. Please remove any payment requests to applicants." |
| Guaranteed / no-interview | "guaranteed placement", "no interview needed" | "Real employers interview. Please remove language that implies guaranteed hiring." |
| Overseas placement | "we place you in Dubai", "travel to Qatar" | "Overseas placements belong on our main board, not Kazi Karibu. Please post there instead." |
| MLM / opportunity | "unlimited earnings", "be your own boss", "team leader position" | "Business opportunities are not allowed on Kazi Karibu." |
| Adult-adjacent | "companion", "massage" with vague scope | "This category isn't supported." |
| Drug-mule pattern | "carry items", "no questions asked", "sealed packages" | "This description contains language associated with unsafe roles." |
| Impersonation of corporate | "Naivas is hiring", "KRA has openings" | "Corporate employers must post on Kenya Careers with company verification." |
| Blocked contact | Phone/email matches `fraud_reports` blocked list | "This account has an existing safety flag. Please contact support." |

### Flag patterns (proceed but review)

| Pattern | Reason |
|---|---|
| Vague location ("anywhere in Kenya" for a house help) | Real households have a specific location. |
| Suspicious pay ("KES 50,000/day for casual labour") | Either data entry error or bait. |
| Text duplicates an existing live post >70% | Copy-paste spam suspect. |
| Gmail/Yahoo contact for a "business" | Real businesses use branded email. |
| Salary said "negotiable" AND no budget range | Missing information invites confusion. |
| Foreign-sounding poster name inconsistent with M-Pesa account | Not a fraud signal alone but a review prompt. |

**Implementation reuse:** the scam-checker rule engine that already powers the free Job Scam Checker tool. Same code, same patterns, same categorized outputs. New rule additions live in a shared `server/lib/scam-rules.ts` so both the free public tool and the post-submit gate stay in sync.

**Metric:** `layer3_auto_reject_rate` and `layer3_flag_rate` per week. Track false-positive complaints via a support form on the rejection page.

## 9. Layer 4 — Nanjila pre-publish review

**Rule:** Every post that passes Layer 3 goes to Nanjila for an AI-based coherence + safety review before it goes live. Nanjila either approves, requests clarification from the poster, or escalates to human moderation.

### The three possible Nanjila outputs

1. **APPROVE** — post publishes immediately. Nanjila's review record is saved to `kazi_karibu_moderation` with her confidence score and a one-line rationale.
2. **CLARIFY** — Nanjila returns a specific question to the poster in-app: *"You listed the location as 'Nairobi' — which sub-county or estate? Applicants need to know if the commute works for them."* The poster edits and resubmits without paying again. Payment is held.
3. **HOLD** — post goes to human moderation queue with Nanjila's suspicion note attached. Payment is held. Applicant-side visibility is zero.

### Prompt architecture

Nanjila's review runs on `gpt-4o-mini` for cost (~$0.001 per review). She is given: the post text, poster's phone-verified status, poster's prior-post history (count, moderation outcomes), and the specific flag reasons from Layer 3 if any. She is told her three possible outputs and required to output structured JSON so the server can act on her decision programmatically.

Full prompt lives in Appendix C.

**Why it works:** rule engines catch pattern matches. Nanjila catches *semantic* problems — a description that reads coherent to a regex but is obviously off to a native reader. She catches: internally inconsistent posts ("part-time house help but must live in"), unrealistic pay for the work described, red flags that don't have a keyword, and copy that reads like it was translated from another language and re-worded to evade filters.

**Implementation reuse:** the Nanjila orchestrator capability manifest we just built (`server/nanjila/capabilities/index.ts`). New capability slug: `kazi_karibu_review`. Runs as a synchronous call at post submit, not queued — the user waits ~3-5 seconds and sees the result. Enabled/disabled via `NANJILA_KAZI_KARIBU_REVIEW_ENABLED` flag so we can turn it off if OpenAI has an outage without blocking new posts (they fall through to human review instead).

**Cost model:** at 500 posts/day × $0.001 = $0.50/day = ~$15/month in Nanjila review costs. Revenue at 500 posts/day at KES 100 = KES 50,000/day = KES 1.5M/month. Nanjila cost is 0.03% of revenue. Trivial.

**Metric:** `nanjila_approve_rate`, `nanjila_clarify_rate`, `nanjila_hold_rate`, `nanjila_hold_confirmed_fraud_rate` (of holds, how many turned out to be real fraud). If confirmed-fraud rate drops below 20%, Nanjila is too aggressive. If it rises above 60%, she's missing signals.

## 10. Layer 5 — Applicant safety and contact isolation

**Rule:** The poster's phone number and email are **never** on the public post page. Applicants apply via a "Show interest" button that shares the applicant's profile with the poster inside the platform. The poster decides who to reveal their contact to, in-platform, and only after seeing the applicant's profile.

### The applicant flow

1. Applicant sees the post (poster shown as "Verified household in Kileleshwa" or "Small business in Umoja" — county + generic type, no direct name unless the poster has opted-in to name display).
2. Applicant hits "Show interest" — shares their WAH profile (name, county, relevant experience fields).
3. Poster gets a notification with the applicant's profile — reviews it.
4. Poster picks a shortlist of applicants. For each, either (a) reveals their direct contact to that specific applicant (opt-in per applicant), or (b) messages them in-platform.

**Why it works:** kills mass-scraping of poster contacts, gives us moderation visibility on every message the poster sends, lets us do a final AI check on any suspicious message (e.g. a poster asking an applicant for a "deposit for uniforms" gets flagged mid-conversation).

**Second-order benefit:** we can measure conversion. How many "show interest" clicks convert into contact reveals convert into confirmed hires? This becomes the funnel we optimize.

**Phase 1 simplification:** in-platform messaging isn't built until Phase 2. In Phase 1, contact reveal is a one-way action — the poster clicks "reveal my contact to this applicant" and the applicant sees the poster's phone. All reveals are logged in `kazi_karibu_contact_reveals` with timestamps. If a scam is reported later, we can trace exactly which applicants that poster contacted and warn them.

## 11. Layer 6 — Post-hire feedback loop

**Rule:** After a post's `expires_at`, both sides get an optional feedback prompt. Their responses build reputation over time.

### The two feedback prompts

**To applicants who "showed interest":** "Did [Poster Name] follow up? If yes, did the job happen? Were you paid what was agreed?" Answer options: Yes / No / Prefer not to say. Optional free-text.

**To posters:** "Did you hire from Kazi Karibu? How would you rate the applicants you interviewed?"

**Why it works:** reputation is the long-term trust engine. Real posters accumulate confirmed hires. Fake posters can't — their fake posts don't turn into hires because no worker actually gets paid. Applicants can filter for "posters with 3+ confirmed hires." Over 6-12 months this creates a two-sided flywheel that Facebook Marketplace and WhatsApp groups fundamentally cannot: verified hire history.

**Non-response handling:** absence of confirmation is not a negative signal (many hires happen quietly, people don't fill out the form). Only *negative* confirmations count against a poster.

**Metric:** `pct_expired_posts_with_at_least_one_confirmation` (target: >20% after 3 months). Below that, the feedback prompt isn't working and we redesign it.

## 12. Enforcement teeth

Rules only matter if breaking them costs something.

| Event | Consequence |
|---|---|
| First auto-reject | Free retry after edit. Educational. |
| Second auto-reject in 30 days | Account flagged. Next attempt requires enhanced review. |
| Confirmed fake post (moderator or reported by applicants) | Account suspended pending appeal. KES 100 forfeited. Post removed from all history. |
| Second confirmed fake post | **Permanent ban** of the phone number, the M-Pesa payer number, and the WAH account. Cross-referenced into `fraud_reports`. |
| Attempted signup with a banned phone number | Blocked at OTP. Log the attempt. |
| Multiple applicant safety reports on the same poster | Auto-hold all posts by that poster pending review. |
| Applicant reports poster asked for payment | Poster's account frozen instantly. Nanjila messages all applicants who "showed interest" to warn them. |

**Public transparency:** a small counter on the Kazi Karibu landing page reads *"This month we've removed [N] fraudulent posts to keep applicants safe."* Turns enforcement into a trust signal.

**Legal frame:** the terms of service explicitly reference the Kenyan Computer Misuse and Cybercrimes Act (2018), Section 22 (false publication) and Section 24 (identity theft), reserving the right to report to authorities. We probably never do it. But the pointer is there and posted where posters can see it before they pay.

---

## Part III — Revenue model

## 13. Pricing (Phase 1)

| Tier | Price | What it includes |
|---|---|---|
| **First post free** | KES 0 | New account only, phone-verified. One-shot; still passes all six trust layers. Prevents "the KES 100 kept me out" complaint. |
| **Standard post** | KES 100 | 7 days active. All trust layers. Standard placement. |
| **Boost / Featured** (Phase 2) | KES 500 | 7 days pinned to top of category, tag "Boosted". |
| **Verified Poster badge** (Phase 2) | KES 1,000 one-time | ID upload + selfie match + address verification. Badge sticks to the account. Signals to applicants. |
| **Bulk poster subscription** (Phase 3) | KES 2,500 / month | Up to 20 active posts. Priority moderation queue. For catering companies, cleaning agencies, SACCOs. |
| **Escrow deposit** (Phase 3) | 5-10% of hire deposit | Optional. WAH holds a deposit between hire and completion. |

## 14. Projected economics

At 100 posts/day (a modest start after the first 60 days):

- 20 free (first-post-free): KES 0
- 78 standard: KES 7,800
- 2 boost: KES 1,000
- **Daily gross:** ~KES 8,800
- Monthly gross: ~KES 264,000

At 500 posts/day (realistic if Kazi Karibu becomes the default listing surface for Nairobi households after 6-12 months):

- 50 free: KES 0
- 400 standard: KES 40,000
- 30 boost: KES 15,000
- 20 verified-badge purchases: KES 20,000 (one-time)
- **Daily gross:** ~KES 75,000
- Monthly gross: ~KES 2,250,000

Costs at 500 posts/day: Nanjila review $15/mo, M-Pesa fees ~2%, human moderator ~KES 60,000/mo (one full-time moderator handles ~800 flag-reviews/day at 2 min each). Net margin > 80%.

## 15. What Kazi Karibu does NOT charge for

Explicitly to prevent scope creep and confusion:

- Applicants are **never** charged to apply. Ever.
- Applicants are **never** charged to see poster contact info once the poster reveals it.
- Posters are not charged for post edits within the moderation window.
- Refunds are automatic for posts that fail moderation for fixable reasons and the poster does not resubmit within 48 hours.
- No charge for a re-post if the applicant we introduced turned out to be unresponsive (Phase 3 might revisit this).

---

## Part IV — Technical design

## 16. Database schema

### New tables

```sql
-- The posts themselves
CREATE TABLE kazi_karibu_posts (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poster_user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category           TEXT NOT NULL,        -- from Appendix A taxonomy
  county             TEXT NOT NULL,
  sub_county         TEXT,                 -- estate / area
  title              TEXT NOT NULL,
  description        TEXT NOT NULL,
  budget_min_kes     INT,                  -- NULL = negotiable but flagged
  budget_max_kes     INT,
  budget_period      TEXT,                 -- 'hour' | 'day' | 'month' | 'project'
  duration           TEXT,                 -- 'one_off' | 'recurring_weekly' | 'permanent'
  poster_display_name TEXT,                -- "Household in Kileleshwa" — anonymised by default
  poster_shows_name  BOOLEAN DEFAULT false,
  payment_id         UUID REFERENCES payments(id),
  moderation_state   TEXT NOT NULL,        -- 'draft'|'awaiting_payment'|'pending_moderation'|'live'|'held'|'rejected'|'expired'|'removed'
  published_at       TIMESTAMPTZ,
  expires_at         TIMESTAMPTZ,          -- published_at + INTERVAL '7 days'
  removed_reason     TEXT,
  is_boosted         BOOLEAN DEFAULT false,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX kk_posts_live_idx ON kazi_karibu_posts (category, county, published_at DESC)
  WHERE moderation_state = 'live';
CREATE INDEX kk_posts_poster_idx ON kazi_karibu_posts (poster_user_id, created_at DESC);

-- Moderation audit trail — every decision on every post
CREATE TABLE kazi_karibu_moderation (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id         UUID NOT NULL REFERENCES kazi_karibu_posts(id) ON DELETE CASCADE,
  layer           TEXT NOT NULL,           -- 'rules' | 'nanjila' | 'human'
  decision        TEXT NOT NULL,           -- 'approve' | 'clarify' | 'hold' | 'reject'
  reason_codes    TEXT[],                  -- machine-readable rule IDs
  narrative       TEXT,                    -- Nanjila's or moderator's note
  actor           TEXT,                    -- 'system' | 'nanjila' | admin user id
  decided_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX kk_mod_post_idx ON kazi_karibu_moderation (post_id, decided_at);

-- Applicant expressions of interest
CREATE TABLE kazi_karibu_interest (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id         UUID NOT NULL REFERENCES kazi_karibu_posts(id) ON DELETE CASCADE,
  applicant_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message         TEXT,                    -- optional cover note
  shared_profile_snapshot JSONB NOT NULL,  -- frozen at click-time
  contact_revealed_at TIMESTAMPTZ,         -- NULL until poster releases
  reported         BOOLEAN DEFAULT false,
  report_reason    TEXT,
  reported_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (post_id, applicant_user_id)
);
CREATE INDEX kk_interest_applicant_idx ON kazi_karibu_interest (applicant_user_id, created_at DESC);

-- Feedback loop (Layer 6)
CREATE TABLE kazi_karibu_feedback (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id         UUID NOT NULL REFERENCES kazi_karibu_posts(id) ON DELETE CASCADE,
  submitted_by    TEXT NOT NULL REFERENCES users(id),
  role            TEXT NOT NULL,           -- 'applicant' | 'poster'
  hire_happened   BOOLEAN,                 -- NULL = "prefer not to say"
  agreed_pay_delivered BOOLEAN,            -- applicants only
  overall_rating  INT,                     -- 1..5
  free_text       TEXT,
  submitted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Poster reputation (denormalised, refreshed by a nightly job)
CREATE TABLE kazi_karibu_poster_reputation (
  user_id            TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  posts_published    INT DEFAULT 0,
  posts_removed      INT DEFAULT 0,
  confirmed_hires    INT DEFAULT 0,
  negative_reports   INT DEFAULT 0,
  verified_badge     BOOLEAN DEFAULT false,
  verified_badge_at  TIMESTAMPTZ,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Existing tables extended

- `services` — add rows: `kazi_karibu_post_standard` (KES 100), `kazi_karibu_boost` (KES 500), `kazi_karibu_verified_badge` (KES 1000). All new rows carry `granting_subscription = false` and `service_category = 'kazi_karibu'` so the CV Fix Lite separation logic naturally excludes them from subscription grants.
- `fraud_reports` — add a new `source` value `kazi_karibu` and a new `report_type` enum value `fake_posting`.
- `users` — no schema change. We use existing `phone_verified_at`, `is_admin`, etc.

## 17. Backend routes (new)

All routes under `/api/kazi-karibu/*`. Feature-flagged behind `KAZI_KARIBU_ENABLED`.

### Poster-facing

- `POST /api/kazi-karibu/posts/draft` — save a draft, no payment yet, no publication. Runs Layer 3 rules and returns any auto-rejects to the poster.
- `POST /api/kazi-karibu/posts/:id/submit` — locks the draft, runs Layer 3 (again — server never trusts the client), initiates M-Pesa STK, on success runs Layer 4 (Nanjila review), transitions state.
- `POST /api/kazi-karibu/posts/:id/edit` — allowed only in `held` or `clarify` states.
- `GET  /api/kazi-karibu/posts/mine` — poster's own posts + moderation status.
- `POST /api/kazi-karibu/interests/:id/reveal-contact` — reveals poster contact to a specific applicant, logged in `kazi_karibu_contact_reveals`.

### Applicant-facing

- `GET  /api/kazi-karibu/posts` — public browse endpoint, paginated, filter by county + category.
- `GET  /api/kazi-karibu/posts/:id` — single post detail.
- `POST /api/kazi-karibu/posts/:id/interest` — express interest, requires authenticated user.
- `POST /api/kazi-karibu/interests/:id/report` — flag a suspicious message or poster behaviour.

### Admin-facing

- `GET  /api/admin/kazi-karibu/queue` — moderation queue (state = `held` or `pending_moderation`).
- `POST /api/admin/kazi-karibu/posts/:id/decide` — admin approves, rejects with reason, or asks the poster to clarify.
- `GET  /api/admin/kazi-karibu/stats` — daily counts, reject rate, revenue.
- `POST /api/admin/kazi-karibu/posters/:userId/suspend` — hard-suspend a poster; auto-holds all their live posts.

### Nanjila hooks

- Internal only: `nanjilaReviewKaziKaribuPost(postId)` — the Layer 4 handler. Registered as capability `kazi_karibu_review` in the manifest. Feature-flag `NANJILA_KAZI_KARIBU_REVIEW_ENABLED`.

## 18. Reuse of existing systems

| Existing system | Reuse in Kazi Karibu |
|---|---|
| M-Pesa STK pipeline (`server/lib/mpesa-*.ts`) | Post payment. Same webhook path. Different `service_type`. |
| KYC / phone OTP (`server/routes/auth-phone.ts`) | Layer 2 poster identity + Verified Badge (Phase 2). |
| Scam rule engine (`server/lib/job-scam-checker.ts`) | Layer 3 auto-reject and flag rules. Same code path. |
| Nanjila orchestrator (`server/nanjila/capabilities/*`) | Layer 4 pre-publish review runs as a registered capability. |
| Fraud reports (`fraud_reports` table + admin queue) | Same admin surface. New source + type values. |
| Admin moderation queue UI (`client/src/pages/admin/*`) | Extended with a new tab for Kazi Karibu queue. |
| Feature flags (`server/nanjila/feature-flags.ts`) | New flags: `KAZI_KARIBU_ENABLED`, `NANJILA_KAZI_KARIBU_REVIEW_ENABLED`, `KAZI_KARIBU_BOOST_ENABLED`. |
| CV Fix Lite service-payment separation | New services rows carry `granting_subscription = false`. |

**Nothing net-new is required at the plumbing level.** This is what makes 4-6 weeks realistic.

## 19. Frontend surfaces

### New pages

- `/kazi-karibu` — landing (hero + category grid + "How it works" + "Trust indicators" + latest posts).
- `/kazi-karibu/browse` — browse with county + category filters.
- `/kazi-karibu/job/:id` — single-post detail with "Show interest" button.
- `/kazi-karibu/post` — the poster form (multi-step: category → details → payment → moderation result).
- `/kazi-karibu/my-posts` — poster's own posts + status.
- `/kazi-karibu/my-interests` — applicant's expressed interests + revealed contacts.
- `/admin/kazi-karibu/moderation` — admin queue.

### Global additions

- Add "Kazi Karibu" tab to the main navigation, adjacent to Kenya Careers.
- Nanjila is aware of Kazi Karibu — she can answer questions about the flow and warn applicants about specific posts (via a new capability).

## 20. Nanjila capability wiring

New capability registered in `nanjila_capabilities`:

```
slug:              kazi_karibu_review
label:             Kazi Karibu — pre-publish moderation
requires_auth:     false (system-invoked)
requires_paid:     false
requires_admin:    false
enabled:           true (behind feature flag)
description:       "Reviews a submitted Kazi Karibu post for coherence, red flags, and applicant safety issues before publication. Returns APPROVE, CLARIFY(question), or HOLD(reason)."
```

She is *also* given a secondary capability `kazi_karibu_advise_applicant` that she uses at the applicant side — if an applicant clicks "Show interest" on a post that has any risk flags in its moderation history, she gently warns them: *"This poster is new to Kazi Karibu — no confirmed hires yet. If they ask for any money upfront, that's a red flag. Report it to us."*

## 21. Admin moderation queue

Extends the existing admin UI (`client/src/pages/admin/*`). New tab shows:

- Held posts sorted by hold-age (oldest first — SLA-driven).
- For each: the post, Nanjila's rationale, Layer 3 flag reasons, poster's history (previous posts, confirmed hires, prior fraud flags).
- One-click actions: Approve, Reject (with reason from a fixed dropdown), Ask poster to clarify (with a canned question template).
- All decisions logged to `kazi_karibu_moderation`.

**Response-time SLA:** median hold-to-decision time under 4 hours during business hours (07:00-22:00 EAT), under 12 hours overnight. If we can't hold this SLA with the current headcount, we don't launch — better to delay than to accumulate a queue.

---

## Part V — Rollout & operations

## 22. Phase 1 — Foundation (weeks 1-3)

**Goal:** Nairobi-only launch with the six trust layers enforced, no boost, no verified badge, no messaging. Just: post → pay → moderate → publish → apply → reveal-contact.

Deliverables:
- Migration `0013_kazi_karibu_foundations.sql` (new tables).
- Server routes: draft, submit (with M-Pesa integration), browse, interest, reveal-contact, admin queue.
- Scam rule additions in `server/lib/scam-rules.ts`.
- Nanjila `kazi_karibu_review` capability + prompt.
- Poster form + browse pages + `/my-posts` + `/my-interests`.
- Admin queue tab.
- Feature flag `KAZI_KARIBU_ENABLED` default OFF.
- Runbook for the on-call moderator: SLA, canned rejection reasons, escalation path.

Exit criteria for Phase 1:
- 100 real posts pass through the system (mix of legitimate + rejected).
- Fake-post catch rate ≥95% (measured by follow-up audit of a random sample of 50 approved posts).
- Median poster-form-to-publication time under 30 minutes (assuming moderation is available).
- Zero cross-contamination with subscription tiers (verified by SQL audit).
- One applicant safety incident handled end-to-end from report → suspension → warned applicants → refund/action.

## 23. Phase 2 — Trust deepening (weeks 4-5)

**Goal:** Verified Poster badge (with ID + selfie KYC), in-platform messaging, feedback loop surfaced as reputation on posts.

Deliverables:
- ID + selfie KYC flow (Phase 2 KYC reuses whatever we already have for overseas jobs; if we don't, we integrate a lightweight solution — Smile Identity or equivalent).
- `kazi_karibu_messages` table + in-app chat UI.
- Feedback prompt on post expiry (email + in-app).
- Reputation display on post cards ("Verified poster · 4 confirmed hires").
- Expand from Nairobi to Mombasa + Kisumu + Nakuru.

## 24. Phase 3 — Scale and revenue optimization (later)

**Goal:** Bulk-poster subscription, optional escrow, category expansion.

Deliverables:
- Bulk poster tier (KES 2,500/mo up to 20 active posts).
- Optional escrow (KES deposit held by WAH, released on both-side confirmation).
- New categories (event staff, subject-specific tutoring, elderly care).
- Regional pricing tiers (posts in rural areas may pay less).

## 25. Success metrics

Tracked on the admin dashboard from day 1.

**Volume**
- Posts submitted / day (per county, per category)
- Posts published / day
- Interests expressed / day
- Contact reveals / day
- Confirmed hires (30-day rolling)

**Trust**
- Layer 3 auto-reject rate (target: 15-25% of submissions)
- Layer 4 Nanjila hold rate (target: 5-10%)
- Human-moderator decision rate (target: 100% within SLA)
- Applicant safety reports per 100 published posts (alarm if > 2)
- Confirmed-fraud rate on approved posts (alarm if > 1%)

**Revenue**
- Posts paid / day × KES 100 = daily gross
- Refunds issued (as % of gross)
- First-post-free redemption rate (early proxy for real-user vs bot traffic)

**Retention**
- Second-post rate: % of first-post-free posters who come back and pay for post #2. Target: >30% at week 4.

## 26. Failure modes and mitigations

| Failure mode | Mitigation |
|---|---|
| Nanjila outage during a peak submission window | Layer 4 auto-falls-through to human moderation. Poster sees "under review" instead of instant publish. |
| M-Pesa STK timeout / callback lag | Existing pipeline already handles this (5-min renewal protection). Draft retained, poster prompted to retry. |
| Fake post slips through all layers | Applicant safety report → poster instant-frozen → Nanjila messages all interested applicants → refund path → moderator audit → rule engine updated. |
| Legitimate poster finds the flow too heavy | User research with 5 real households before Phase 1 launch. Metric: form-completion rate; alarm below 60%. |
| Regulatory question: are we running an unlicensed agency? | Terms explicit: listing platform, not agency. Same legal frame as OLX or Facebook Marketplace. Documented in `LEGAL_COMPLIANCE_AUDIT.md` before launch. |
| One high-profile scam damages reputation | Response speed matters more than perfection. Target: any reported scam post removed within 6 hours. |
| Moderator burnout | SLA capped at 800 flag-reviews / day / moderator. Second moderator hired when we reach 400/day sustained. |
| KES 100 fee blocks legitimate households | First-post-free covers this. Metric: first-post-free ratio should hover 15-25% of daily posts. |
| Applicants get spammed after "showing interest" | Contact isolation is designed to prevent this. If a poster spam-reveals contact to every applicant, that's a suspension trigger. |

## 27. Legal framing

Kazi Karibu is a **listing platform**, not an employment agency. Terms make this explicit:

- WAH does not employ, place, or vouch for any worker or poster.
- WAH does not guarantee the accuracy of any post.
- WAH does not mediate disputes between posters and applicants; we provide reporting channels and enforce our platform rules.
- Payment for posting is a service fee for the moderation, verification, and platform infrastructure — not a placement fee.

Referenced statutes in the terms:
- The Employment Act, 2007 (for the framing of what an employment relationship is — WAH is not the employer).
- The Computer Misuse and Cybercrimes Act, 2018, §22 and §24 (for the framing of what false posting and identity impersonation are — offences the platform will not tolerate).
- The Data Protection Act, 2019 (for how applicant data shared with posters is handled).

Before Phase 1 launch, `docs/LEGAL_COMPLIANCE_AUDIT.md` is updated with a Kazi Karibu section and reviewed by whoever gave the earlier audit its sign-off.

## 28. Feature flags

- `KAZI_KARIBU_ENABLED` — master flag, default OFF. Gates every route.
- `KAZI_KARIBU_FIRST_POST_FREE_ENABLED` — default ON. Turn off if abused.
- `KAZI_KARIBU_BOOST_ENABLED` — default OFF (Phase 2).
- `KAZI_KARIBU_VERIFIED_BADGE_ENABLED` — default OFF (Phase 2).
- `NANJILA_KAZI_KARIBU_REVIEW_ENABLED` — default ON when master is ON. Turning OFF causes Layer 4 to skip to human queue instead of blocking submissions.
- `KAZI_KARIBU_COUNTY_ALLOWLIST` — comma-separated list of counties. Phase 1: `Nairobi`. Phase 2: `Nairobi,Mombasa,Kisumu,Nakuru`. Phase 3: `*` for all counties.

## 29. Kill switches

If any of the following triggers, we turn `KAZI_KARIBU_ENABLED` OFF within one hour:

- More than 3 unresolved applicant safety reports in a 24h window.
- Confirmed fake-post rate above 5% on approved posts in a rolling 7-day window.
- Nanjila's `kazi_karibu_review` false-positive complaint rate above 20% (i.e. she's blocking too many legitimate posts).
- M-Pesa integration failure sustained > 30 minutes.
- Regulatory contact from Kenya's Ministry of Labour or a similar body raising questions we can't answer immediately.

Turning the master flag OFF stops new submissions but does not remove already-published posts. It buys us time to investigate without a full rollback.

---

## Appendices

### Appendix A — Category taxonomy (Phase 1)

Machine-readable identifiers for the category dropdown. Kept as constants in `shared/constants/kazi-karibu-categories.ts`.

```ts
export const KAZI_KARIBU_CATEGORIES = [
  { id: "house_help",       label: "House help / nanny",         suggestsRecurring: true  },
  { id: "cleaner",          label: "Cleaner",                    suggestsRecurring: true  },
  { id: "cook_caterer",     label: "Cook / caterer",             suggestsRecurring: false },
  { id: "driver",           label: "Driver",                     suggestsRecurring: false },
  { id: "fundi_mason",      label: "Fundi — mason",              suggestsRecurring: false },
  { id: "fundi_plumber",    label: "Fundi — plumber",            suggestsRecurring: false },
  { id: "fundi_electrician",label: "Fundi — electrician",        suggestsRecurring: false },
  { id: "fundi_painter",    label: "Fundi — painter",            suggestsRecurring: false },
  { id: "fundi_carpenter",  label: "Fundi — carpenter",          suggestsRecurring: false },
  { id: "delivery_errand",  label: "Delivery / errand runner",   suggestsRecurring: false },
  { id: "security_guard",   label: "Security guard / watchman",  suggestsRecurring: true  },
  { id: "gardener",         label: "Gardener / shamba boy",      suggestsRecurring: true  },
  { id: "tutor",            label: "Tutor",                      suggestsRecurring: true  },
  { id: "event_promoter",   label: "Event promoter / staff",     suggestsRecurring: false },
] as const;
```

### Appendix B — Automated rule set (Layer 3)

Rules live in `server/lib/scam-rules.ts` shared with the existing free Job Scam Checker. Each rule has an `id`, a `pattern` (regex or matcher function), a `severity` (`reject` or `flag`), a `poster_reason` (shown to poster), and a `moderator_note` (shown to admin).

Example structure:

```ts
export const SCAM_RULES: Rule[] = [
  {
    id: "applicant_pays_upfront",
    severity: "reject",
    pattern: /pay.*(uniform|training|deposit|registration).*(?:kes|ksh|\d)/i,
    poster_reason: "Kazi Karibu never asks applicants to pay. Please remove any payment requests to applicants.",
    moderator_note: "Applicant-pays language matched.",
  },
  {
    id: "guaranteed_placement",
    severity: "reject",
    pattern: /(guarante(e|ed)|no interview|immediate placement)/i,
    poster_reason: "Real employers interview applicants. Please remove guarantees.",
    moderator_note: "Guaranteed-placement language matched.",
  },
  {
    id: "overseas_placement",
    severity: "reject",
    pattern: /(dubai|qatar|saudi|uk|usa|abroad|overseas|travel)/i,
    poster_reason: "Overseas placements belong on our main Overseas board, not Kazi Karibu.",
    moderator_note: "Overseas keyword — belongs on main board.",
    onlyIfCategoryIn: ["house_help","cleaner","cook_caterer","fundi_mason","fundi_plumber","fundi_electrician","fundi_painter","fundi_carpenter","gardener","security_guard","tutor"],
  },
  // … (~30 rules total; full list maintained in the file)
];
```

### Appendix C — Nanjila review prompt (Layer 4)

Stored in `server/nanjila/prompts/kazi-karibu-review.ts`. Frozen and versioned — every change goes through a migration-style deploy so old rejections can be re-run if needed.

```
You are Nanjila, the WorkAbroad Hub moderation reviewer for Kazi Karibu — a
Kenyan job-listing surface where individual posters advertise short-term work
(house helps, fundis, tutors, cooks, drivers).

Your job: read the post below and decide whether it should be:

  APPROVE  — publish immediately. Post is coherent, safe, and legitimate.
  CLARIFY  — the post is probably legitimate but missing information or
             ambiguous. Return a specific question the poster must answer.
  HOLD     — the post has semantic red flags a rule engine could miss. Human
             moderator should review.

Never approve if any of these are true:
- The post asks the applicant to pay any amount (uniform, deposit, training).
- The pay-to-work ratio is unrealistic for the described work.
- The post impersonates a well-known business.
- The description contains language associated with unsafe or illegal work.
- The location or role is internally inconsistent.

Return STRICT JSON with this shape:
{
  "decision": "approve" | "clarify" | "hold",
  "confidence": 0.0 to 1.0,
  "rationale": "one sentence, plain English",
  "clarify_question": "the specific question, only if decision=clarify",
  "hold_reason_code": "one of: unrealistic_pay | impersonation | internal_inconsistency |
                       unclear_scope | unsafe_language | other, only if decision=hold"
}

POST TO REVIEW:
Category:  {{category}}
County:    {{county}}
Sub-area:  {{sub_county}}
Title:     {{title}}
Description:
{{description}}

Budget:    {{budget_min_kes}} — {{budget_max_kes}} KES per {{budget_period}}
Duration:  {{duration}}

Poster history:
- Posts published (all-time): {{posts_published}}
- Posts removed for cause:   {{posts_removed}}
- Confirmed hires:            {{confirmed_hires}}
- Phone verified at:          {{phone_verified_at}}
- Layer 3 flags on THIS post: {{layer3_flag_codes}}
```

### Appendix D — Sample end-to-end poster flow

1. Poster (Achieng, Kileleshwa household) opens `/kazi-karibu/post`.
2. Selects "House help / nanny". Fills county (Nairobi), sub-county (Kileleshwa), title, description, budget range (KES 12,000-15,000/month), duration (permanent).
3. Server accepts draft, runs Layer 3 rules — passes. Prompts phone re-verify (last OTP 100 days ago).
4. Achieng completes OTP.
5. STK push to her M-Pesa for KES 100. She approves on her phone.
6. Server confirms callback, transitions post to `pending_moderation`, invokes Nanjila review.
7. Nanjila returns `APPROVE, confidence 0.87, "coherent household post with realistic pay range and specific location"`. Post transitions to `live`, `published_at = NOW()`, `expires_at = NOW() + INTERVAL '7 days'`.
8. Achieng gets a confirmation SMS + email with the live URL.
9. Over the next 3 days, 6 applicants express interest. Each shows up in Achieng's `/my-posts` page with their profile snapshot.
10. Achieng shortlists 2, reveals her contact to those 2. Reveals logged. The other 4 never see her contact.
11. Achieng interviews and hires one. Later that week the feedback prompt fires. Both sides confirm the hire happened. Achieng's `kazi_karibu_poster_reputation.confirmed_hires` increments to 1. On her next post she gets a subtle badge: "1 confirmed hire on Kazi Karibu".

### Appendix E — Sample scam post that gets caught

Poster ("John") writes: *"HOUSE HELP NEEDED URGENTLY. Anywhere in Kenya. KES 45,000 per month, no interview needed, guaranteed placement. Please pay KES 500 registration for uniform and background check. Contact +254712345678 or johndoe999@gmail.com."*

Layer 3 outcome:
- `applicant_pays_upfront` — REJECT (matched "pay KES 500 registration").
- `guaranteed_placement` — REJECT (matched "guaranteed placement", "no interview").
- `vague_location` — FLAG (matched "Anywhere in Kenya" for household work).

Post is auto-rejected before payment is initiated. Poster sees:
> "Kazi Karibu never asks applicants to pay. Please remove any payment requests to applicants. Real employers interview applicants — please remove language that implies guaranteed hiring. Would you like to edit and resubmit?"

If the same account submits a similar post twice more, the account is flagged. If a fourth attempt is made, the account is suspended and the phone number is added to the block list.

---

## Sign-off

This document is the reference for the next 4-6 weeks of build. Any change to the six-layer trust model requires an update here first, then a code change. Any change to pricing tiers requires a founder sign-off written into §13.

**Next commit:** feature branch `feat/kazi-karibu-phase-1`, starting with the migration in Appendix A + the schema in §16.
