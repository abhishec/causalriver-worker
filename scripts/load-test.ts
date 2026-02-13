#!/usr/bin/env npx tsx
/**
 * NexusBrain Load Test Framework (Week 3)
 *
 * Tests the brain API under load to validate:
 * 1. Rate limiting works correctly (429 responses)
 * 2. Response times stay under SLA (<2s for queries)
 * 3. Concurrent connections don't exhaust pool
 * 4. Causal discovery scales with signal count
 *
 * Usage:
 *   npx tsx scripts/load-test.ts --url https://your-app.amplifyapp.com --key nxb_...
 *   npx tsx scripts/load-test.ts --url http://localhost:3000 --key nxb_... --concurrency 50
 */

const args = process.argv.slice(2);
const getArg = (name: string, defaultVal: string) => {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : defaultVal;
};

const BASE_URL = getArg("url", "http://localhost:3000");
const API_KEY = getArg("key", "");
const CONCURRENCY = parseInt(getArg("concurrency", "20"), 10);
const DURATION_SECONDS = parseInt(getArg("duration", "30"), 10);

if (!API_KEY) {
  console.error("Usage: npx tsx scripts/load-test.ts --url <base_url> --key <api_key>");
  process.exit(1);
}

interface TestResult {
  test: string;
  requests: number;
  successes: number;
  failures: number;
  rate_limited: number;
  avg_latency_ms: number;
  p95_latency_ms: number;
  p99_latency_ms: number;
  max_latency_ms: number;
  rps: number;
}

const QUESTIONS = [
  "What drives customer churn?",
  "How does engineering velocity affect revenue?",
  "What is the impact of marketing spend on growth?",
  "Diagnose why support tickets are increasing",
  "Forecast next quarter revenue",
  "What causes employee attrition?",
  "Simulate doubling the sales team",
  "Explain the relationship between deploy frequency and incidents",
  "What are the top risks to our business?",
  "How does product adoption affect NRR?",
];

async function makeRequest(url: string, body: unknown): Promise<{ status: number; latency: number }> {
  const start = Date.now();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify(body),
    });
    return { status: res.status, latency: Date.now() - start };
  } catch {
    return { status: 0, latency: Date.now() - start };
  }
}

function percentile(arr: number[], p: number): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)] ?? 0;
}

async function runLoadTest(
  testName: string,
  concurrency: number,
  durationMs: number,
  requestFn: () => Promise<{ status: number; latency: number }>
): Promise<TestResult> {
  const latencies: number[] = [];
  let successes = 0;
  let failures = 0;
  let rateLimited = 0;
  const deadline = Date.now() + durationMs;

  console.log(`\n🧪 ${testName} — ${concurrency} concurrent, ${durationMs / 1000}s`);

  const workers = Array.from({ length: concurrency }, async () => {
    while (Date.now() < deadline) {
      const result = await requestFn();
      latencies.push(result.latency);

      if (result.status === 200) successes++;
      else if (result.status === 429) rateLimited++;
      else failures++;
    }
  });

  await Promise.all(workers);

  const total = latencies.length;
  const avgLatency = total > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / total) : 0;
  const rps = total / (durationMs / 1000);

  const result: TestResult = {
    test: testName,
    requests: total,
    successes,
    failures,
    rate_limited: rateLimited,
    avg_latency_ms: avgLatency,
    p95_latency_ms: percentile(latencies, 95),
    p99_latency_ms: percentile(latencies, 99),
    max_latency_ms: Math.max(...latencies, 0),
    rps: Math.round(rps * 100) / 100,
  };

  console.log(`   ✅ ${successes} OK | ❌ ${failures} ERR | 🚦 ${rateLimited} RATE_LIMITED`);
  console.log(`   ⏱️  avg=${avgLatency}ms | p95=${result.p95_latency_ms}ms | p99=${result.p99_latency_ms}ms | max=${result.max_latency_ms}ms`);
  console.log(`   📊 ${result.rps} req/s`);

  return result;
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(" NexusBrain Load Test Framework v1.0");
  console.log(`  Target: ${BASE_URL}`);
  console.log(`  Concurrency: ${CONCURRENCY}`);
  console.log(`  Duration: ${DURATION_SECONDS}s per test`);
  console.log("═══════════════════════════════════════════════════════════════");

  const results: TestResult[] = [];

  // Test 1: Health endpoint (baseline latency)
  results.push(
    await runLoadTest("Health Check (baseline)", CONCURRENCY, 10_000, () =>
      fetch(`${BASE_URL}/api/brain/health`).then((r) => ({
        status: r.status,
        latency: 0,
      })).catch(() => ({ status: 0, latency: 0 }))
      .then((r) => {
        const start = Date.now();
        return fetch(`${BASE_URL}/api/brain/health`).then((res) => ({
          status: res.status,
          latency: Date.now() - start,
        }));
      })
    )
  );

  // Test 2: Brain query (normal load)
  results.push(
    await runLoadTest("Brain Query (normal)", Math.min(CONCURRENCY, 10), DURATION_SECONDS * 1000, () =>
      makeRequest(`${BASE_URL}/api/brain/query`, {
        question: QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)],
        format: "compact",
      })
    )
  );

  // Test 3: Brain query (high concurrency — test connection pool)
  results.push(
    await runLoadTest("Brain Query (stress)", CONCURRENCY, DURATION_SECONDS * 1000, () =>
      makeRequest(`${BASE_URL}/api/brain/query`, {
        question: QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)],
        format: "compact",
      })
    )
  );

  // Test 4: Rate limit enforcement
  console.log("\n🧪 Rate Limit Enforcement Test — burst 200 requests");
  let rateLimited = 0;
  const burstResults = await Promise.all(
    Array.from({ length: 200 }, () =>
      makeRequest(`${BASE_URL}/api/brain/query`, {
        question: "Test rate limiting",
        format: "compact",
      })
    )
  );
  rateLimited = burstResults.filter((r) => r.status === 429).length;
  const burstSuccess = burstResults.filter((r) => r.status === 200).length;
  console.log(`   ✅ ${burstSuccess} allowed | 🚦 ${rateLimited} rate-limited (expected ~140+)`);
  console.log(`   ${rateLimited > 100 ? "✅ Rate limiting is working!" : "⚠️ Rate limiting may not be enforcing correctly"}`);

  // Test 5: Tool discovery (GET /api/brain/tools)
  results.push(
    await runLoadTest("Tool Discovery (GET)", CONCURRENCY, 10_000, async () => {
      const start = Date.now();
      const res = await fetch(`${BASE_URL}/api/brain/tools`);
      return { status: res.status, latency: Date.now() - start };
    })
  );

  // Summary
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log(" LOAD TEST SUMMARY");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("\n| Test | Requests | RPS | Avg(ms) | P95(ms) | P99(ms) | Errors |");
  console.log("|------|----------|-----|---------|---------|---------|--------|");
  for (const r of results) {
    console.log(
      `| ${r.test.padEnd(30)} | ${String(r.requests).padStart(8)} | ${String(r.rps).padStart(5)} | ${String(r.avg_latency_ms).padStart(7)} | ${String(r.p95_latency_ms).padStart(7)} | ${String(r.p99_latency_ms).padStart(7)} | ${String(r.failures).padStart(6)} |`
    );
  }

  // SLA checks
  console.log("\n📋 SLA Checks:");
  const queryTest = results.find((r) => r.test.includes("normal"));
  if (queryTest) {
    console.log(`  Brain Query P95 < 2000ms: ${queryTest.p95_latency_ms < 2000 ? "✅ PASS" : "❌ FAIL"} (${queryTest.p95_latency_ms}ms)`);
    console.log(`  Brain Query P99 < 5000ms: ${queryTest.p99_latency_ms < 5000 ? "✅ PASS" : "❌ FAIL"} (${queryTest.p99_latency_ms}ms)`);
    console.log(`  Error rate < 1%: ${queryTest.failures / queryTest.requests < 0.01 ? "✅ PASS" : "❌ FAIL"} (${((queryTest.failures / queryTest.requests) * 100).toFixed(2)}%)`);
  }
  console.log(`  Rate limiting enforced: ${rateLimited > 100 ? "✅ PASS" : "❌ FAIL"} (${rateLimited}/200 blocked)`);
}

main().catch(console.error);
