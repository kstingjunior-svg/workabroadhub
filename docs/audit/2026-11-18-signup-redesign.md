# Signup redesign — passwordless email OTP (18 Nov 2026)

## 1. Audit: how sign-up worked before

| Item | Finding |
|---|---|
| Entry point | `AuthModal` (a large modal on the landing page). `/signup` only redirected to `/?auth=signup`. |
| Mandatory fields | First name, mobile number (country picker + national number), email, password (8+ characters, uppercase letter and number required on the client). Last name and referral were optional; the referral field was always visible. |
| Account creation | `POST /api/auth/register` **creates the user before email verification**, signs them in straight away, then emails a code. |
| OTP system | `server/services/identityVerification.ts` + `verification_codes` table:<br>• `crypto.randomInt` 6-digit code, only its sha256 hash is stored<br>• 10-minute expiry<br>• 5 wrong tries per code<br>• a resend within 60 s reuses the live code<br>• max 6 codes per address per hour<br>• all outstanding codes are retired on success.<br>Passwordless sign-in already existed (`/api/auth/login-code/*`). |
| Email | Resend/SES. Last 7 days: 951 sent, 91% delivered, 40% "delivery delayed". |
| After signup | `PhoneCompletionModal` **blocked the whole app** for any verified user without a phone ("No phone number = no access to services"); it could not be closed. |
| Phone country default | Taken from the browser language. Kenyan phones report `en-US`, so visitors saw 🇺🇸 +1 and "United States numbers have 10 digits". Fixed separately in commit 58f2d1ff. |
| Payment gate | `requireVerifiedForPayment` only needs a verified email (no phone). M-Pesa screens collect the phone at payment time. |

**Main causes of friction:** four mandatory fields including an international phone picker that defaulted to the wrong country; strict password rules; a large modal on small screens; a forced phone wall straight after verification.

## 2. What changed

**Server** (`server/replit_integrations/auth/routes.ts`). New routes reuse the existing OTP system; no second OTP system was added.
- `POST /api/auth/signup/start { fullName, email, referralCode? }`
  - Validates the name with the existing name validator.
  - Validates the email through all five existing layers (syntax, typo check, disposable, MX, suppression list) and offers a "did you mean…" suggestion.
  - Applies the referral rules: the code must belong to another user, self-referral is blocked, and an unknown code is dropped without failing signup.
  - If the email is new: creates the user **unverified, with no password, no phone and no session**.
  - If the email already has a verified account: does **not** create a duplicate. It sends that account a sign-in code and the page says "you already have an account".
  - If the email has an unverified account: reuses it, filling in the name or referral only if they were empty.
  - Handles a double tap or two tabs (unique-violation race): carries on with the row the other request created.
- `POST /api/auth/signup/verify { email, code }` uses the existing `verifyCode` to mark the email verified, creates the session (automatic login) and returns `isNew` for the welcome message.
- Both routes are under `/api/auth/signup`, so `authLimiter` applies (20 per 15 min per IP/identifier). They are CSRF-exempt like login and register, because no session exists yet.

**Client**
- New `client/src/pages/signup.tsx`, a dedicated mobile-first page:
  - **Details step:** two mandatory fields (full name, email) and "Have a referral code?" (expands; also prefilled from `?ref=` or the saved referral code). "Your account is protected" note, Continue button, Sign in link, Terms and Privacy links.
  - **Code step:** "Check your email" with the 6-box OTP input (paste, auto-advance, `autocomplete="one-time-code"` autofill, clipboard pick-up, auto-verify on the 6th digit). Shows the last 2 digits of the code as a hint, a 60 s resend countdown and "Use a different email".
  - **After verification:** the user is signed in, sees a welcome toast and goes to the dashboard (or the `redirect` page they came from).
  - **Layout:** single column, 48 px inputs with 16 px text (no iOS zoom), full-width buttons, `100dvh` and safe-area padding. Nothing is fixed to the bottom of the screen, so the keyboard cannot cover the buttons.
- `/signup` now opens this page.
- **Every sign-up entry point now leads to this page:**
  - Landing-page "Sign Up" buttons go straight to `/signup`.
  - `AuthModal` forwards to it whenever it would have shown the old form: the modal is opened in sign-up mode, or the user taps "Create account".
  - Sign-in for existing users (password or email code) stays in the modal, unchanged.
- `PhoneCompletionModal` is now **optional**:
  - It can be closed or skipped; "Skip for now" hides it for 7 days.
  - It is never shown on an account's first day.
  - It is titled "Add your WhatsApp number (optional)".

## 3. How existing accounts are protected

- **No migration:** no table, column or user row is changed for existing users. User IDs, subscriptions, payments, referrals and permissions are untouched.
- **Existing sign-in still works:**
  - Password login (`/api/auth/login`), forgot-password and reset are unchanged.
  - "Email me a code" sign-in is unchanged.
  - The old `/api/auth/register` endpoint still works for any cached old client.
- **New passwordless users:**
  - They sign in later with "email me a code".
  - If they try a password, login already answers "This account doesn't have a password yet. We can email you a sign-in code instead."
  - They can set a password later through forgot-password.
- **Duplicate emails:** the new flow never creates a second account for an email; it signs the person into the existing one instead.
- **Phone-dependent features:**
  - M-Pesa: each payment screen asks for or uses a phone number, as before.
  - Write-from-Scratch: asks for a phone when none is on file (`needsPhone`).
  - Phone sign-in: works for anyone who has a phone on their account.
  - Account recovery: still by email, as before.

## 4. Payments

No payment code was changed. M-Pesa (Daraja STK, callbacks, C2B), PayPal, subscriptions, tool credits and referral commissions are untouched. Registration stays free. `requireVerifiedForPayment` already needed only a verified email.

## 5. Tests

| Check | Result |
|---|---|
| Server type-check (`tsc -p tsconfig.server.json`) | pass |
| Client type-check (`tsc -p .`) | pass |
| `vite build` / vitest in my sandbox | **not run.** The Windows `npm install` removed the Linux build binary my sandbox needs. Render builds on Linux and is the real build check. |
| Live tests: new email, correct/wrong/expired code, resend, existing email, referral, Android/iPhone/desktop viewports, existing password login, M-Pesa/PayPal | **to do after deploy.** Creating real accounts needs Tony's go-ahead (see below). |

## 6. Remaining issues and follow-ups

- **Code emails:** 40% are "delivery delayed" (normal for Gmail greylisting, but codes can arrive late). The page says the code lasts 10 minutes and to check Spam/Promotions, and shows the last 2 digits as a hint.
- **Wording:** the code email still says "Enter this code to sign in". This is fine for both new and returning users, but could be split into separate sign-up and sign-in versions.
- **Abandoned new accounts:** if someone abandons the code step, the existing verification-reminder sweep emails them. They finish either by re-entering their email on `/signup` or with "email me a code".
