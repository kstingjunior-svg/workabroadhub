# Load tests

Synthetic load tests for verifying WorkAbroad Hub can handle 3,000 concurrent users.

## Install k6

k6 is a single-binary load testing tool. Pick the install path that matches your machine:

- **Windows**: `winget install k6 --source winget` (or `choco install k6`)
- **macOS**: `brew install k6`
- **Linux**: see https://k6.io/docs/getting-started/installation

## What's here

| Script | VUs | Duration | Purpose |
| --- | --- | --- | --- |
| `smoke.js` | 50 | 30 s | Quick sanity check — does the site respond under modest load? Run after every deploy. |
| `ramp.js` | 0 → 500 → 0 | 5 min | Realistic warm-up. Check for the cliff at the edge of the cache + pool. |
| `bombard.js` | 3,000 | 5 min | The 3,000-concurrent target. The actual proof. |

All three scripts hit the same realistic mix of endpoints:

- `/api/services` (cached at edge — should be cheap)
- `/api/visa-jobs` (cached const array — should be cheapest)
- `/api/countries` (cached)
- `/api/public/stats` (cached)
- `/` (HTML home page)

They DON'T hit:
- M-Pesa endpoints (would create fake STK pushes to real customer phones — disastrous)
- Login / register (would create fake accounts polluting the DB)
- Any AI endpoints (would burn real OpenAI credits)

The hot read endpoints are exactly what scales matter most for — if those hold up at 3k, the rest will too.

## Run

```bash
# Quick smoke test (30 seconds, 50 VUs)
k6 run load-tests/smoke.js

# Realistic ramp (5 minutes, climbs to 500 VUs)
k6 run load-tests/ramp.js

# Full 3k bombard (5 minutes at 3,000 VUs)
k6 run load-tests/bombard.js
```

By default the scripts target `https://workabroadhub.tech`. To hit a different
environment (staging, local), set `BASE_URL`:

```bash
BASE_URL=http://localhost:5000 k6 run load-tests/smoke.js
```

## What "passing" looks like

k6 prints a pass/fail summary at the end. Each script has thresholds defined inline:

| Metric | Target |
| --- | --- |
| `http_req_duration{p(95)}` | < 1500 ms |
| `http_req_failed` | < 1% |
| `checks` | > 99% |

If any threshold fails, k6 exits non-zero. The output also shows per-endpoint
breakdowns so you can see exactly which call became the bottleneck.

## Reading the output

The summary at the end will look like:

```
✓ /api/services: status is 200
✓ /api/services: body has services field
✓ /api/visa-jobs: status is 200

█ /api/services
  http_req_duration..............: avg=42.12ms  min=4.81ms  p(90)=99.5ms  p(95)=147ms
█ /api/visa-jobs
  http_req_duration..............: avg=12.45ms  min=2.13ms  p(90)=22.8ms  p(95)=31.2ms
```

The numbers to watch:

- **p(95)** is the 95th percentile. Should stay under 1500 ms even at 3k VUs.
- **avg** is the typical response. Should be under 200 ms for cached endpoints.
- **min** is your best-case (warm cache hit). Cached endpoints should be < 10 ms.

If p(95) climbs into 5+ seconds during bombard, look at the per-endpoint
breakdown — one slow endpoint dragging the rest down means it's NOT cached
correctly. Tell me which endpoint and I'll go fix it.

## Safety notes

- Do NOT run `bombard.js` against production during business hours without
  warning users. Even though you've sized for 3k, the load test itself looks
  like a DDoS to bystanders.
- Better: bring up a Render preview deploy first, hit that with the same
  scripts, then promote to production once green.
- The scripts hit ONLY read endpoints. They won't create fake users, fake
  payments, or fake OpenAI bills.

## Interpreting failures

If `bombard.js` fails:

1. Check the per-endpoint breakdown — which call has the highest p(95)?
2. Tail Render logs during the run. Watch for:
   - `[DB Pool Warning] N clients waiting for connections` — pool is too small
   - `[Redis] error:` — Redis is overwhelmed (rare on Upstash tier)
   - 503/504 responses — Render is dropping requests at the edge
3. Render → Metrics tab. Look for CPU > 80%, memory pressure, dropped requests.

The most likely failure mode at 3k is the Node event loop saturating one
instance. The fix is to bump to 2 instances in Render dashboard — same code,
double the throughput.
