import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const app = createApp({ apiKeys: { demo: 'test-key' } });
const path = '/v1/events';

describe('CORS', () => {
  it.each(['https://activity-tracker-514608.web.app', 'https://activity-tracker-514608.firebaseapp.com', 'http://localhost:5173'])('allows preflight from %s without authentication', async origin => {
    const response = await request(app).options(path).set('Origin', origin)
      .set('Access-Control-Request-Method', 'POST').set('Access-Control-Request-Headers', 'content-type,x-api-key');
    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe(origin);
    expect(response.headers['access-control-allow-headers'].toLowerCase()).toContain('x-api-key');
    expect(response.headers.vary).toContain('Origin');
  });

  it('retains authentication and CORS headers for actual requests', async () => {
    const response = await request(app).get('/v1/stats?from=2026-01-01&to=2026-01-01')
      .set('Origin', 'http://localhost:5173');
    expect(response.status).toBe(401);
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it.each(['https://attacker.example', 'http://localhost.attacker.example:5173', 'https://activity-tracker-514608.web.app.attacker.example'])('does not allow %s', async origin => {
    const response = await request(app).options(path).set('Origin', origin).set('Access-Control-Request-Method', 'POST');
    expect(response.status).toBe(403);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});
