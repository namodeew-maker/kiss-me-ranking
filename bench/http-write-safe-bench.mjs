import { performance } from 'node:perf_hooks';

const BASE_URL = process.env.BASE_URL || 'https://ranking.kissme-vip.com';
const STAGES = (process.env.STAGES || '20:20,40:20,80:20,120:20')
  .split(',')
  .map((entry) => {
    const [vus, seconds] = entry.split(':').map((value) => Number(value.trim()));
    return { vus, seconds };
  })
  .filter((stage) => Number.isFinite(stage.vus) && Number.isFinite(stage.seconds) && stage.vus > 0 && stage.seconds > 0);
const THINK_TIME_MIN_MS = Number(process.env.THINK_TIME_MIN_MS || 250);
const THINK_TIME_MAX_MS = Number(process.env.THINK_TIME_MAX_MS || 1000);
const USER_KEY_COUNT = Number(process.env.USER_KEY_COUNT || 5);
const USER_PREFIX = process.env.USER_PREFIX || 'bench_write_safe';

function percentile(sortedValues, p) {
  if (!sortedValues.length) return 0;
  const index = Math.min(sortedValues.length - 1, Math.max(0, Math.ceil((p / 100) * sortedValues.length) - 1));
  return sortedValues[index];
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomThinkTimeMs() {
  if (!Number.isFinite(THINK_TIME_MIN_MS) || !Number.isFinite(THINK_TIME_MAX_MS)) return 0;
  if (THINK_TIME_MAX_MS <= THINK_TIME_MIN_MS) return Math.max(0, THINK_TIME_MIN_MS);
  return Math.max(0, THINK_TIME_MIN_MS + Math.random() * (THINK_TIME_MAX_MS - THINK_TIME_MIN_MS));
}

function pickPlatformId(workerIndex) {
  const bucket = workerIndex % Math.max(USER_KEY_COUNT, 1);
  return `${USER_PREFIX}_${bucket}`;
}

async function worker(workerIndex, stopAt, latencies, metrics) {
  while (Date.now() < stopAt) {
    const platformId = pickPlatformId(workerIndex);
    const started = performance.now();
    try {
      const res = await fetch(`${BASE_URL}/api/users/upsert`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
        },
        body: JSON.stringify({
          platform: 'line',
          platform_id: platformId,
          display_name: `Benchmark Safe User ${platformId}`,
          picture_url: '',
        }),
      });
      const elapsed = performance.now() - started;
      latencies.push(elapsed);
      const statusKey = String(res.status);
      metrics.status_counts[statusKey] = (metrics.status_counts[statusKey] || 0) + 1;
      if (!res.ok) {
        metrics.error_count += 1;
      }
      await res.arrayBuffer();
    } catch {
      const elapsed = performance.now() - started;
      latencies.push(elapsed);
      metrics.error_count += 1;
      metrics.status_counts.fetch_error = (metrics.status_counts.fetch_error || 0) + 1;
    }

    const thinkTime = randomThinkTimeMs();
    if (thinkTime > 0) {
      await sleep(thinkTime);
    }
  }
}

async function runStage(stage) {
  const latencies = [];
  const metrics = {
    error_count: 0,
    status_counts: {},
  };
  const stopAt = Date.now() + (stage.seconds * 1000);
  const workers = Array.from({ length: stage.vus }, (_, index) => worker(index, stopAt, latencies, metrics));
  const stageStart = performance.now();
  await Promise.all(workers);
  const totalDurationMs = performance.now() - stageStart;

  latencies.sort((a, b) => a - b);
  const totalRequests = latencies.length;
  const successRequests = Math.max(totalRequests - metrics.error_count, 0);

  return {
    vus: stage.vus,
    duration_sec: stage.seconds,
    total_requests: totalRequests,
    success_requests: successRequests,
    error_requests: metrics.error_count,
    req_per_sec: totalDurationMs > 0 ? Number((totalRequests / (totalDurationMs / 1000)).toFixed(2)) : 0,
    p50_ms: Number(percentile(latencies, 50).toFixed(2)),
    p95_ms: Number(percentile(latencies, 95).toFixed(2)),
    p99_ms: Number(percentile(latencies, 99).toFixed(2)),
    max_ms: Number((latencies[latencies.length - 1] || 0).toFixed(2)),
    status_counts: metrics.status_counts,
  };
}

async function main() {
  const results = [];
  for (const stage of STAGES) {
    console.log(`Running write-safe stage vus=${stage.vus} duration=${stage.seconds}s ...`);
    results.push(await runStage(stage));
  }

  console.log(JSON.stringify({
    base_url: BASE_URL,
    user_prefix: USER_PREFIX,
    user_key_count: USER_KEY_COUNT,
    think_time_ms: {
      min: THINK_TIME_MIN_MS,
      max: THINK_TIME_MAX_MS,
    },
    stages: results,
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
