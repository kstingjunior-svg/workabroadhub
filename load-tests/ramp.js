// ─────────────────────────────────────────────────────────────────────────────
// ramp.js — gradual climb to 500 VUs over 5 minutes.
// Catches the cliff that fixed-VU smoke tests miss: the moment when the
// connection pool fills, the cache stampedes, or one slow query starts
// queueing every other request.
//
// Run: k6 run load-tests/ramp.js
// ─────────────────────────────────────────────────────────────────────────────

import http from "k6/http";
import { check, group, sleep } from "k6";
import { Trend } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "https://workabroadhub.tech";

const servicesTrend  = new Trend("services_duration",  true);
const visaJobsTrend  = new Trend("visa_jobs_duration", true);
const countriesTrend = new Trend("countries_duration", true);
const homeTrend      = new Trend("home_duration",      true);

export const options = {
  stages: [
    { duration: "30s", target:  50 },   // warm caches
    { duration: "60s", target: 200 },   // typical mid-traffic
    { duration: "60s", target: 500 },   // pushing it
    { duration: "60s", target: 500 },   // hold at peak
    { duration: "30s", target:   0 },   // ramp down (so we catch reconnect spam)
  ],
  thresholds: {
    http_req_failed: ["rate<0.02"],
    http_req_duration: ["p(95)<2000"],
    checks: ["rate>0.98"],
  },
};

export default function () {
  group("hot reads", function () {
    const home = http.get(BASE_URL, { tags: { name: "home" } });
    homeTrend.add(home.timings.duration);
    check(home, { "home: 200": (r) => r.status === 200 });

    const services = http.get(`${BASE_URL}/api/services`, { tags: { name: "services" } });
    servicesTrend.add(services.timings.duration);
    check(services, { "services: 200": (r) => r.status === 200 });

    const visaJobs = http.get(`${BASE_URL}/api/visa-jobs`, { tags: { name: "visa-jobs" } });
    visaJobsTrend.add(visaJobs.timings.duration);
    check(visaJobs, { "visa-jobs: 200": (r) => r.status === 200 });

    const countries = http.get(`${BASE_URL}/api/countries`, { tags: { name: "countries" } });
    countriesTrend.add(countries.timings.duration);
    check(countries, { "countries: 200": (r) => r.status === 200 });
  });

  sleep(Math.random() * 2 + 1); // 1-3 s between requests (realistic browse pace)
}
