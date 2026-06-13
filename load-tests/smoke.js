// ─────────────────────────────────────────────────────────────────────────────
// smoke.js — quick sanity check after every deploy.
// 50 VUs for 30 seconds. Total requests: ~1,500.
//
// Run:   k6 run load-tests/smoke.js
// CI/CD: k6 run --quiet --summary-export=smoke.json load-tests/smoke.js
// ─────────────────────────────────────────────────────────────────────────────

import http from "k6/http";
import { check, group, sleep } from "k6";
import { Trend } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "https://workabroadhub.tech";

// Per-endpoint timing so we can see which one drags the average up.
const servicesTrend  = new Trend("services_duration",  true);
const visaJobsTrend  = new Trend("visa_jobs_duration", true);
const countriesTrend = new Trend("countries_duration", true);
const statsTrend     = new Trend("stats_duration",     true);

export const options = {
  vus: 50,
  duration: "30s",
  thresholds: {
    http_req_failed: ["rate<0.01"],                  // < 1% errors
    http_req_duration: ["p(95)<1500"],               // p95 under 1.5 s
    checks: ["rate>0.99"],                           // > 99% asserts pass
    services_duration:  ["p(95)<500"],
    visa_jobs_duration: ["p(95)<300"],
    countries_duration: ["p(95)<500"],
    stats_duration:     ["p(95)<500"],
  },
};

export default function () {
  group("hot read endpoints", function () {
    const services = http.get(`${BASE_URL}/api/services`, { tags: { name: "services" } });
    servicesTrend.add(services.timings.duration);
    check(services, {
      "services: 200":               (r) => r.status === 200,
      "services: has services arr":  (r) => {
        try { return Array.isArray(JSON.parse(r.body).services); } catch { return false; }
      },
    });

    const visaJobs = http.get(`${BASE_URL}/api/visa-jobs`, { tags: { name: "visa-jobs" } });
    visaJobsTrend.add(visaJobs.timings.duration);
    check(visaJobs, {
      "visa-jobs: 200":  (r) => r.status === 200,
      "visa-jobs: has jobs": (r) => {
        try { return Array.isArray(JSON.parse(r.body).jobs); } catch { return false; }
      },
    });

    const countries = http.get(`${BASE_URL}/api/countries`, { tags: { name: "countries" } });
    countriesTrend.add(countries.timings.duration);
    check(countries, { "countries: 200": (r) => r.status === 200 });

    const stats = http.get(`${BASE_URL}/api/public/stats`, { tags: { name: "stats" } });
    statsTrend.add(stats.timings.duration);
    check(stats, { "stats: 200": (r) => r.status === 200 });
  });

  // Pace ourselves — realistic user does not refresh every 10 ms.
  sleep(1);
}
