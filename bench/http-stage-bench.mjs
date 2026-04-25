import { performance } from 'node:perf_hooks';

const BASE_URL = process.env.BASE_URL || 'https://ranking.kissme-vip.com';
const STAGES = (process.env.STAGES || '50:20,100:20,200:20,300:20')
  .split(',')
  .map((entry) => {
    const [vus, seconds] = entry.split(':').map((value) => Number(value.trim()));
    return { vus, seconds };
  })
  .filter((stage) => Number.isFinite(stage.vus) && Number.isFinite(stage.seconds) && stage.vus > 0 && stage.seconds > 0);

const ENDPOINTS = [
  '/',
  '/ranking.html',
  '/api/ranking/staff',
  '/api/ranking/customers',
  '/api/stats',
  '/api/sold-out',
  '/api/round',
];

function pickEndpoint() {
  return ENDPOINTS[Math.floor(Math.random() * ENDPOINTS.length)];
}

function percentile(sortedValues, p) {
  if (!sortedValues.length) return 0;
  const index = Math.min(sortedValues.length - 1, Math.max(0, Math.ceil((p / 100) * sortedValues.length) - 1));
  return sortedValues[index];
}

async function worker(stopAt, latencies, errors) {
  while (Date.now() < stopAt) {
    const path = pickEndpoint();
    const started = performance.now();
    try {
      const res = await fetch(`${BASE_URL}${path}`, {
        method: 'GET',
        headers: { 'Cache-Control': 'no-cache' },
      });
      const elapsed = performance.now() - started;
      latencies.push(elapsed);
      if (!res.ok) {
        errors.count += 1;
      }
      await res.arrayBuffer();
    } catch {
      const elapsed = performance.now() - started;
      latencies.push(elapsed);
      errors.count += 1;
    }
  }
}

async function runStage(stage) {
  const latencies = [];
  const errors = { count: 0 };
  const stopAt = Date.now() + (stage.seconds * 1000);
  const workers = Array.from({ length: stage.vus }, () => worker(stopAt, latencies, errors));
  const stageStart = performance.now();
  await Promise.all(workers);
  const totalDurationMs = performance.now() - stageStart;

  latencies.sort((a, b) => a - b);
  const totalRequests = latencies.length;
  const successRequests = Math.max(totalRequests - errors.count, 0);

  return {
    vus: stage.vus,
    duration_sec: stage.seconds,
    total_requests: totalRequests,
    success_requests: successRequests,
    error_requests: errors.count,
    req_per_sec: totalDurationMs > 0 ? Number((totalRequests / (totalDurationMs / 1000)).toFixed(2)) : 0,
    p50_ms: Number(percentile(latencies, 50).toFixed(2)),
    p95_ms: Number(percentile(latencies, 95).toFixed(2)),
    p99_ms: Number(percentile(latencies, 99).toFixed(2)),
    max_ms: Number((latencies[latencies.length - 1] || 0).toFixed(2)),
  };
}

async function main() {
  const results = [];
  for (const stage of STAGES) {
    // eslint-disable-next-line no-console
    console.log(`Running stage vus=${stage.vus} duration=${stage.seconds}s ...`);
    results.push(await runStage(stage));
  }

  // eslint-disable-next-line no-console
  console.log(JSON.stringify({
    base_url: BASE_URL,
    endpoints: ENDPOINTS,
    stages: results,
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
