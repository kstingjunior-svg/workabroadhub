# WorkAbroadHub Freemium Rules — permanent

> **EXPLORE FIRST. PAY WHEN NECESSARY.**
> Let people enter. Let them explore. Let them discover value. Ask them to pay only when they
> deliberately use a premium service. (Tony, 2026-11 — a permanent business rule, not a workaround.)

A free account is a real account with meaningful access, not an account waiting to pay.

**WORKABROADHUB FREEMIUM PRINCIPLE**
> Every user must be able to enter WorkAbroadHub, explore the platform, discover available opportunities
> and understand our services without being forced to purchase a subscription.
>
> Subscription enforcement must occur at the level of genuinely restricted premium actions, not at
> registration, login, dashboard initialization or ordinary navigation.
>
> Free users are legitimate platform users and must receive a useful, welcoming experience.
>
> Premium users receive additional access based on verified entitlements.
>
> Payment prompts must be relevant, transparent, dismissible and connected to the user's intended action.

Correct journey: DISCOVER → REGISTER → EXPLORE → BUILD TRUST → SELECT A PREMIUM SERVICE → SUBSCRIBE → ACCESS.
Never: REGISTER → LOGIN → PAYMENT POPUP → FORCED SUBSCRIPTION.

## 1. Five separate responsibilities — never mix them

| Concern | Question | Where it lives | May it ask for money? |
|---|---|---|---|
| Authentication | Who is this? | session / `isAuthenticated` | **Never** |
| Authorization | Is this role allowed (admin)? | `users.role`, `is_admin` | Never |
| Entitlement | What has this account paid for, and is it still active? | `storage.getUserPlan()` (enforces end dates) via `server/lib/feature-access.ts → resolveEntitlement` | No — it only answers |
| Feature access | Does *this action* need an entitlement? | `shared/feature-access.ts` (`FEATURES`, `decideAccess`) | Only at the moment of a deliberate tap |
| Payment verification | Did money actually arrive? | M-Pesa (Daraja callback / STK query) and PayPal capture on the server | Activates plans; nothing else can |

Login, registration, email/OTP verification, profile completion, dashboard load, refresh, route
change and "returning after days away" are **authentication events** and must never open a payment
prompt or redirect to `/pricing` or `/payment`.

## 2. Access levels (shared/feature-access.ts)

* **PUBLIC** — anyone: home, pricing (voluntary), job destinations / country guides, service
  descriptions, Scam Wall, agency licence search, Kenyan Jobs Section and Kazi Karibu listings.
* **FREE** — any signed-in account: dashboard, profile & settings, application tracker view, and
  (since 2026-11-25, Tony's growth strategy) **employer contacts (Call/WhatsApp) and applying on
  Kazi Karibu and the Kenyan Jobs Section**. After a contact, one dismissible CV-help suggestion is shown.
* **PREMIUM** — active plan. Two existing tiers, kept exactly as they were:
  * `any_paid` (trial, monthly, yearly): premium job links, Visa Sponsorship applying.
    (Local-job contacts were KES 1,000-only for one day, 24 Nov 2026: 12 prompts, 0 payments → made free.)
  * `full_plan` (monthly, yearly — trial excluded, the old `requireProPlan` rule): AI Auto-Apply,
    CV matching, LinkedIn Optimizer, WhatsApp consultation.
* **ONE_TIME_PAID** — own per-order checkout, never the subscription wall: CV services, verification
  tool scans, Assisted Apply.
* **ADMIN** — admin panel.

Prices are unchanged: Free KES 0 · Monthly KES 1,000 / 30 days · Yearly KES 4,500 / 365 days.
The registry *describes* entitlements; adding an entry never makes something paid by itself.

## 3. How to gate a premium action

**Server (security boundary — always):**
```ts
import { requireFeature } from "./lib/feature-access";
app.post("/api/thing", requireFeature("ai_auto_apply"), handler);
// or inside a handler:  const r = await checkFeature("local_job_contacts", userId);
```
Unpaid → `402 { code: "PAYWALL", feature, featureLabel, payUrl, payUrlYearly }`. Signed-out → `401`.
Errors → deny (never grant on a failed lookup).

**Client (experience only):**
```ts
const gate = useFeatureGate();
<Button onClick={() => gate.run("ai_auto_apply", start)} />          // deliberate tap
if (gate.handleResponse("premium_job_links", res.status, body)) return; // after a server reply
```
While plan data is loading or failed, the gate lets the request through and the **server** decides.

## 4. Never
* No payment prompt from `useEffect`, timers, page-view counts, scroll/exit-intent, login/registration
  handlers, route changes or subscription listeners. (Removed 2026-11: `use-page-view-funnel.ts`,
  `exit-intent-popup.tsx`.)
* No full-page paywalls on browsing pages; no hiding prompts with CSS instead of fixing the trigger.
* No activating a plan from a front-end "success" — only the verified payment callback does that.
* No made-up activity, member or upgrade counts; figures must be live DB counts with an honest label
  (`/api/public/stats`, `/api/public/live-activity`). No implying a job, visa or placement is guaranteed.
* No open redirects: return-after-payment uses `safeReturnPath()` (same-site, not /payment, /pricing,
  /login, /signup, /api).

## 5. The prompt
One global `UpgradeModal` (Monthly / Yearly / "Maybe later — keep browsing for free") titled
"Unlock {feature}", and one global `JobUnlockHost` for the KES 1,000-only local-jobs unlock. Closing
either never logs out, redirects or blocks free areas. After a verified payment the user returns to
the page where they tapped the feature (`?return=`), where the server re-checks access.

## 6. Country / destination pages
`GET /api/countries/:code` serves every signed-in account (2026-11 — it used to 403 free users and the
whole page became "Access Required"). Free users receive the portal list as previews (`locked: true`,
never a URL) with a "Premium" label; opening a portal goes through `GET /api/go/job/:id`, which checks
the plan server-side and returns 403 → contextual prompt ("Unlock premium job links").

## 7. Standalone paid services
CV services, verification scans and Assisted Apply keep their own per-order prices and checkout
(`/services/order/*`, tool-pay). The subscription modal refuses to open on `/services/order/*`, and a
CV customer is never forced to buy KES 1,000 / KES 4,500 for a service sold separately.

## 8. Conversion measurement (no invented numbers)
UI events → `funnel_events` via `client/src/lib/conversion-events.ts` (`premium_click`,
`upgrade_modal_view|dismiss|plan_select`, `job_unlock_view|dismiss|pay`; metadata = feature/plan/trigger
only, plus a one-way user hash). Money comes only from `payments` (attempts vs verified). Report:
`GET /api/admin/freemium-funnel?days=7`. On-screen social proof must be live DB counts with honest labels.

## 9. Guard rails
`tests/api/freemium-rules.test.ts` fails the build if anyone reintroduces an automatic prompt,
prompts from auth flows, stacks modals, breaks the registry tiers, or opens a redirect hole.
If it fails: move the prompt to a deliberate user action — do not loosen the test.
