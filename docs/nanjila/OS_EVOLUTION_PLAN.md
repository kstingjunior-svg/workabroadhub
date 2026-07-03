# Nanjila — Operating System Evolution Plan

**Version:** 1.0 (2026-07-03)
**Author:** Nanjila product-architecture working session
**Prior art:** `MASTER_PLAN.md`, `PERSONA_SPEC.md`
**Status:** Awaiting approval — no code has been written for this document's phases

---

## 0. Executive summary

The `MASTER_PLAN.md` set out to make Nanjila a *trusted assistant*. This document extends that goal by one step: **Nanjila becomes the operating system of WorkAbroad Hub**. Every important user action — search, application, verification, learning, comparison, decision — routes through her, even when the user technically interacted with a page or a button.

The instruction is clear: **do not replace or redesign what already works**. Every enhancement here builds on top of existing implementation. Nothing shipped in Phase 1 of the Master Plan gets thrown away. Nothing already in production gets a breaking change.

The document contains three parts:

- **Part I: Audit + Gap Analysis (§2-§5).** What exists today, what's reusable, what's genuinely missing.
- **Part II: Ten-Feature Deep Dives (§6-§15).** Each of the ten features Tony specified, with the twelve required sub-sections (objectives, DB, API, UI, backend, prompt, migration, testing, rollback, performance, security, metrics).
- **Part III: Phased Roadmap + Cross-Cutting Concerns (§16-§20).** How we get from today to OS-of-WorkAbroad-Hub over the next 24 weeks, without disrupting active users.

---

## Part I — Audit + Gap Analysis

---

## 1. Rules of engagement

Ratified constraints that bind every recommendation in this document:

1. **No existing feature removed.** If it works today, it still works after any phase ships.
2. **No breaking API change.** Every existing endpoint keeps its current contract. New behavior lives at new endpoints.
3. **No breaking schema change.** New columns are `NULL`-safe. New tables reference existing tables but never depend on new columns being backfilled before shipping.
4. **No rewrite of working code without measurable benefit.** "Cleaner" is not measurable. "Reduces p95 latency by 40%" is.
5. **Feature-flagged rollout.** Every new capability ships behind an environment variable OR a per-user flag. Rollback is a config change, not a deploy.
6. **Backward compatibility for saved data.** Any user memory, saved job, application, or subscription created today must continue to work after Phase 4 ships.
7. **Trust-first.** If a feature could damage user trust (hallucinated stat, over-eager nudge, wrong recommendation), it does not ship until the honesty firewall covers it.

---

## 2. Current-state audit — what exists today

Full inventory of Nanjila-adjacent code, tables, endpoints, and events currently in production.

### 2.1 Server-side code

| File | Lines | Role | Reusable? |
|---|---|---|---|
| `server/ai/nanjila.ts` | 240 | Main conversation handler. Live-pricing cache with 5-min TTL. Composes system prompt from user activity + system catalogue + admin KPIs. | Yes — extend, don't replace. |
| `server/ai/router.ts` | ~200 | Intent router + tool dispatcher. Currently invokes `checkPayment` tool. | Yes — extend with new tools. |
| `server/ai/system-catalogue.ts` | ~300 | Tool registry Nanjila can reference in prompts. | Yes — add new capability entries. |
| `server/ai/user-activity.ts` | ~140 | Per-user activity summary from `funnel_events` and `service_orders`. | Yes — extend with `application_status_history`, `tracked_applications`. |
| `server/ai/admin-kpi.ts` | ~180 | Admin-mode metric snapshot. | Yes — keep as-is. |
| `server/ai/price-sanitizer.ts` | ~320 | Guardrail: any KES amount must match `services` or `plans`. | Yes — extend to cover other numeric hallucinations. |
| `server/ai/persona-guards.ts` | ~230 | Phase-1 guard from `MASTER_PLAN`. Signature appender + forbidden-phrase scrubber. | Yes — extend with new guards (§17.2). |
| `server/ai/tools/checkPayment.ts` | ~130 | First implemented tool: verifies payment state for a user. | Yes — pattern to replicate for new tools. |
| `server/ai/utils.ts` | ~30 | Language detection. | Yes. |

### 2.2 Server-side routes

- `POST /api/nanjila/chat` (line 21358) — multipart chat endpoint. Accepts message + optional CV upload. Uses `nanjilaAgent()`.
- `POST /api/nanjila` (line 21973) — legacy JSON chat endpoint. Kept for backward compat.
- `GET /api/admin/nanjila/metrics` (line 15920/21) — admin-only metric dashboard.
- WhatsApp proactive send routes for Nanjila (line 15788+) — daily jobs push, abandoned-cart recovery, general "check-in" ping. Already wired to WhatsApp with the WA_BASE_PROMPT.

### 2.3 Client-side

- `client/src/components/NanjilaChatWidget.tsx` — floating widget, mounted globally in `App.tsx`. Listens for `window.CustomEvent("nanjila:open", { detail: { opener } })`. Streams responses. Handles CV upload.
- `client/src/hooks/use-nanjila-idle-nudge.ts` — dispatches the `nanjila:open` event after 10 minutes of user inactivity with a context-appropriate opener.
- `client/src/components/ask-nanjila-button.tsx` (new, Phase 1) — the shared CTA that opens the widget from screening-tool result pages.

### 2.4 Existing tables Nanjila can already read

These are already in production and cover most of what the 10 features need:

| Table | Available for | Notes |
|---|---|---|
| `users` | Everything | Base identity. |
| `user_career_profiles` | F1, F5, F9 | Career profile fields including passport expiry. Highly reusable. |
| `user_job_applications` | F3, F6, F9 | Applications with status. |
| `application_status_history` | F3 | Every state transition. This IS the migration timeline data. |
| `tracked_applications` | F3, F6 | User-tracked ones (may be external). |
| `user_country_journeys` | F3, F7 | Country-specific journey progress. |
| `user_bookmarks` | F1, F6 | Saved jobs. |
| `job_alert_subscriptions` | F6 | Existing alert preferences. |
| `user_notifications` | F6 | Existing notification store. |
| `push_subscriptions` | F6 | Existing push-endpoint records. |
| `funnel_events` | F1, F6, F10 | Behavioral events. |
| `analytics_events`, `conversion_events` | F6, F10 | Additional behavioral signal. |
| `agency_legitimacy_scores` | F2 | Per-agency computed trust score. Already exists! |
| `agency_reports`, `agency_claims` | F2 | Complaint + claim data. |
| `agency_profiles`, `agency_notifications` | F2 | Agency-side data. |
| `nea_agencies` (sync engine) | F2 | Live NEA licence data via the RC1 sync engine. |
| `country_insights`, `country_guides` | F2, F5, F7 | Country data. |
| `services`, `plans`, `user_services`, `user_subscriptions` | F1, F6, F10 | Pricing + entitlement. |
| `scam_alerts` | F2, F6, F10 | Existing scam alert store. |
| `application_packs`, `user_application_packs` | F5, F9 | Learning/checklist scaffold already partial. |
| `country_journey_steps` (shared/) | F3 | Journey step definitions. |

**Finding: 80% of the data model for the ten features already exists.**

### 2.5 Existing events + hooks reusable by Nanjila

- `window.CustomEvent("nanjila:open")` — the entry-point for opening the widget with context.
- `useNanjilaIdleNudge` — the pattern for proactive triggers.
- WhatsApp send functions in `services/whatsapp.ts`, WhatsApp queue in `server/lib/whatsappQueue.ts` — reusable for proactive channel.
- BullMQ queues (`cvQueue`) — reusable for async Nanjila tasks (job-scoring, embedding refresh).
- Existing screening tool endpoints (`/api/tools/visa-check`, `offer-check`, `ats-check`, `scam-check-file`) with the classifier — reusable as Nanjila-invoked tools.

---

## 3. Reusable components inventory

Ranked by leverage: what would we have to rebuild if we ignored it?

| Component | Reuse leverage |
|---|---|
| `nanjilaAgent()` in `nanjila.ts` | Very high. Every feature's assistant-mediated UX flows through it. |
| Persona guards (Phase 1) | Very high. Signature + forbidden-phrase scrubbing is mandatory on every reply, regardless of feature. |
| Screening-tool endpoints (visa/offer/ats/scam + classifier) | Very high. These become tool-calls Nanjila can invoke. |
| RC1 sync engine (nea_agencies live data) | Very high. Powers Feature 2 (Employer Intelligence) and Feature 3 branch on agency involvement. |
| `agency_legitimacy_scores` | Very high. Feature 2 is 60% "surface what's already in this table." |
| `application_status_history` | Very high. Feature 3 is 70% "render this table as a timeline." |
| `funnel_events` + `analytics_events` | High. Feature 6 (Predictive) reads these. |
| WhatsApp queue + push subscriptions | High. Feature 6 delivery channels. |
| `user_career_profiles` | High. Feature 1, 5, 9 all read these. |
| BullMQ | Medium. Background scoring + embedding tasks. |
| `openai` client + `pdfjs-dist` + `mammoth` | Medium. All new AI/document work reuses. |

---

## 4. Gap analysis — target vs current

For each of the 10 features, what's already there and what's genuinely new.

| Feature | Data | Server logic | UI | Prompt | Delta |
|---|---|---|---|---|---|
| **F1 Job Success Score** | 90% present (`users`, `user_career_profiles`, `jobs`, `user_bookmarks`, ATS score history) | New: composite scoring service | New: score badge component on job cards | Small: explain-your-score handler | **Low delta.** Mostly a scoring function + surface. |
| **F2 Employer Intelligence** | 85% present (`agency_legitimacy_scores`, `agency_reports`, `agency_claims`, `nea_agencies`, `agency_clicks`) | New: intelligence-report aggregator; hiring-timeline calc from `application_status_history` | New: employer report page | Small: "explain this employer" handler | **Low delta.** Aggregation + rendering. |
| **F3 Migration Timeline** | 95% present (`application_status_history`, `user_country_journeys`, `country_journey_steps`) | New: timeline builder that fills in "expected wait" + "recommended next action" from statistics | New: timeline visual component | Small: "where am I in the process?" handler | **Very low delta.** Rendering existing data. |
| **F4 Voice Nanjila** | 20% present (ElevenLabs TTS wired for Nanjila voice notes; no STT) | New: STT provider abstraction; voice-session handler | New: microphone UI in widget | New: voice-tuned prompt overlay | **Medium delta.** STT + session mgmt genuinely new. |
| **F5 Nanjila Academy** | 40% present (`application_packs` scaffold; country guides; existing tool copy) | New: lessons table, progress table, recommender | New: academy pages + lesson viewer | New: coach-mode overlay | **Medium delta.** Content authoring + recommender both new. |
| **F6 Predictive AI** | 90% present (`funnel_events`, `notifications`, `push`, WhatsApp queue, `job_alert_subscriptions`) | New: predictor jobs (BullMQ) that read events and emit nudges to `nanjila_nudges` (Master Plan §8) | Small: nudge inbox in widget | Small: "why did you say that?" reason surfacing | **Low delta.** Predictors + nudge queue. |
| **F7 Decision Engine** | 80% present (`country_insights`, `agency_legitimacy_scores`, `services`) | New: comparison builder that assembles pros/cons/costs from grounded data | New: comparison card component | New: decision-mode overlay | **Low delta.** Renderer + prompt shape. |
| **F8 Central Intelligence Layer** | 60% present (each subsystem has its own API; Nanjila can already call them) | New: unified "capability manifest" that Nanjila queries at prompt-assembly time; new "orchestrator" that lets Nanjila call multiple systems in one turn | Zero new UI — this is architecture | Big: tool-use format needs to expand from checkPayment-only to N tools | **Medium delta.** Architectural, not visual. |
| **F9 Trust Dashboard** | 70% present (individual scores exist but scattered) | New: aggregator that computes 9 readiness scores from existing tables | New: dashboard page + summary card in widget | Small: "what should I improve first?" handler | **Low delta.** Aggregation + rendering. |
| **F10 Implementation Strategy** | N/A | N/A | N/A | N/A | This document itself. |

**Summary finding:** Only Feature 4 (Voice) and Feature 8 (Central Intelligence Layer) require genuinely new backend infrastructure. Features 1, 2, 3, 5, 6, 7, 9 are predominantly aggregation + rendering + prompt-shape work on top of tables that already exist. The RC1 sync engine + existing behavior tables cover most of the data plane.

---

## 5. Cross-cutting components new to this evolution

Introduced once, reused by many features:

- **`nanjila_capability_manifest.ts`** — the runtime list of things Nanjila can do, generated from a static registry + per-user entitlements. Every feature adds one entry.
- **`nanjila_orchestrator.ts`** — replaces the single-tool dispatcher with a multi-turn tool-call loop. Every feature that Nanjila calls uses this.
- **`nanjila_nudges` table** (already spec'd in `MASTER_PLAN.md §8`). Every feature's proactive assistance writes here.
- **`nanjila_user_memory` table** (already spec'd). Every feature's per-user state persists here.
- **`nanjila_conversations` table** (already spec'd). Every feature's session-level metrics.
- **`nanjila_scores` cache table** (new) — materialized composite scores (job success, trust readiness) that would be expensive to compute on every read.

---

## Part II — Ten-Feature Deep Dives

Each section follows the twelve-item structure Feature 10 requires. Concise by design — enough detail to build from, not enough to gild.

---

## 6. Feature 1 — Job Success Score

### 6.1 Objectives

Every job displayed to a user carries a personalized 0-100 match score with a plain-English explanation and a concrete "how to reach 100" action list.

### 6.2 Database changes

- **New table `nanjila_job_scores`** — materialized per-user-per-job score.
  - `(user_id, job_id) PK`
  - `score INTEGER CHECK BETWEEN 0 AND 100`
  - `grade VARCHAR` (Excellent | Good | Fair | Weak)
  - `factors JSONB` — array of `{ label, contribution, direction }`
  - `improvements JSONB` — array of `{ label, action, expected_lift }`
  - `computed_at TIMESTAMP`
  - `stale_at TIMESTAMP` — recompute trigger when profile or job changes
  - Index: `(user_id, score DESC)`, `(job_id, score DESC)`
- **No changes to `jobs` or `user_career_profiles`.**

### 6.3 API changes

- `GET /api/nanjila/jobs/:jobId/score` — returns the current user's score for one job. On-demand compute + cache.
- `GET /api/nanjila/scores/top?limit=10` — top-scored jobs for the user.
- `POST /api/nanjila/scores/refresh` — invalidate + recompute in the background (BullMQ). Called when the user updates their CV or profile.

### 6.4 UI changes

- New `<JobScoreBadge>` component that shows the score, grade, and a "why?" popover. Placed on every job card + job-detail page.
- No layout changes to existing job pages — badge slots into the current card top-right.

### 6.5 Backend changes

- New `server/nanjila/scoring/job-score.ts`. Deterministic function:
  - Country/language/education alignment (0-30)
  - Experience level (0-20)
  - CV ATS score (0-15)
  - Passport validity (0-10)
  - Language match (0-10)
  - Preferred destination match (0-10)
  - Recent activity signal (0-5) — is the user still active on the platform
- BullMQ worker recomputes when: user updates profile, uploads new CV, or after any completed application.
- Nanjila's system prompt gets access to top-3 scores for the current user.

### 6.6 AI prompt updates

Handler `explainJobScore(user_id, job_id)` produces the natural-language explanation from the `factors[]` structure. The response follows Direct Answer shape (`PERSONA_SPEC §6.1`).

### 6.7 Migration strategy

- Ship the table + scoring service dark (no UI).
- Backfill scores overnight for active users' top-100 saved jobs (~50k rows).
- Ship the badge behind `?enableJobScore=1` query flag for internal testing.
- Enable by default for 10% of users, then 50%, then 100% over 2 weeks.
- Legacy job cards unchanged. Badge is additive.

### 6.8 Testing strategy

- Unit: 30+ tests covering each scoring factor's edge cases (no CV, no profile, low English, expired passport).
- Integration: end-to-end from profile update → score recompute → API returns fresh score.
- Snapshot tests on 20 representative user/job pairs to prevent silent scoring drift.

### 6.9 Rollback plan

- Feature flag `NANJILA_JOB_SCORE_ENABLED=false` hides badges.
- Table remains; no destructive rollback needed.

### 6.10 Performance considerations

- Score compute: <50ms per (user, job). Cached in `nanjila_job_scores` for 7 days or until stale event.
- Job list rendering: badge is a single lookup by (user_id, job_id) → sub-2ms with the composite index.
- Batch recompute: 50k rows in ~10 min via BullMQ with concurrency 8.

### 6.11 Security review

- Users can only see their own scores. Enforced at the endpoint layer via session lookup.
- Employers cannot see per-candidate scores.
- No PII in the score payload — only feature contributions.

### 6.12 Success metrics

- 40% of users click "why?" on at least one score in their first session.
- CTR on "apply" from jobs with score ≥ 80 is 3x higher than from jobs without a badge.
- 15% of users take at least one recommended improvement action within 7 days.

---

## 7. Feature 2 — Employer Intelligence

### 7.1 Objectives

Every employer page becomes a structured intelligence report: hiring frequency, sponsorship history, timeline, salary bands, reviews, complaints, scam-report cross-reference, trust score, application tips.

### 7.2 Database changes

- **Zero new tables — this is an aggregation feature.** All required data is already in `agency_legitimacy_scores`, `agency_reports`, `agency_claims`, `agency_profiles`, `agency_clicks`, `success_stories`, `nea_agencies`, `application_status_history`.
- One `VIEW` for convenience: `nanjila_employer_intel_v` joining the above at query time.

### 7.3 API changes

- `GET /api/nanjila/employers/:employerId/intel` — returns the intelligence report JSON.
- `POST /api/nanjila/employers/:employerId/tip` — user submits a tip (goes to admin review queue).
- Existing employer endpoints unchanged.

### 7.4 UI changes

- New tabs on the existing employer page: **Intel Report** | **Hiring Timeline** | **Salaries** | **Reviews** | **Application Tips**. Nothing removed; the existing employer-page content becomes tab 0.
- Trust Score badge in the employer page header.

### 7.5 Backend changes

- New `server/nanjila/intelligence/employer.ts` — the aggregator.
- Reuse existing agency-scoring logic where present.
- Where a data point is missing, return the phrase `Not enough verified information yet` and do NOT fabricate.

### 7.6 AI prompt updates

- Handler `explainEmployer(employerId)` — Nanjila reads the intel JSON and produces a plain-English summary on request.
- Prompt guardrail: only quote figures that appear in the intel payload. No inference.

### 7.7 Migration strategy

- Ship the endpoint + tabs in "read-only preview" behind a flag. Internal review of accuracy on 20 employers.
- Enable for 20% then 100% of users over 1 week.

### 7.8 Testing strategy

- Unit: aggregator handles missing data gracefully (returns "Not enough verified information yet" per field).
- Integration: full report matches individual queries against source tables.
- Manual QA: spot-check 30 employers against ground truth.

### 7.9 Rollback plan

- Feature flag `NANJILA_EMPLOYER_INTEL_ENABLED=false` hides the new tabs.
- View can be dropped safely.

### 7.10 Performance considerations

- One aggregated query per report. Target <200ms.
- 5-minute Redis cache per employer.

### 7.11 Security review

- Intel report is public-safe; matches what's already visible in individual endpoints.
- User tips go to a moderation queue before publishing (`admin_moderation` — existing table).

### 7.12 Success metrics

- 25% of application clicks come from the Intel tab (vs baseline browsing).
- Complaint-report submission rate up 30% (people find the right form).
- Time-on-employer-page up 40%.

---

## 8. Feature 3 — Migration Timeline

### 8.1 Objectives

Every application gets a visual journey with current stage, expected wait time, required documents, and recommended next action.

### 8.2 Database changes

- **Zero new tables.** `application_status_history` already exists and captures state transitions. `user_country_journeys` + `country_journey_steps` (shared/) provide the phase library.
- Add one column: `user_job_applications.expected_next_transition_at TIMESTAMP NULL`. Populated by the timeline calculator.

### 8.3 API changes

- `GET /api/nanjila/applications/:appId/timeline` — returns structured timeline data.
- `POST /api/nanjila/applications/:appId/nudge-employer` — proxied polite reminder (uses existing email service).

### 8.4 UI changes

- New timeline component (`<MigrationTimeline>`) on the application-detail page and the user dashboard.
- Compact horizontal timeline on job cards where an active application exists.

### 8.5 Backend changes

- New `server/nanjila/timeline/migration.ts` — reads `application_status_history` for the app, computes:
  - Current stage
  - Expected wait time (median from all similar applications in the last 90 days)
  - Documents required for the next stage (from `country_journey_steps`)
  - Recommended next action
- Timeline stages are canonical — the 12 stages Tony listed, mapped from existing status codes with a compatibility layer.

### 8.6 AI prompt updates

- Handler `explainStage(appId)` — Nanjila summarises where the user is and what's next.
- Handler `whatNext(appId)` — recommends the single most impactful next action.

### 8.7 Migration strategy

- Ship the endpoint + component behind flag.
- Backfill `expected_next_transition_at` for all in-progress applications at rollout.
- Legacy pages unaffected.

### 8.8 Testing strategy

- Unit: each stage transition covered.
- Integration: timeline reflects live `application_status_history`.
- Edge: applications with sparse history return "Not enough data to estimate timing" cleanly.

### 8.9 Rollback plan

- Feature flag `NANJILA_TIMELINE_ENABLED=false` hides the component.
- Column can stay; no destructive rollback.

### 8.10 Performance considerations

- One query per timeline. Sub-100ms.
- Backfill of `expected_next_transition_at` runs as a nightly BullMQ job.

### 8.11 Security review

- Users can only see their own timelines.
- Employer-visible view (if built later) redacts personal notes.

### 8.12 Success metrics

- 60% of users with an active application view the timeline weekly.
- Users following the "recommended next action" complete the next stage 25% faster than baseline.

---

## 9. Feature 4 — Voice Nanjila

### 9.1 Objectives

Users can speak to Nanjila naturally. Modular provider abstraction — ElevenLabs today, plug in others (OpenAI Realtime, Deepgram) tomorrow.

### 9.2 Database changes

- **New table `nanjila_voice_sessions`** — session-level record of voice interactions.
  - `id`, `user_id`, `conversation_id` (FK `nanjila_conversations`)
  - `provider VARCHAR` (elevenlabs | openai-realtime | deepgram)
  - `duration_ms INTEGER`
  - `input_lang`, `output_lang`
  - `stt_cost_cents INTEGER`, `tts_cost_cents INTEGER`
  - `outcome VARCHAR`
  - `created_at TIMESTAMP`

### 9.3 API changes

- `POST /api/nanjila/voice/start` — creates a voice session, returns session token.
- `WS /api/nanjila/voice/:sessionId/stream` — bidirectional stream: audio in → transcript + audio out.
- `POST /api/nanjila/voice/:sessionId/end` — terminates + writes usage record.

### 9.4 UI changes

- Microphone button in the widget header. Long-press to talk, tap to interrupt.
- Live transcript shown while listening.
- Visual state: `idle | listening | thinking | speaking`.
- Falls back gracefully to text if browser mic unsupported.

### 9.5 Backend changes

- New `server/nanjila/voice/` module.
- Provider adapter interface: `SttProvider`, `TtsProvider`.
- ElevenLabs adapter (already partial for TTS-only) extended.
- OpenAI Realtime adapter for STT + streaming responses.
- Per-user daily cap on voice minutes (existing `notification_preferences` pattern).

### 9.6 AI prompt updates

- Voice-mode overlay: shorter sentences, fewer bullet points, more contractions.
- No bullet lists (they don't work in voice) — she narrates as prose.
- Signature added only on last utterance of a session.

### 9.7 Migration strategy

- Ship dark to internal team for 1 week of dogfood.
- Roll out to Pro users only for month 1.
- Roll out to all users month 2.

### 9.8 Testing strategy

- Unit: provider adapters.
- Integration: full round-trip on a WebSocket harness.
- Manual: multi-language STT accuracy (Kenyan English, Kiswahili).

### 9.9 Rollback plan

- Feature flag `NANJILA_VOICE_ENABLED=false` hides the microphone button.
- Existing text chat unaffected.

### 9.10 Performance considerations

- Target: <800ms from user finishes speaking to first audio byte back.
- Streaming TTS overlaps with LLM generation to hit that target.
- Voice-session usage capped at 60 min/day/user by default.

### 9.11 Security review

- Voice audio is never stored — only transcripts.
- Transcripts follow existing 30-day retention like screening data.
- Rate-limited to prevent per-user cost blowup.

### 9.12 Success metrics

- 20% of Pro users use voice at least once/week.
- CSAT on voice sessions matches or exceeds text (4.3+).
- Voice cost per user < KES 20/month at target volume.

---

## 10. Feature 5 — Nanjila Academy

### 10.1 Objectives

A personalised learning platform. Nanjila recommends lessons based on profile, goals, weaknesses, and application outcomes.

### 10.2 Database changes

- **New table `nanjila_lessons`** — lesson catalogue.
  - `id`, `slug`, `title`, `topic VARCHAR`, `level` (beginner | intermediate | advanced)
  - `content_md TEXT`, `estimated_minutes INTEGER`
  - `prereq_slugs JSONB`, `applicable_countries JSONB`, `applicable_professions JSONB`
  - `active BOOLEAN`, `updated_at TIMESTAMP`
- **New table `nanjila_lesson_progress`** — per-user progress.
  - `(user_id, lesson_slug) PK`
  - `status VARCHAR` (recommended | started | completed | skipped)
  - `progress_pct INTEGER`
  - `last_activity_at TIMESTAMP`

### 10.3 API changes

- `GET /api/nanjila/academy/lessons` — user's recommended catalogue.
- `GET /api/nanjila/academy/lessons/:slug` — full lesson content.
- `POST /api/nanjila/academy/lessons/:slug/progress` — update progress.

### 10.4 UI changes

- New `/academy` page + per-lesson viewer.
- "Recommended for you" carousel on user dashboard.
- Nanjila widget can recommend lessons inline.

### 10.5 Backend changes

- New `server/nanjila/academy/recommender.ts` — weighs profile signals to rank the catalogue.
- Seed catalogue: 14 topics × ~4 lessons each = ~56 initial lessons. Content authored in markdown, versioned in `docs/nanjila/academy/`.

### 10.6 AI prompt updates

- Handler `recommendLessons(userId, N)` — Nanjila describes why each lesson fits.
- Handler `summariseLesson(slug)` — 3-sentence summary of a specific lesson.

### 10.7 Migration strategy

- Ship the catalogue table + 14 seed lessons (one per topic) as MVP.
- Behind flag `NANJILA_ACADEMY_ENABLED` for a Pro-only launch.
- Expand catalogue over Phase 3 based on user requests.

### 10.8 Testing strategy

- Unit: recommender weights.
- Integration: progress writes persist across sessions.
- Content review: every seed lesson reviewed by two team members before shipping.

### 10.9 Rollback plan

- Feature flag off → academy page returns 404, lessons hidden.
- Tables remain (no data loss).

### 10.10 Performance considerations

- Lesson content is markdown; renders fast client-side.
- Recommender queries under 100ms with the composite index on `(user_id, status)`.

### 10.11 Security review

- Lessons are public-safe content.
- Progress is per-user; enforced at endpoint.

### 10.12 Success metrics

- 30% of Pro users start at least one lesson in the first month.
- 20% completion rate on started lessons.
- Correlation: users who complete "ATS Optimisation" lesson have ATS scores 15 points higher on next check.

---

## 11. Feature 6 — Predictive AI

### 11.1 Objectives

Nanjila proactively surfaces useful information via the `nanjila_nudges` queue (from `MASTER_PLAN.md`).

### 11.2 Database changes

- **Reuses `nanjila_nudges` from `MASTER_PLAN.md §8`.** Nothing new.
- Optional index: `(user_id, delivered_at) WHERE delivered_at IS NULL AND scheduled_for <= NOW()` for the deliver-now query.

### 11.3 API changes

- `GET /api/nanjila/nudges` — user's pending nudges (existing per Master Plan).
- `POST /api/nanjila/nudges/:id/click` — user acted.
- `POST /api/nanjila/nudges/:id/dismiss` — user dismissed.
- `GET /api/nanjila/nudges/preferences` — read preferences.
- `PATCH /api/nanjila/nudges/preferences` — update quiet hours, channels.

### 11.4 UI changes

- Nudge inbox in widget header (badge with unread count).
- Optional push delivery via existing `push_subscriptions`.
- Optional WhatsApp delivery via existing WhatsApp queue.

### 11.5 Backend changes

- New `server/nanjila/predictors/` folder — one file per predictor:
  - `newJobMatch.ts`, `cvScoreImproved.ts`, `employerReplyDue.ts`, `passportExpiring.ts`, `subscriptionExpiring.ts`, `interviewTomorrow.ts`, `agencyComplaint.ts`.
- Each predictor runs on a schedule (hourly for most, daily for passport/subscription).
- Reads existing tables — no new writes except `nanjila_nudges`.

### 11.6 AI prompt updates

- When a nudge is delivered in-widget, Nanjila can "read it out" with context.
- Reason-surfacing: every nudge has a `reason` field the user can click to see.

### 11.7 Migration strategy

- Ship one predictor at a time (start with `passportExpiring` — highest immediate user value, lowest complexity).
- Each predictor is independently flag-controlled.

### 11.8 Testing strategy

- Unit: each predictor's condition logic.
- Integration: end-to-end from event → nudge insert → user notification.
- Load: predictor batch runs on 100k users in <5 min.

### 11.9 Rollback plan

- Predictor-specific flag disables one predictor without affecting others.

### 11.10 Performance considerations

- Predictors run in BullMQ with concurrency 4.
- Per-user quiet period enforced at write time.
- Batch inserts.

### 11.11 Security review

- Nudge content never contains PII beyond user's own data.
- Rate-limited to prevent nudge storms.

### 11.12 Success metrics

- Nudge CTR > 8%.
- Dismissal rate < 40%.
- Weekly-active-users on widget +25%.

---

## 12. Feature 7 — Intelligent Decision Engine

### 12.1 Objectives

Nanjila constructs balanced side-by-side comparisons on request. Never pretends certainty.

### 12.2 Database changes

- **Zero new tables.** All data comes from `country_insights`, `agency_legitimacy_scores`, `services`, `nea_agencies`, `application_status_history`.

### 12.3 API changes

- `POST /api/nanjila/compare` — body: `{ type: 'country'|'agency'|'career'|'visa_route', a: string, b: string }` → structured comparison JSON.

### 12.4 UI changes

- New `<ComparisonCard>` component with two columns + Nanjila's take at the bottom.
- Renders in widget when user asks for a comparison.
- Standalone `/compare` page for direct use.

### 12.5 Backend changes

- New `server/nanjila/decisions/compare.ts` — one function per comparison type.
- Each returns `{ dimensions[], leftValues[], rightValues[], takeaway }`.

### 12.6 AI prompt updates

- Decision-mode overlay: assertive dial down (§3.6 of PERSONA_SPEC), teach-the-frame ending.

### 12.7 Migration strategy

- Ship country-vs-country first (most requested).
- Then agency-vs-agency (leverages existing scores).
- Then career and visa-route.

### 12.8 Testing strategy

- Unit: each comparison type's dimension list is stable for the same input.
- Snapshot: 15 representative pairs.

### 12.9 Rollback plan

- Flag disables the API and hides the CTA.

### 12.10 Performance considerations

- Single aggregated query per comparison. <150ms.

### 12.11 Security review

- All data public-safe. No PII involved.

### 12.12 Success metrics

- 15% of migration-related conversations trigger a comparison.
- CSAT on decision-support conversations ≥ 4.4.

---

## 13. Feature 8 — Central Intelligence Layer

### 13.1 Objectives

Nanjila coordinates every WorkAbroad Hub subsystem via one orchestrator instead of hand-coded per-intent branches.

### 13.2 Database changes

- **New table `nanjila_capabilities`** — declarative registry of things Nanjila can do.
  - `id`, `slug`, `label`, `description`
  - `input_schema JSONB`, `output_schema JSONB`
  - `handler_module VARCHAR` — code path
  - `requires_auth BOOLEAN`, `requires_paid BOOLEAN`, `requires_admin BOOLEAN`
  - `enabled BOOLEAN`
  - `avg_latency_ms INTEGER` (for scheduler)

### 13.3 API changes

- `POST /api/nanjila/orchestrate` — internal. Nanjila's orchestrator calls it. Users never hit it directly.
- Existing `/api/nanjila/chat` becomes a thin wrapper that delegates to the orchestrator.

### 13.4 UI changes

- Zero. This is architectural.

### 13.5 Backend changes

- New `server/ai/orchestrator.ts` — replaces the single-tool dispatch in `router.ts`. Multi-turn tool-call loop with proper error handling.
- Each of the ten feature handlers registers as a capability.
- The screening tools (`visa-check`, `offer-check`, `ats-check`, `scam-check-file`) also register as capabilities.

### 13.6 AI prompt updates

- Nanjila's system prompt now includes the capability manifest as available tools (compressed, not the full JSONB).
- She calls capabilities via structured tool-use, not by generating URL suggestions.

### 13.7 Migration strategy

- Keep `router.ts` alive as legacy. Orchestrator runs beside it.
- Behind flag `NANJILA_ORCHESTRATOR_ENABLED`, route a percentage of conversations through the orchestrator.
- Migrate one capability at a time (`checkPayment` first — already tool-shaped).
- After 2 weeks of stable orchestrator, deprecate `router.ts`.

### 13.8 Testing strategy

- Unit: orchestrator loop correctness (max iterations, error propagation).
- Integration: multi-capability turn (e.g. "check the offer AND verify the agency").
- Load: 100 concurrent orchestration sessions.

### 13.9 Rollback plan

- Flag off → legacy `router.ts` handles all traffic. Zero code change.

### 13.10 Performance considerations

- Orchestrator adds one extra LLM call per turn (tool decision). Cost: ~KES 0.03 per turn.
- Total latency impact: +300-500ms per turn. Acceptable given the correctness gain.

### 13.11 Security review

- Every capability declares `requires_auth` and `requires_paid`. Orchestrator refuses capabilities the user isn't entitled to.
- Admin capabilities require admin session.
- Rate-limited per capability slug per user.

### 13.12 Success metrics

- Orchestrator handles 99%+ of eligible turns without falling back to legacy router.
- Multi-capability turns (2+ calls in one conversation) become 20% of interactions.
- Average tool-call error rate < 2%.

---

## 14. Feature 9 — Trust Dashboard

### 14.1 Objectives

A personal dashboard with 9 readiness scores + concrete recommendations for each.

### 14.2 Database changes

- **New table `nanjila_readiness_snapshots`** — daily materialization of each user's scores.
  - `(user_id, snapshot_date) PK`
  - `cv_strength INTEGER`, `application_readiness INTEGER`, `scam_awareness INTEGER`, `document_completeness INTEGER`, `verification_status INTEGER`, `country_readiness INTEGER`, `language_readiness INTEGER`, `interview_readiness INTEGER`, `overall_migration_readiness INTEGER`
  - `factors JSONB`
  - `next_actions JSONB`

### 14.3 API changes

- `GET /api/nanjila/trust/dashboard` — user's current dashboard.
- `GET /api/nanjila/trust/history?days=30` — trend line.

### 14.4 UI changes

- New `/dashboard/trust` page.
- Summary card in widget when Nanjila references readiness.

### 14.5 Backend changes

- New `server/nanjila/trust/readiness.ts` — computes each of the 9 scores from existing tables.
- Daily BullMQ job materializes snapshots.

### 14.6 AI prompt updates

- Handler `explainReadiness(userId)` — Nanjila reads the snapshot and narrates.

### 14.7 Migration strategy

- Backfill last 30 days for active users at rollout.
- Ship behind flag; Pro users first.

### 14.8 Testing strategy

- Unit: each of the 9 scoring functions.
- Integration: recommendations lead to score changes.

### 14.9 Rollback plan

- Flag hides the page; table remains.

### 14.10 Performance considerations

- Materialized daily. Real-time read is a single row lookup — sub-5ms.

### 14.11 Security review

- User-only visibility.

### 14.12 Success metrics

- 30% of Pro users view the dashboard weekly.
- Overall migration readiness score increases by 15 points on average across 90 days for active users.

---

## 15. Feature 10 — Implementation Strategy

This entire document is Feature 10's answer.

---

## Part III — Phased Roadmap + Cross-Cutting Concerns

---

## 16. Phased delivery roadmap

Twenty-four weeks, split into four phases. Each phase produces user-visible value before starting the next.

### Phase A — Foundations (Weeks 1-4)

**Objective:** Complete the Phase 1 quick wins from `MASTER_PLAN.md` PLUS lay foundations for the orchestrator.

- ✅ Persona + signature + Ask Nanjila CTAs (already shipped)
- Ship `nanjila_user_memory`, `nanjila_conversations`, `nanjila_nudges` tables (migration 0012).
- Ship the orchestrator behind `NANJILA_ORCHESTRATOR_ENABLED=false` (0% rollout).
- Ship capability manifest table (`nanjila_capabilities`) with `checkPayment` registered.
- Trust Dashboard v0 — just the readiness scoring backend + one admin-only page.

**Ship gate:** persona guards catching >90% of forbidden phrases in production traffic. Orchestrator handles a synthetic test suite of 100 conversations.

### Phase B — Intelligence Surfacing (Weeks 5-10)

**Objective:** Turn existing data into user-facing intelligence.

- **F1 Job Success Score** — end to end.
- **F2 Employer Intelligence** — end to end.
- **F3 Migration Timeline** — end to end.
- Orchestrator rollout: 0% → 25% → 100%.

**Ship gate:** F1/F2/F3 accuracy verified against manual spot-checks. Orchestrator error rate <2%.

### Phase C — Predictive + Decisions (Weeks 11-16)

**Objective:** Nanjila starts reaching out and helping decide.

- **F6 Predictive AI** — ship one predictor per week (passport-expiring first).
- **F7 Decision Engine** — country/agency/career/visa-route comparisons.
- **F9 Trust Dashboard** — user-facing.

**Ship gate:** Predictor CTR >8%, dismissal <40%. Comparison CSAT ≥4.4.

### Phase D — Voice + Academy (Weeks 17-24)

**Objective:** New surfaces.

- **F4 Voice Nanjila** — Pro users first, then all.
- **F5 Nanjila Academy** — MVP catalogue + recommender.
- Full capability manifest coverage — every subsystem exposes as a capability.

**Ship gate:** Voice CSAT ≥4.3. Academy start rate ≥30% among Pro users.

### Post-Phase D (Ongoing)

- Prompt tuning based on real conversation logs.
- Content expansion for the Academy (external contributors).
- Additional capability integrations as new subsystems come online.

---

## 17. Cross-cutting concerns

### 17.1 Feature flags

Every feature ships behind an env variable:

```
NANJILA_ORCHESTRATOR_ENABLED
NANJILA_JOB_SCORE_ENABLED
NANJILA_EMPLOYER_INTEL_ENABLED
NANJILA_TIMELINE_ENABLED
NANJILA_VOICE_ENABLED
NANJILA_ACADEMY_ENABLED
NANJILA_PREDICTORS_ENABLED (with per-predictor sub-flags)
NANJILA_DECISIONS_ENABLED
NANJILA_TRUST_DASHBOARD_ENABLED
```

Plus per-user flags for A/B testing via `user_flags` table (new — trivial).

### 17.2 Observability

- Every capability invocation is logged with timing, user id, entitlement check, tool-use outcome.
- Admin dashboard shows per-capability latency p50/p95, error rate, entitlement-denial rate.
- Prompt-drift detector: sample 100 replies/day, run through persona guards, alert if forbidden-phrase rate rises above 3%.

### 17.3 Prompt versioning

- The base system prompt is fingerprinted (sha-256) on every deploy. Stored on `nanjila_conversations.prompt_hash`.
- Enables us to answer "which prompt version was the user talking to?" during incident review.

### 17.4 Cost governance

- Per-user daily cost cap (KES 30 default; higher for Pro).
- Model routing: gpt-4o-mini for intent + short answers, gpt-4o for reasoning + comparisons + scam analysis, gpt-4o vision for image screening.
- Alert when daily cost per active user exceeds baseline by 20%.

### 17.5 Backward compatibility guarantees

- `POST /api/nanjila/chat` and `POST /api/nanjila` — response shape unchanged. New fields are additive.
- `NanjilaChatWidget` — the widget continues to work with legacy responses; new capabilities are progressive enhancement.
- Every new endpoint is `/api/nanjila/*` — no collision with existing routes.
- All new tables are additive; no ALTER on existing columns except the nullable `user_job_applications.expected_next_transition_at`.

---

## 18. Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Job Success Score misfires and users apply to wrong jobs | Med | Med | Explain-my-score UI shows factors. Weight recalibration monthly. |
| Employer Intelligence hallucinates a stat | Low | High | Fabrication guard — "Not enough verified information yet" is the only allowed fallback. |
| Voice cost blows up | Med | Med | Per-user cap. Pro-only rollout initially. |
| Predictor nudges feel spammy | Med | High (churn) | Hard cap 1 per 48h. Dismissal rate feeds per-user quiet period. |
| Orchestrator regresses vs legacy router | Med | High | Feature flag rollback in one config change. Legacy router remains alive during Phase B. |
| Migration Timeline stage misclassification | Med | Med | Every stage transition is auditable via `application_status_history`. Corrections flow back to the calc. |
| Academy content quality drift | Med | Med | Two-reviewer sign-off before any lesson activates. |
| Voice STT fails on Kenyan English | Med | Med | Provider abstraction lets us swap Deepgram/Whisper if ElevenLabs/OpenAI underperform. |
| Multi-capability turn produces contradictory answers | Med | Med | Orchestrator has an internal consistency pass before final reply. |

---

## 19. Success metrics — the north stars

Same three north stars as `MASTER_PLAN.md`, tracked with more depth:

1. **Brand recall.** "Ask Nanjila" mentions in user surveys. Target: 60% of surveyed active users by end of Phase D.
2. **Trust score.** 1-5 post-conversation rating. Target ≥4.4 across all capabilities.
3. **Conversion to legitimate placement.** Paid service uptake + verified overseas placements at 30/90/180 days. Target: +40% vs pre-OS baseline.

Diagnostic metrics (per phase):

- **Phase A:** persona-guard match rate, orchestrator error rate on synthetic tests.
- **Phase B:** F1 badge CTR, F2 Intel-tab click rate, F3 timeline weekly views.
- **Phase C:** predictor CTR, comparison CSAT, trust dashboard weekly views.
- **Phase D:** voice CSAT, Academy start + completion rates.

---

## 20. Sign-off — the decisions this document is asking for

Before any Phase B code is written, the following need answers:

1. **Approve the four phases?** Yes/No/modified.
2. **Approve the ten features' scope as described here?** Yes/No/deprioritise-which.
3. **Approve the "no breaking change" constraint even at cost of some duplication?** Yes/No.
4. **Approve budget for voice STT provider trial in Phase D?** ~KES 50k for 2 months of testing across ElevenLabs + OpenAI Realtime + Deepgram.
5. **Approve two-reviewer content sign-off gate for Academy?** Yes/No.

Everything downstream flows from these five answers. Once approved, Phase A migrations (0012 + `nanjila_capabilities`) can be written and shipped in a single week.

---

## Appendix A — Reusable code paths cheat sheet

For engineers picking up feature work: this is where each piece already lives.

- **New tool → `server/ai/tools/`** — follow `checkPayment.ts` shape.
- **New capability handler → `server/nanjila/capabilities/`** — one file per capability, registered in the manifest at boot.
- **New Nanjila-invoked scoring function → `server/nanjila/scoring/`**.
- **New prompt overlay → append to `nanjila.ts` system prompt after mode detection.**
- **New user-facing card → `client/src/components/nanjila/`** (new folder).
- **New widget mode → extend `NanjilaChatWidget.tsx` mode enum.**
- **New push nudge type → add to `nanjila_nudges.nudge_type` catalogue + one predictor file.**

---

## Appendix B — Files touched by this evolution (running list)

Kept for later — starts empty. Every PR that lands adds one row: file, feature, phase, PR number, deploy date. Used at post-mortem time to trace regressions.

---

## Final word

Nothing in this document should ship without Tony's explicit go-ahead on §20. This is a plan, not a promise. But every decision Tony has already made — the RC1 sync engine, the screening tools, the persona guards, the WhatsApp channel, the existing tables — makes this plan possible with 60-80% reuse of what already exists.

The next twenty-four weeks build the operating system. But they do it on top of the platform that's already running, not underneath it.
