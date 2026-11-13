import http from 'k6/http';
import { check, sleep } from 'k6';

// Keep the default run below the per-key rate limit: one user waits one
// second between requests. Each accepted event remains in the event store.
export const options = {
  vus: 1,
  duration: '30s',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    checks: ['rate==1'],
  },
};

const baseUrl = (__ENV.BASE_URL || '').replace(/\/$/, '');
const apiKey = __ENV.API_KEY;

if (!baseUrl || !apiKey) {
  throw new Error('Set BASE_URL and API_KEY before running the load test.');
}

export default function () {
  const body = JSON.stringify({
    events: [{ name: 'load_test', timestamp: new Date().toISOString() }],
  });
  const response = http.post(`${baseUrl}/v1/events`, body, {
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
  });

  check(response, {
    'batch accepted': (result) => result.status === 201 && result.json('accepted') === 1,
  });
  sleep(1);
}
