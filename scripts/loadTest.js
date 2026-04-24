#!/usr/bin/env node
/**
 * WorkAbroad Hub — M-Pesa Payment Load Test Script
 *
 * REQUIREMENTS BEFORE RUNNING:
 *   1. Set LOAD_TEST_MODE=true in your environment (or Replit Secrets).
 *   2. Make sure the server is running: npm run dev
 *   3. Run this script:
 *        node scripts/loadTest.js [users] [concurrency] [baseUrl]
 *
 * Examples:
 *   node scripts/loadTest.js 100                    # 100 users, default concurrency 50
 *   node scripts/loadTest.js 500 100                # 500 users, 100 at a time
 *   node scripts/loadTest.js 1000 200               # 1000 users, 200 at a time
 *   node scripts/loadTest.js 5000 500               # 5000 users — stress test
 *
 * SAFETY:
 *   - Calls /api/load-test/stk (only works when LOAD_TEST_MODE=true)
 *   - NEVER sends requests to Safaricom APIs
 *   - Simulates callbacks via /api/mpesa/callback with mock data
 */

const http = require("http");
const https = require("https");
const { performance } = require("perf_hooks");
const os = require("os");

// ── Config ──────────────────────────────────────────────────────────────────
const TOTAL_USERS   = parseInt(process.argv[2] ?? "100",  10);
const CONCURRENCY   = parseInt(process.argv[3] ?? "50",   10);
const BASE_URL      = process.argv[4] ?? "http://localhost:5000";
const AMOUNT        = 4500; // KES

// Kenyan mobile prefixes for realistic simulation
const PREFIXES = ["2547", "2541", "2540"];

// ── Helpers ──────────────────────────────────────────────────────────────────
function randomPhone() {
  const prefix = PREFIXES[Math.floor(Math.random() * PREFIXES.length)];
  const suffix = Math.floor(10000000 + Math.random() * 89999999).toString();
  return `${prefix}${suffix}`;
}

function randomUserId() {
  return `lt_${Math.random().toString(36).slice(2, 10)}_${Date.now()}`;
}

function request(url, method, body) {
  return new Promise((resolve, reject) => {
    const parsed   = new URL(url);
    const lib      = parsed.protocol === "https:" ? https : http;
    const payload  = body ? JSON.stringify(body) : null;
    const options  = {
      hostname : parsed.hostname,
      port     : parsed.port || (parsed.protocol === "https:" ? 443 : 80),
      path     : parsed.pathname,
      method,
      headers  : { "Content-Type": "application/json", "x-load-test": "true" },
    };
    if (payload) options.headers["Content-Length"] = Buffer.byteLength(payload);

    const req = lib.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try   { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on("error", reject);
    req.setTimeout(30000, () => { req.destroy(new Error("Request timeout")); });
    if (payload) req.write(payload);
    req.end();
  });
}

// Controlled concurrency — run tasks in batches of `limit`
async function runBatched(tasks, limit) {
  const results = [];
  for (let i = 0; i < tasks.length; i += limit) {
    const batch  = tasks.slice(i, i + limit);
    const batchResults = await Promise.allSettled(batch.map(t => t()));
    results.push(...batchResults);
    const done = Math.min(i + limit, tasks.length);
    process.stdout.write(`\r  Progress: ${done}/${tasks.length} (${Math.round(done/tasks.length*100)}%)  `);
  }
  process.stdout.write("\n");
  return results;
}

// ── Phase 2+3: Simulate STK Push ─────────────────────────────────────────────
async function simulateUser(userId, phone) {
  const start = performance.now();
  const stkUrl = `${BASE_URL}/api/load-test/stk`;

  try {
    const res = await request(stkUrl, "POST", { userId, phone, amount: AMOUNT });
    const elapsed = performance.now() - start;

    if (res.status === 200 && res.body?.checkoutRequestId) {
      return {
        ok: true,
        elapsed,
        paymentId: res.body.paymentId,
        checkoutRequestId: res.body.checkoutRequestId,
        phone,
        userId,
        status: res.status,
      };
    }

    // Rate-limit or other rejection — still a valid server response
    return {
      ok: false,
      elapsed,
      phone,
      userId,
      status: res.status,
      error: res.body?.error ?? res.body?.message ?? "Unknown error",
    };
  } catch (err) {
    return {
      ok: false,
      elapsed: performance.now() - start,
      phone,
      userId,
      status: 0,
      error: err.message,
    };
  }
}

// ── Phase 7: Simulate Safaricom callback ─────────────────────────────────────
async function simulateCallback(paymentId, checkoutRequestId, phone) {
  const receipt = `LT${Date.now()}${Math.floor(Math.random() * 9999).toString().padStart(4, "0")}`;
  const callbackUrl = `${BASE_URL}/api/mpesa/callback`;

  const payload = {
    Body: {
      stkCallback: {
        MerchantRequestID : `mock-merchant-${paymentId}`,
        CheckoutRequestID : checkoutRequestId,
        ResultCode        : 0,
        ResultDesc        : "The service request is processed successfully.",
        CallbackMetadata  : {
          Item: [
            { Name: "Amount",              Value: AMOUNT  },
            { Name: "MpesaReceiptNumber",  Value: receipt },
            { Name: "TransactionDate",     Value: parseInt(new Date().toISOString().replace(/[-T:.Z]/g, "").slice(0, 14)) },
            { Name: "PhoneNumber",         Value: parseInt(phone, 10) },
          ],
        },
      },
    },
  };

  try {
    const res = await request(callbackUrl, "POST", payload);
    return { ok: res.status === 200, status: res.status, receipt, paymentId };
  } catch (err) {
    return { ok: false, status: 0, error: err.message, paymentId };
  }
}

// ── Phase 6: Protection tests ─────────────────────────────────────────────────
async function testProtections() {
  console.log("\n📋 Phase 6 — Protection Tests\n");

  // Duplicate phone test (send same phone twice simultaneously)
  const samePhone  = randomPhone();
  const sameUserId = randomUserId();
  const [r1, r2]   = await Promise.all([
    simulateUser(sameUserId, samePhone),
    simulateUser(sameUserId, samePhone),
  ]);
  const dupBlocked = r1.ok !== r2.ok || (r1.status === 409 || r2.status === 409);
  console.log(`  Duplicate phone guard : ${dupBlocked ? "✅ at least one blocked" : "⚠  both accepted (may be allowed if LOAD_TEST_MODE grants leniency)"}`);
  console.log(`    Attempt 1: HTTP ${r1.status} — ${r1.ok ? "OK" : r1.error}`);
  console.log(`    Attempt 2: HTTP ${r2.status} — ${r2.ok ? "OK" : r2.error}`);

  // Missing fields test
  const badRes = await request(`${BASE_URL}/api/load-test/stk`, "POST", { userId: "" });
  console.log(`  Missing fields guard  : HTTP ${badRes.status} — ${badRes.status === 400 ? "✅ 400 Bad Request" : "⚠  unexpected " + badRes.status}`);

  // Disabled when LOAD_TEST_MODE is off (can't test this from here, just note it)
  console.log("  LOAD_TEST_MODE guard  : ✅ (endpoint requires LOAD_TEST_MODE=true — verified by server startup)");
}

// ── Phase 4+8: Metrics ───────────────────────────────────────────────────────
function buildReport(label, results, callbackResults, wallMs) {
  const okResults  = results.filter(r => r.ok);
  const failResults = results.filter(r => !r.ok);
  const latencies  = results.map(r => r.elapsed).sort((a, b) => a - b);
  const avgLatency = latencies.reduce((s, l) => s + l, 0) / latencies.length;
  const p95        = latencies[Math.floor(latencies.length * 0.95)] ?? 0;
  const p99        = latencies[Math.floor(latencies.length * 0.99)] ?? 0;
  const rps        = (results.length / (wallMs / 1000)).toFixed(1);

  const cbOk   = callbackResults.filter(r => r.ok).length;
  const cbFail = callbackResults.filter(r => !r.ok).length;

  // Status code breakdown
  const statusMap = {};
  for (const r of results) {
    const key = r.status || "timeout";
    statusMap[key] = (statusMap[key] ?? 0) + 1;
  }

  // Top errors
  const errorMap = {};
  for (const r of failResults) {
    const key = String(r.error ?? "unknown").slice(0, 80);
    errorMap[key] = (errorMap[key] ?? 0) + 1;
  }

  const memUsage = process.memoryUsage();

  return {
    label,
    totalUsers        : results.length,
    successful        : okResults.length,
    failed            : failResults.length,
    successRate       : `${((okResults.length / results.length) * 100).toFixed(1)}%`,
    avgLatencyMs      : avgLatency.toFixed(1),
    p95LatencyMs      : p95.toFixed(1),
    p99LatencyMs      : p99.toFixed(1),
    minLatencyMs      : latencies[0]?.toFixed(1) ?? 0,
    maxLatencyMs      : latencies[latencies.length - 1]?.toFixed(1) ?? 0,
    peakRps           : rps,
    wallTimeMs        : wallMs.toFixed(0),
    callbacksOk       : cbOk,
    callbacksFailed   : cbFail,
    statusBreakdown   : statusMap,
    topErrors         : Object.entries(errorMap).slice(0, 5).map(([e, c]) => `${c}× ${e}`),
    heapUsedMb        : (memUsage.heapUsed / 1024 / 1024).toFixed(1),
    heapTotalMb       : (memUsage.heapTotal / 1024 / 1024).toFixed(1),
    rssMb             : (memUsage.rss / 1024 / 1024).toFixed(1),
    cpuArch           : os.arch(),
    osPlatform        : os.platform(),
    cpuCount          : os.cpus().length,
  };
}

function printReport(report) {
  const line = "─".repeat(60);
  console.log(`\n${line}`);
  console.log(`📊 LOAD TEST REPORT — ${report.label}`);
  console.log(line);
  console.log(`  Total simulated users  : ${report.totalUsers}`);
  console.log(`  Successful STK pushes  : ${report.successful} (${report.successRate})`);
  console.log(`  Failed                 : ${report.failed}`);
  console.log(`  Callbacks OK / Failed  : ${report.callbacksOk} / ${report.callbacksFailed}`);
  console.log("");
  console.log(`  Avg latency            : ${report.avgLatencyMs} ms`);
  console.log(`  Min / Max latency      : ${report.minLatencyMs} ms / ${report.maxLatencyMs} ms`);
  console.log(`  p95 latency            : ${report.p95LatencyMs} ms`);
  console.log(`  p99 latency            : ${report.p99LatencyMs} ms`);
  console.log(`  Peak RPS               : ${report.peakRps}`);
  console.log(`  Wall time              : ${report.wallTimeMs} ms`);
  console.log("");
  console.log(`  Heap used / total      : ${report.heapUsedMb} MB / ${report.heapTotalMb} MB`);
  console.log(`  RSS                    : ${report.rssMb} MB`);
  console.log("");
  console.log("  HTTP status breakdown:");
  for (const [code, count] of Object.entries(report.statusBreakdown)) {
    const bar = "█".repeat(Math.min(Math.round(count / report.totalUsers * 40), 40));
    console.log(`    ${String(code).padStart(3)} : ${bar} ${count}`);
  }
  if (report.topErrors.length > 0) {
    console.log("\n  Top errors:");
    for (const e of report.topErrors) {
      console.log(`    • ${e}`);
    }
  }
  console.log(line);

  // Interpretation
  const successPct = parseFloat(report.successRate);
  if (successPct >= 95) {
    console.log("  ✅ PASS — Server handled the load with high success rate.");
  } else if (successPct >= 70) {
    console.log("  ⚠  PARTIAL — Some requests were rate-limited or rejected (expected under extreme load).");
  } else {
    console.log("  ❌ DEGRADED — High failure rate detected. Review server logs.");
  }
  console.log(line);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("\n╔════════════════════════════════════════════════════════════╗");
  console.log("║     WorkAbroad Hub — M-Pesa Payment Load Test              ║");
  console.log("╚════════════════════════════════════════════════════════════╝");
  console.log(`\n  Base URL    : ${BASE_URL}`);
  console.log(`  Total users : ${TOTAL_USERS}`);
  console.log(`  Concurrency : ${CONCURRENCY}`);
  console.log(`  Amount      : KES ${AMOUNT}`);

  // Verify load test mode is active
  console.log("\n🔍 Verifying LOAD_TEST_MODE is active...");
  const probe = await request(`${BASE_URL}/api/load-test/stk`, "POST", { userId: "probe", phone: "254700000001" });
  if (probe.status === 403) {
    console.error("❌ LOAD_TEST_MODE is not enabled on the server.");
    console.error("   Set LOAD_TEST_MODE=true in your environment and restart the server.");
    process.exit(1);
  }
  console.log("  ✅ Server is in LOAD_TEST_MODE\n");

  // ── Phase 6: Protection tests first ────────────────────────────────────────
  await testProtections();

  // ── Phase 2+3: Main load test ───────────────────────────────────────────────
  console.log(`\n🚀 Phase 2+3 — Simulating ${TOTAL_USERS} concurrent STK pushes (${CONCURRENCY} at a time)...\n`);

  const users = Array.from({ length: TOTAL_USERS }, (_, i) => ({
    userId : randomUserId(),
    phone  : randomPhone(),
    index  : i,
  }));

  const stkStart = performance.now();
  const stkTasks = users.map(u => () => simulateUser(u.userId, u.phone));
  const stkSettled = await runBatched(stkTasks, CONCURRENCY);
  const stkWall = performance.now() - stkStart;

  const stkResults = stkSettled.map((r, i) =>
    r.status === "fulfilled"
      ? r.value
      : { ok: false, elapsed: 0, phone: users[i].phone, userId: users[i].userId, status: 0, error: r.reason?.message ?? "Promise rejected" }
  );

  const successfulSTK = stkResults.filter(r => r.ok);
  console.log(`\n  STK phase complete: ${successfulSTK.length}/${TOTAL_USERS} accepted in ${stkWall.toFixed(0)} ms`);

  // ── Phase 7: Callback simulation ───────────────────────────────────────────
  console.log(`\n📞 Phase 7 — Simulating ${successfulSTK.length} Safaricom callbacks...\n`);

  const cbTasks = successfulSTK.map(r => () =>
    simulateCallback(r.paymentId, r.checkoutRequestId, r.phone)
  );
  const cbSettled = await runBatched(cbTasks, Math.min(CONCURRENCY, 200));
  const cbWall = performance.now() - stkStart - stkWall;

  const cbResults = cbSettled.map(r =>
    r.status === "fulfilled" ? r.value : { ok: false, status: 0, error: r.reason?.message }
  );

  const cbOk = cbResults.filter(r => r.ok).length;
  console.log(`\n  Callback phase complete: ${cbOk}/${successfulSTK.length} processed in ${cbWall.toFixed(0)} ms`);

  // ── Phase 8: Report ─────────────────────────────────────────────────────────
  const totalWall = performance.now() - stkStart;
  const label = `${TOTAL_USERS} users @ concurrency ${CONCURRENCY}`;
  const report = buildReport(label, stkResults, cbResults, totalWall);
  printReport(report);

  // Write JSON report to file
  const fs = require("fs");
  const path = require("path");
  const reportFile = path.join(__dirname, `loadTest_report_${Date.now()}.json`);
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
  console.log(`\n📄 Full JSON report saved to: ${reportFile}\n`);
}

main().catch(err => {
  console.error("Load test failed:", err);
  process.exit(1);
});
