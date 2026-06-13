// ─────────────────────────────────────────────────────────────────────────────
// bombard.js — the actual 3,000-concurrent-user proof.
//
// Ramps from 0 to 3,000 VUs over 90 seconds, holds at 3,000 for 5 minutes,
// then ramps down. Total: ~7 minutes. At 3,000 VUs each making 1 request
// every ~2 seconds, that's ~1,500 req/s sustained.
//
// WARNING: This is a real DDoS-shaped traffic burst. Read load-tests/README.md
// before running against production. Better: spin up a Render preview deploy
// and bombard that first.
//
// Run:   k6 run load-tests/bombard.js
// Local: BASE_URL=http://localhost:5000 k6 run load-tests/bombard.js
// ─────────────────────────────────────────────────────────────────────────────

import http from "k6/http";
import { check, group, sleep } from "k6";
import { Trend, Rate } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "https://workabroadhub.tech";

const servicesTrend  = new Trend("services_duration",  true);
const visaJobsTrend  = new Trend("visa_jobs_duration", true);
const countriesTrend = new Trend("countries_duration", true);
const homeTrend      = new Trend("home_duration",      true);
const errorRate      = new Rate("errors");

export const options = {
  stages: [
    { duration: "90s",  target: 3000 },  // 3k ramp
    { duration: "300s", target: 3000 },  // 5 min hold
    { duration: "60s",  target:    0 },  // ramp down
  ],
  thresholds: {
    http_req_failed:   ["rate<0.05"],            // < 5% errors at peak
    http_req_duration: ["p(95)<3000"],           // p95 under 3 s at 3k
    checks:            ["rate>0.95"],
    errors:            ["rate<0.05"],
  },
  // k6 default rps cap is 0 (unlimited). On a single laptop this script
  // can saturate your own outbound bandwidth before the server does — if
  // you see "client got no response", lower the VU count.
  noConnectionReuse: false,
  userAgent:         "k6-bombard/1.0 (WorkAbroadHub load test)",
};

const PATHS = [
  "/api/services",
  "/api/visa-jobs",
  "/api/countries",
  "/api/public/stats",
];

export default function () {
  // Each VU picks a random hot endpoint to spread load realistically.
  const idx = Math.floor(Math.random() * (PATHS.length + 1));

  if (idx === PATHS.length) {
    const home = http.get(BASE_URL, { tags: { name: "home" } });
    homeTrend.add(home.timings.duration);
    const ok = check(home, { "home: 2xx/3xx": (r) => r.status < 400 });
    errorRate.add(!ok);
  } else {
    const path = PATHS[idx];
    const res = http.get(`${BASE_URL}${path}`, { tags: { name: path } });
    if (path.endsWith("/api/services"))  servicesTrend.add(res.timings.duration);
    if (path.endsWith("/api/visa-jobs")) visaJobsTrend.add(res.timings.duration);
    if (path.endsWith("/api/countries")) countriesTrend.add(res.timings.duration);
    const ok = check(res, {
      [`${path}: 2xx/3xx`]: (r) => r.status < 400,
    });
    errorRate.add(!ok);
  }

  // Realistic browse pace — between 1 and 3 seconds between requests.
  sleep(Math.random() * 2 + 1);
}

export function handleSummary(data) {
  // Make the result easy to scan in a CI/CD log.
  const failed = data.metrics.http_req_failed?.values?.rate ?? 0;
  const p95    = data.metrics.http_req_duration?.values?.["p(95)"] ?? 0;
  const max    = data.metrics.http_req_duration?.values?.max ?? 0;
  const checks = data.metrics.checks?.values?.rate ?? 0;

  const verdict = (failed < 0.05 && p95 < 3000 && checks > 0.95) ? "PASS ✓" : "FAIL ✗";

  const summary = [
    "",
    "============================================================",
    `  WorkAbroad Hub 3k bombard — ${verdict}`,
    "============================================================",
    `  Error rate:   ${(failed * 100).toFixed(2)}%   (target < 5%)`,
    `  p95 latency:  ${p95.toFixed(0)} ms          (target < 3000)`,
    `  Max latency:  ${max.toFixed(0)} ms`,
    `  Checks pass:  ${(checks * 100).toFixed(2)}%   (target > 95%)`,
    "============================================================",
    "",
  ].join("\n");

  return {
    stdout: summary,
    "bombard-results.json": JSON.stringify(data, null, 2),
  };
}
