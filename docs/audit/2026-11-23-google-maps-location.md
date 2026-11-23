# Google Maps & precise local job discovery — report (2026-11-23)

Covers the Kenyan Jobs Section (`/kenya-careers`) and Kazi Karibu (`/kazi-karibu`, `/kazi-karibu/browse`).

## Status

The feature is live and working. **It currently runs on the built-in Kenya place list + OpenStreetMap maps**, because no Google keys are set. Once the two keys below are added, the same screens switch to Google Places autocomplete (down to estate/street/landmark), Google geocoding and Google Maps. No code change is needed.

## What was built

- **Database (migration 0069):** PostGIS geography column + GIST index on `local_jobs` and `kazi_karibu_posts`. Also: place id, formatted address, street, workplace vs service-area mode, service radius and precision. Coordinates must be inside Kenya.
- **Server geo service (`server/geo.ts`):**
  - Routes: `/api/geo/config`, `/api/geo/autocomplete`, `/api/geo/place/:id`, `/api/geo/reverse`.
  - Google is called **only from the server** with `GOOGLE_MAPS_SERVER_KEY`, which never reaches the browser.
  - Rate-limited per IP and cached.
  - Falls back to the Kenya gazetteer when there is no key.
- **Publisher location validation:**
  - The pin must be in Kenya.
  - It must be within 3 km of the chosen place (30 km for service areas). Otherwise publishing is refused, e.g. "The pin is 292 km from Ruiru".
  - County and town are filled in from the pin.
- **Search (`POST /api/lj/search`, `POST /api/kazi-karibu/search`):**
  - Radius 1/5/10/25/50 km or anywhere.
  - Sort: nearest / newest / vacancies / salary; paginated.
  - Service-area jobs match when the seeker is inside the area they cover.
  - POST bodies keep the seeker's coordinates out of URLs and logs.
- **Location counters (`stats-near`):** in my area / within 5, 10, 25 km / total / today / this week. Live polling.
- **UI:**
  - Location search with suggestions and "USE MY CURRENT LOCATION". If GPS is denied, it falls back to typed search.
  - Radius chips, sort, category, and List / Map toggle (clustering, radius circle, popups).
  - Mobile-first.
- **Posting:**
  - Map pin picker ("I'm at the workplace", drag/tap pin, workplace vs service area) in the Local Jobs admin publisher, the Kazi Karibu admin form and the public Kazi post form.
  - Publishing requires a location.
- **Admin "Jobs map" tab:** all jobs on a map, county counts, missing/approximate pins list, Fix pin.

## Live acceptance tests (production, 23 Nov)

| # | Test | Result |
|---|------|--------|
| 1 | Search an estate (Kahawa Wendani, Githurai 45) | ✅ suggestions returned, picked |
| 2 | Publish a Kazi job with a map pin (admin UI) | ✅ saved with exact coordinates |
| 3 | Githurai 45 → 5 km | ✅ found, 3.5 km (matches independent calc) |
| 4 | Use current location (simulated GPS allow) | ✅ "3.2 km away" |
| 5 | Deny GPS permission | ✅ "No problem — type your estate or town below instead.", focus moves to search |
| 6 | Githurai 45 → 1 km; Zimmerman → 5 km (~6 km away) | ✅ correctly not found |
| 7 | Thika → 25 km found (21.9 km); Thika → 5 km not found | ✅ |
| 8 | Kakamega → 50 km not found; Kakamega → anywhere listed with distance | ✅ (anywhere was a 500 error, fixed in 31b7e66d) |
| 9 | Local Jobs admin publish: no location refused; pin 292 km off refused; correct pin accepted | ✅ |
| 10 | Local job found from Kahawa Wendani at 4.8 km; not found from Kakamega 50 km | ✅ |
| 11 | Map view vs list view (mobile, 390 px) | ✅ pin, radius circle, user marker |
| 12 | Counters: 1 job within 5/10/25 km → deleted → 0 | ✅ updates immediately |
| 13 | Desktop + mobile; admin Jobs map tab shows pin, county count, Fix pin | ✅ |

All test posts, jobs and the test company were removed afterwards.

Small fix found during testing: the summary read "within 5 km of near Githurai". It now reads "within 5 km of you (near Githurai)".

## What Tony needs to provide (Google)

Set these in **Render → workabroadhub (srv-d7lqd277f7vs73cikaq0) → Environment**. Do not paste them in chat.

### 1. `GOOGLE_MAPS_SERVER_KEY` — server only

- In Google Cloud Console, go to APIs & Services and enable **Places API (New)** and **Geocoding API**.
- Under Credentials, create an API key and set **API restrictions** to Places API (New) + Geocoding API only.
- Application restriction: "None" or IP addresses. Render's outbound IPs are listed under the service's Connect → Outbound settings.
- This key is used only by the server and never sent to browsers.

### 2. `VITE_GOOGLE_MAPS_BROWSER_KEY` — browser map display

- Enable **Maps JavaScript API**.
- Create a **separate** key with:
  - **Application restriction:** HTTP referrers `https://workabroadhub.tech/*` and `https://*.workabroadhub.tech/*`.
  - **API restriction:** Maps JavaScript API only.
- This value is baked in at build time, so **trigger a redeploy** after setting it.

### 3. Quotas and billing alerts (Google Cloud console)

- **Billing → Budgets & alerts:** create a monthly budget (e.g. USD 20) with alerts at 50%, 90% and 100%.
- **APIs & Services → each API → Quotas:** cap requests per day, e.g.:
  - Places autocomplete: 2,000/day
  - Place details: 1,000/day
  - Geocoding: 1,000/day
  - Maps JS loads: 3,000/day
- The server already rate-limits per IP and caches results, and autocomplete uses session tokens, which lowers billing.

If either key is missing, the site keeps working on the built-in place list and OpenStreetMap.
