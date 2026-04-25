import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'https://ranking.kissme-vip.com';
const VUS = Number(__ENV.VUS || 30);
const DURATION = __ENV.DURATION || '1m';

export const options = {
  vus: VUS,
  duration: DURATION,
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<800'],
  },
};

const endpoints = [
  '/',
  '/ranking.html',
  '/api/ranking/staff',
  '/api/ranking/customers',
  '/api/stats',
  '/api/sold-out',
  '/api/round',
];

export default function () {
  const path = endpoints[Math.floor(Math.random() * endpoints.length)];
  const res = http.get(`${BASE_URL}${path}`, {
    headers: {
      'Cache-Control': 'no-cache',
    },
    timeout: '30s',
  });

  check(res, {
    'status is 200': (r) => r.status === 200,
  });

  sleep(Math.random() * 1.5);
}
