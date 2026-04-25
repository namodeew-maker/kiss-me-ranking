import { Client } from 'pg';
import { performance } from 'node:perf_hooks';

const connectionString = process.env.DATABASE_URL;
const SAMPLES = Number(process.env.SAMPLES || 20);

if (!connectionString) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

function percentile(sortedValues, p) {
  if (!sortedValues.length) return 0;
  const index = Math.min(sortedValues.length - 1, Math.max(0, Math.ceil((p / 100) * sortedValues.length) - 1));
  return sortedValues[index];
}

async function main() {
  const client = new Client({
    connectionString,
    ssl: true,
  });
  await client.connect();

  const latencies = [];
  for (let i = 0; i < SAMPLES; i += 1) {
    const started = performance.now();
    await client.query('SELECT 1');
    latencies.push(performance.now() - started);
  }

  await client.end();
  latencies.sort((a, b) => a - b);

  console.log(JSON.stringify({
    samples: SAMPLES,
    p50_ms: Number(percentile(latencies, 50).toFixed(2)),
    p95_ms: Number(percentile(latencies, 95).toFixed(2)),
    p99_ms: Number(percentile(latencies, 99).toFixed(2)),
    max_ms: Number((latencies[latencies.length - 1] || 0).toFixed(2)),
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
