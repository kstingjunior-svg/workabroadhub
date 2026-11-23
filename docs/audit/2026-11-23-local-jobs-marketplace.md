# Kenyan Local Jobs marketplace — report (23 Nov 2026)

**Main journey:** Admin receives a job → Admin posts it → the job goes live → a job seeker finds it → the job seeker calls or WhatsApps the employer.
**Status:** built, deployed and tested on workabroadhub.tech.

## What existed before
- Jobs were stored in `local_jobs` and `companies`, shown at `/kenya-careers`.
- Admins could post only for employers that were already approved.
- Applying required a paid plan.
- There were 0 open jobs.

## What was built

### Super Admin publishing — `/admin/local-jobs`
In the admin menu as "Local Jobs — Post a Job ➕".

- **POST A JOB button** at the top.
- **Tabs:** Dashboard, Post a job, Manage jobs, Employers, Applications, Reports, Categories.

**Access**
- **Main admin only.** Every request is checked on the server, and only the role `SUPER_ADMIN` is allowed. Exactly one account has that role: Tony.
- **Other admins and employers** are refused with a 403 even if they call the API directly.
- **Never charged.** No payment, subscription or plan check runs on this path. Every publication is logged in `job_publication_audit` with `charged: false`.

**The posting form**
- **Fields:** all of the requested fields.
- **Job source:** posted by employer, posted by WorkAbroadHub Admin, or posted on behalf of the employer.
- **Contact consent:** a checkbox confirming the employer agreed to have their contact details published.
- **Verification:**
  - Options are Admin posted, Contact details confirmed, Verified employer, or Verification pending.
  - "Confirmed" and "Verified" require a note saying how the details were checked.
- **Buttons:** Preview, Publish now, Save draft, Cancel.
- **Preview:** shows the job card plus any warnings from the scam checks.

**Employers**
- **Without an account:** you type the employer's name. If it's new, it's created automatically with no account and no login, and labelled "listed by admin".
- **Manage employers:** mark as verified (with a note on how), or remove verification.

**Managing jobs**
- **Actions:** edit, publish, deactivate, renew (choose the number of days), set the expiry date, archive, delete.
- Delete is refused if the job has applications; archive it instead.
- **Filters:** status (live, draft, deactivated, expired, archived, flagged), source, county, category, employer search and date range.
- **CSV export:** per job, includes views, contact reveals, calls, WhatsApp taps and applications.
- **Expiry:** admin jobs never expire because of subscription rules. They only end on the deadline or expiry date you set.

### Public page — "Find Jobs Near You" at `/kenya-careers`
Replaces the old employer-directory page. The old page is still reachable through the links at the bottom ("Employers directory", "Teaching & school jobs") and through school links.

- **Search:** a large search bar plus a location field.
  - "Use my location" is optional. If permission is refused, the visitor types an area instead.
  - Searches by radius: 5, 10, 25, 50 or 100 km.
- **Live counters:**
  - Jobs available, Posted today, This week, Jobs near you, Open positions.
  - Calculated directly from the database on every request, never cached.
  - The page refreshes them every 15 seconds and when you return to the tab.
- **Browsing:** popular categories with job counts, a Today filter, county filter, browse by town and browse by county.
- **Job cards show:** title, employer, location with distance, salary, number of vacancies, employment type, when posted, the application deadline, and a badge — Verified employer, Contact confirmed, Listed by WorkAbroadHub, or Verification pending.
- **Admin-posted ≠ verified.** A job is never labelled "verified" just because an admin posted it.
- **Buttons on each card:** Call employer, WhatsApp, View job details.

### Direct contact
- **Browsing is free and needs no account.** Calling or WhatsApping needs a free sign-in, as you chose.
  - The number is fetched only when the visitor taps the button.
  - At most 40 contacts per hour per visitor, to stop scraping.
- **Call:** opens the phone dialler with `tel:+2547…`.
- **WhatsApp:** opens `wa.me` with the message "Hello, I saw your job vacancy on WorkAbroadHub and I am interested…".
- **Validation:** numbers must be valid Kenyan mobile numbers and are stored as `2547…`.
- **Consent:** numbers are shown only if the employer agreed.
- **Analytics:** taps are counted in `local_job_contact_events` using a daily-rotating anonymous hash. No applicant names, phone numbers or account IDs are stored.
- **Job detail page:** a new panel shows the badge, exact location, working hours, qualifications, experience, "How to apply", and the Call/WhatsApp buttons.

### Finding jobs near you
- **Place list:** `shared/kenya-places.ts` contains about 180 towns, estates and county centres with coordinates.
- **Placing a job:** each job gets coordinates from its estate, or its town if the estate isn't found, or its county centre otherwise.
- **Typed locations:** "Kahawa Wendani", "Ruiru", "Kakamega" and similar are matched to coordinates.
- **Tested distances from the test job in Kahawa Wendani:**

  | Searched from | Distance |
  |---|---|
  | Kahawa Wendani | 0 km |
  | Ruiru | 4.8 km |
  | Kasarani | 6 km |
  | Thika | 22 km |
  | Kakamega | not shown (correct) |
  | Mombasa | not shown (correct) |

### Scam prevention
- **Automatic flags:**
  - Fees asked of job seekers (registration, interview, training or medical fees; "send money / M-Pesa first").
  - Common scam wording.
  - Invalid or fake-looking phone numbers.
  - Very little detail.
  - Duplicates of a live job (same title and employer or phone within 30 days).
  - One phone number used by 3 or more different employers.
- **Fee requests block publishing** until you confirm you've checked the job.
- **Visitors can report a listing** using the existing button, which saves to `vacancy_reports`. Reports appear in the Reports tab.

### Categories
- **27 categories:** all 23 you asked for plus the existing Retail, Transport, Logistics and Other.
- **Admins can add more** from the Categories tab.

### Database (migration 0068, applied)
- **`local_jobs`:**
  - New columns for the fields above, plus `source`, `posted_by_user_id`, `contact_authorized`, `verification_status` and `verification_note`, `expires_at`, `lat`/`lng`, `risk_flags` and `archived_at`.
  - Status rules now include `archived`; source and verification values are restricted to the allowed options.
  - New indexes.
- **`companies`:** new columns `created_by_admin`, `whatsapp_phone` and `verification_note`.
- **New tables:** `local_job_categories`, `local_job_contact_events`, `job_publication_audit`. Row-level security is on, and only the server can access them.
- **Duplicate-title rule:** the old rule blocked re-posting the same job title for the same employer. It now applies only to sample (seed) jobs.
- **Existing listings:** the public job list, job page and stats now also hide expired (`expires_at`) and archived jobs.

## Test results (live)

| # | Test | Result |
|---|---|---|
| 1 | Main admin opens the publishing page | ✅ Page and dashboard load; anonymous requests to admin APIs get 401 |
| 2 | Publish for an employer with no account | ✅ Employer created automatically, 0 employer logins |
| 3 | No charge, no subscription check | ✅ 0 payments created; audit shows `charged:false` |
| 4 | Appears on the public page immediately | ✅ Shown in the job list, card and detail page |
| 5 | Location searches | ✅ County, category, keyword and GPS search all found it; Near-me distances as in the table above |
| 6 | Call button | ✅ `tel:+254722418905`; tap counted |
| 7 | WhatsApp button | ✅ Opens `wa.me/254722418905` with the message pre-filled; tap counted |
| 8 | Counters update | ✅ Went from 0 to total 1, today 1, week 1, near 1, positions 2 straight after publishing |
| 9 | Ordinary users can't bypass rules | ✅ Admin APIs return 401 when signed out and 403 for anyone who isn't SUPER_ADMIN; the employer posting route is unchanged and still requires being that company's admin |
| 10 | Deactivated, expired and archived jobs disappear | ✅ Each removed the job from the list, counters and detail page (404); renewing brought it back |
| 11 | Desktop and mobile | ✅ Tested in a phone-size window (390 px wide) and on desktop. Not tested on a physical Android phone |
| 12 | Existing features still work | ✅ Plans, services, PayPal settings, M-Pesa health, subscriptions, visa jobs, Kazi Karibu and the health check all return normally. `/api/jobs` refuses your admin account because it has no paid subscription; that's how it already worked |

The test job, its audit trail and its test employer were deleted afterwards. Tests passed: 214 of 214, including 6 new ones.

## Notes and limits
- **Counter updates use polling, not push.** The page re-checks the database every 15 seconds and when you come back to the tab, rather than receiving instant updates over a live connection. The site doesn't use Supabase Realtime, and polling keeps it simple and reliable.
- **Jobs posted by employers themselves don't show Call/WhatsApp buttons.** They keep the existing in-platform "Apply" flow, which needs a paid plan. If you want employers to opt in to direct contact too, it's a small addition.
- **Places not on the list** fall back to the county centre, so the job still appears in county searches and wider radius searches. Add more estates to `shared/kenya-places.ts` as needed.
