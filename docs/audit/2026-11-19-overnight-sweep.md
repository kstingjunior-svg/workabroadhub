# Overnight sweep — 19 Nov 2026

**What was checked:**
- Server error logs for the last 7 days.
- Every page in the app (about 165 customer and admin pages), loaded in a phone-size window while signed in as admin.
- About 290 data endpoints the app reads from.
- The database security advisor.

## Fixed and live (commits 6ce53d45 → b50f7e04)

| # | What was broken | Who it hit | Fix |
|---|---|---|---|
| 1 | About 40 buttons and forms were sending changes without the site's security code, so the server refused them (error 403). Affected: "Recover my plan" on the payment-status page, Kazi Karibu post edits, Hub journey steps, Auto-Apply status changes, agency click tracking, the online-status ping and the scam-wall view count. | Every user | The app now attaches the security code to every change it sends, wherever the request comes from |
| 2 | **My Documents** always showed an error, because of an ID type mismatch in the database query | Every user | Query fixed |
| 3 | **Country pages** (/country/uk, /country/kuwait and others) crashed with "t.find is not a function" | Every visitor | The page now reads the services list correctly |
| 4 | **Landing page crashed** for visitors whose browser blocks storage (some in-app browsers and privacy modes) | Those visitors | The app falls back to in-memory storage |
| 5 | **Interview Practice** and **Job Match** sometimes showed "Just a small detour" (React error #426) | Visitors | Added the missing loading wrapper |
| 6 | The **Verified Profile** page failed because its database table had never been created | Users | Table created |
| 7 | Admin → **Finance** took about 10 seconds and timed out, because a database index was missing | Admin | Index added; now under 0.5 s |
| 8 | Admin → **Analytics** dashboard and funnel timed out (355,000 events, no index) | Admin | Indexes added |
| 9 | Admin → **VerifyX** overview showed an error (ambiguous column in SQL) | Admin | Fixed |
| 10 | Admin → **Scam reports** crashed: an older endpoint was answering in place of the moderation queue | Admin | Old endpoint moved to /legacy |
| 11 | Admin → job applications list timed out (one query per user, 17,000 users) | Admin | Replaced with one query |
| 12 | Manual plan grant: the "already active" safety check never worked (wrong column name). A blocked grant still replied "activated" (this is what happened to Kevin). | Admin | Both fixed; a blocked grant now says why |
| 13 | Sign-up reminder emails retried the same 6 bounced addresses every 30 minutes, and made a new code for each attempt | System | Bounced addresses are now skipped |
| 14 | Customer-facing text still advertised the discontinued KES 99 trial (job-list paywall, Kenya Careers apply message, employer page) | Visitors | Text updated to Monthly |
| 15 | Shared-document links with a malformed ID returned a server error instead of "not found" | Visitors and bots | Malformed IDs now get "not found" |
| 16 | Errors coming from browser extensions flooded the logs (60 in 3 seconds) | Logs | Extension errors are now ignored |

Tests: 203 of 203 pass, and the build succeeded before each commit. Items 1, 2, 3, 9, 10 and 11 were re-tested on the live site after the deploy.

## Needs Tony (settings or accounts I can't change)

1. **Twilio is suspended:** the account is "not active" (status 4), so every WhatsApp and SMS message fails. Email works, and sign-up uses email now. Reactivate Twilio or remove the keys.
2. **Firebase rejects our credentials (401):** the live revenue mirror and the Firebase referral-code write fail. Check `FIREBASE_DATABASE_SECRET` and the database rules.
3. **Push notifications are off:** `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` are not set on Render.
4. **Health check shows "unhealthy" because of 222 old abandoned M-Pesa attempts** marked as retryable (June to November). These are not money we hold. They could be marked expired so the health check means something again.
5. **Kevin (KES 99, 19 Oct):** still waiting on your choice: refund, a 4th trial, or credit towards Monthly.
