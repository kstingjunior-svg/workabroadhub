# Name Guard — implementation report (18 Nov 2026)

## Architecture

Every name typed at sign-up goes through four layers, in this order:

| Layer | What it does | Code |
|---|---|---|
| 1. Multilingual lexicon | Matches English, Kiswahili and Sheng offensive terms (with language and category) against normalised text | `server/name-guard/lexicon.ts` + DB table `name_guard_terms` |
| 2. Plausibility | Decides whether the text looks like a personal name: rejects numbers, symbols, links and phone numbers, sentences, greetings, keyboard mashing and long repeated letters | `server/name-guard/plausibility.ts` |
| 3. AI screening | gpt-4o-mini, used **only** for ambiguous names and only at final submit | `server/name-guard/ai.ts` |
| 4. Abuse prevention | Per-client sliding window of rejected attempts, with temporary pauses | `server/name-guard/abuse.ts`, `service.ts` |

The decision engine (`decide.ts`) returns **ACCEPT**, **REVIEW** or **REJECT**:
- **ACCEPT:** plausible and nothing offensive.
- **REJECT:** a blocking dictionary hit, numbers or symbols, a link or contact detail, a sentence, keyboard mashing, or too short.
- **REVIEW:** the name matches a "review" word (offensive somewhere but also a real name), or has unusual structure. **Registration continues**; the account is marked `name_screen_status='flagged'` and the name appears in the admin review queue.

**Enforcement points (server-side, authoritative):**
- `POST /api/auth/signup/start` (passwordless sign-up) and `POST /api/auth/register` (legacy password sign-up) run the full check before any account is created.
- The live check while typing (`POST /api/auth/name-check`) gives quick feedback only.

## Languages and categories

- **Languages:** English, Kiswahili, Sheng. Admins can add any language code (Kikuyu, Dholuo, Luhya, Kamba, Kalenjin and Arabic are in the picker).
- **Categories:** profanity, sexual, insult, slur, hate, abusive phrase, spam.

## Profanity detection approach

**Normalisation (`normalize.ts`)** undoes the usual tricks:
- Unicode NFKC, so full-width letters are read as normal letters (ＦＵＣＫ → fuck).
- Invisible zero-width characters are removed.
- Accent marks are stripped for matching only; the stored name keeps its accents.
- Cyrillic and Greek look-alike letters are mapped to Latin (Мјinga → mjinga).
- Leetspeak is undone (a$$hole, b!tch, n1gger).
- Spaces and punctuation between letters are ignored (f.u.c.k, k u m a m a k o).
- Repeated letters are collapsed (fuuuuck).
- Letters typed one by one are judged as a single word (m.k.u.n.d.u).

**Three match modes**, to avoid blocking real names that happen to contain an offensive word:
- **Whole word** — for short or ambiguous words. "kuma" does not match "Kumar", and "shit" does not match the Ethiopian name "Shitaye".
- **Anywhere** — only for long, unambiguous words (at least 5 letters).
- **Phrase** — multi-word expressions such as "kuma mamako" or "kill yourself".

**Words that are also real names are set to "review", never block:**

| Word | Also a real name |
|---|---|
| Dick | English given name |
| Kuma | Japanese surname |
| Malaya | Filipino/Russian given name |
| Mavi | Turkish name |
| Tomba | Italian surname |
| Shoga | Swahili for a female friend |
| Moron | Spanish surname (Morón) |

## AI screening

**When it runs:**
- Only for REVIEW candidates, and only at final submit. Never while typing, which keeps cost low.

**What it sees:**
- Only the name text: no email, phone, IP or account.
- The call runs on the server, so the API key never reaches the browser.
- 4-second timeout; results are cached for 24 h.

**What it is allowed to decide:**
- **The AI can never reject on its own.** It can only confirm what the deterministic layers already suggest:
  - offensive at ≥0.9 confidence **and** a dictionary hit → reject;
  - random text at ≥0.9 confidence **and** a structural signal → reject;
  - plausible at ≥0.8 confidence with no dictionary hit → accept.
- If the AI is down, the deterministic layers decide on their own; this is tested.

## Abuse prevention

- **Who is tracked:** a client is identified by a salted SHA-256 of its IP address, with the salt rotating daily. No device fingerprinting.
- **Pauses:**
  - 5 rejected names in 30 minutes → 15-minute pause.
  - 10 or more → 60-minute pause, plus an admin log entry.
  - Incomplete entries and REVIEW decisions never count.
- **Live typing check:** limited to 60 checks per 10 minutes per client.
- **Existing protection:** the sign-up route is also covered by the existing `authLimiter`.
- **What is stored:** the submitted text is kept only for rejected or flagged entries, which admins need for review. Accepted names are only counted. Events older than 90 days are deleted automatically.

## False-positive handling

- **Correcting a mistake:** "Allow (false positive)" on any flagged or rejected entry whitelists that exact name and marks the user as screened. Admins can also whitelist single words; a surname that is also slang is then ignored everywhere.
- **No permanent blacklist:** pauses expire on their own, and admins can lift them.

## Admin controls (`/admin/name-guard`, admin role required, every change logged)

| Area | What's there |
|---|---|
| Overview | Names checked, accepted, rejected and flagged; rejection reasons; most-detected expressions; repeat abusers; AI failures; corrected false positives; counts of users who are name-screened, name-flagged and identity-verified |
| Review queue | Allow (fix a false positive) or confirm |
| All checks | Filter by decision |
| Dictionary | Add terms (language, category, block or flag, match mode); change severity; deactivate |
| Whitelist | Add or remove names and words |
| Restrictions | Lift a pause, or restrict for 24 h |
| Audit log | Every admin change |
| Identity | `POST /api/admin/name-guard/users/:id/identity` sets identity verification separately; it requires a note on how the ID was checked |

## Name screening vs identity verification

- New columns, added without changing existing data:
  - `users.name_screen_status`: `screened` or `flagged`, plus `name_screened_at`.
  - `users.identity_verified`, plus `identity_verified_at` and `identity_verified_by`.
- Passing the name check **never** sets `identity_verified`.
- No ID upload is required at sign-up.

## Security

- **Server-side:** checks run on the server; the browser check is only a convenience.
- **Input handling:** Unicode normalisation and control/invisible characters removed; capped at 120 characters.
- **Database:** all SQL uses parameters.
- **Data minimisation:** IPs are hashed; names are stored only when flagged or rejected; data is kept for 90 days.
- **Access:** row-level security is on for all new tables, with server-only access.
- **Secrets:** the AI key never reaches the browser.
- **Messages:** user-facing messages never reveal the matched word or the rule.

## Test results

**Automated (`tests/api/name-guard.test.ts`, 12 tests; full suite 203/203):**
- **False positives: 0 of 60 legitimate names rejected.** The set covers:
  - Kenyan names: Wanjiku Kamau, Achieng' Odhiambo, Mbugua Ng'ang'a, Kiprono arap Sang.
  - Other African names: Ngozi Okonjo-Iweala, Mamadou N'Diaye, Tsegaye Shitaye.
  - Arabic script: عبد الله الحربي.
  - Chinese: 李伟.
  - Vietnamese: Nguyen Van Anh.
  - Polish: Łukasz Brzęczyszczykiewicz.
  - Welsh: Llwyd ap Iwan.
  - Single names: Njeri, Ana, Bo, Xu.
  - Hyphenated and accented names.
  - Names containing a flagged word: Dick, Kuma, Malaya, Tomba, Mavi.

  More than 85% were accepted outright; the rest went to REVIEW, which still allows registration.
- **False negatives: 0 of 62 offensive or junk entries let through.** The set covers:
  - English profanity and slurs.
  - Kiswahili: kuma mamako, kuma yako, mkundu, kahaba, msenge, mjinga, mpumbavu, mshenzi, nakutomba.
  - Sheng: bwege, mafala.
  - Evasions: f u c k, F.U.C.K, ＦＵＣＫ, b!tch, a$$hole, n1gger, Мјinga, m.k.u.n.d.u.
  - Random text, numbers, phone numbers, links, sentences and adverts.
- **Also tested:**
  - AI down (throwing or returning nothing).
  - The AI cannot reject alone.
  - The AI can confirm an ambiguous dictionary hit.
  - Whitelist corrections.
  - Repeat-abuse thresholds and expiry.

**Live, on workabroadhub.tech (18 Nov):**

| Test | Result |
|---|---|
| Live check: Wanjiku Kamau / Łukasz… / Arabic name | ACCEPT (green tick shown on the phone-size layout) |
| Live check: "K u m a m a k o" | REJECT, polite message |
| Typing "Fuuck Off" in the form | Red message appears under the field |
| Backend bypass: `POST /signup/start` with "Mjinga Sana" | 400, NAME_REJECTED, **no account created** |
| "Kuma Yako" at submit | The AI said "plausible" (it missed the meaning), so it went to REVIEW and the account was flagged. The phrase was then added to the dictionary from the admin page **without a code change**, and it is now rejected. Also added to the code's starting list of words. |
| Full sign-up with "Tony Mwangi" → code → dashboard | ✅ signed in; `name_screen_status='screened'`, `identity_verified=false` |
| Admin page `/admin/name-guard` | Loads with real numbers |
| Existing password/code sign-in (Tony's admin account) | ✅ still works |

The test accounts were soft-deleted afterwards. No payment or referral code was touched.

## Outstanding

- **Dictionary coverage:** the starting list is deliberately compact. Add regional terms (Kikuyu, Dholuo, Luhya, Kalenjin and others) from the Dictionary tab as they appear in the review queue.
- **AI misses:** the AI does miss some Swahili insults ("kuma yako"). The dictionary remains the main defence, and the AI is a secondary check.
- **Bot protection:** relies on rate limits and the email code (a bot needs a working inbox). CAPTCHA was not added, to keep sign-up simple.
- **Identity verification:** the status exists, but there is no customer-facing flow to submit an ID yet; it's admin-set for now.
