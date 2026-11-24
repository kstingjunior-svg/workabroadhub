# WorkAbroadHub Authentic Data & Social Proof Policy — permanent

> **REAL MEMBERS. REAL ACTIVITY. REAL SUBSCRIPTIONS. REAL STATISTICS. NO FABRICATED SOCIAL PROOF.**

All public statistics, member counts, subscription figures, activity notifications, agency verification
numbers and marketing claims must be derived from genuine, traceable and appropriately verified records.

No fabricated user activity, random statistics, simulated purchases or misleading social-proof messages
are permitted in production.

Where reliable data is unavailable, the application must display neutral wording or omit the statistic.

All public activity must respect user privacy.

All administrative statistics must have defined calculation rules and authoritative data sources.

This policy applies to all future features and marketing components.

## Where numbers come from
`server/lib/platform-stats.ts` is the single source. Each metric has a written definition
(`METRIC_DEFINITIONS`, also returned by `GET /api/public/stats` as `definitions`).

| Public metric | Definition | Source |
|---|---|---|
| Registered members | Not deleted, not deactivated, excluding staff/admin and test addresses | `users` |
| Verified members | Registered members with a confirmed email | `users.email_verified` |
| Active subscribers | Active, unexpired paid subscription now | `user_subscriptions` |
| New paying members (7 days) | First verified plan payment in the last 7 days; one per receipt; failed/pending/cancelled excluded; renewals excluded; staff/test excluded | `payments` |
| Agencies on the NEA register | Agencies on NEA's public register at our last check (records NEA no longer lists are excluded) | `nea_agencies` (status_override ≠ unlisted) |
| Expired agencies | On the current register **and** marked expired or past expiry date — shown with the check date | `nea_agencies` |
| Community scam reports | Approved reports in the last 30 days | `scam_reports` |
| Countries | Active country pages with ≥1 verified job portal | `countries` + `job_links` |
| Online now | Distinct browsers with the site open (one per stored visitor id), live via `/ws/presence-count` | in-memory presence |

Agency wording must stay scoped: "N agencies **on the NEA register** show an expired licence (checked DATE)".
Never "N agencies in Kenya" and never call an agency fraudulent because a licence is expired or missing.
Statuses are evidence-based: licence current · expired · revoked · no longer listed by NEA (status unknown).

## Activity feed (`server/lib/live-activity.ts`)
Only events that happened: completed purchases (one per receipt, staff excluded), CV checks recorded only
after a **successful** response (`maybeTrack` on `finish` with 2xx), approved/submitted scam reports.
Every item reads "Someone …" — no names, initials, locations, amounts, emails, phones or documents.

## Never
* Hard-coded counts, "+" on exact numbers, invented fallbacks (`|| 15`), random or hash-seeded numbers,
  minimum floors ("at least 2 people viewing"), fake purchases/viewers/urgency, stale numbers without a date.
* Removed 2026-11: dashboard alert "87 users applied for this job" (hard-coded), "N people viewing this"
  (fabricated from site traffic × hash + 3, floored at 2), "Scam alerts this month" (added all-time expired
  agencies to monthly reports), "Kenyans on the platform — verified accounts only" (counted all rows),
  "Licensed agencies tracked" (included expired/unlisted), About-page "1,000+ consultations / 4,200 users /
  7,000+ members / hundreds of Kenyans" (no source), bulk verifier "1,294 agencies" (stale constant).

## Admin
`/admin/platform-stats` (Today / 7 / 30 / 90 days / custom): members, subscribers by plan, payments by
outcome (rows vs unique receipts), verified revenue (deduplicated), tool usage, jobs, agencies, upgrade
funnel and **data-integrity checks** (`GET /api/admin/data-integrity`): duplicate receipts, multiple active
subscriptions, active-but-expired subscriptions, future-dated payments, staff/test payments, impossible agency
dates, duplicate licences, stale agency register. Admin-only, enforced server-side.

## Guard rails
`tests/api/authentic-data.test.ts` fails the build if fabricated patterns return.
