import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { MemoryEventStore } from '../src/store/memory.js';

const keys = { first: 'test-first-key', second: 'test-second-key' };
const event = { name: 'button_clicked', timestamp: '2026-01-10T12:00:00Z' };
const id = '123e4567-e89b-42d3-a456-426614174000';

function makeApp() {
  return createApp({ store: new MemoryEventStore(), apiKeys: keys });
}

describe('event ingestion and stats', () => {
  it('accepts a valid batch and returns daily counts sorted by date and name', async () => {
    const app = makeApp();
    const response = await request(app).post('/v1/events').set('x-api-key', keys.first).send({
      events: [event, { ...event, name: 'app_opened' }, { ...event, timestamp: '2026-01-09T23:00:00Z' }],
    });
    expect(response.status).toBe(201);
    expect(response.body).toEqual({ accepted: 3 });

    const stats = await request(app).get('/v1/stats?from=2026-01-01&to=2026-01-31').set('x-api-key', keys.first);
    expect(stats.status).toBe(200);
    expect(stats.body).toEqual({
      from: '2026-01-01',
      to: '2026-01-31',
      stats: [
        { date: '2026-01-09', name: 'button_clicked', count: 1 },
        { date: '2026-01-10', name: 'app_opened', count: 1 },
        { date: '2026-01-10', name: 'button_clicked', count: 1 },
      ],
    });
  });

  it('rejects invalid batches with validation issues', async () => {
    const response = await request(makeApp()).post('/v1/events').set('x-api-key', keys.first).send({
      events: [{ name: '', timestamp: 'yesterday', props: { nested: { bad: true } } }],
    });
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('invalid_request');
    expect(response.body.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'events.0.name', message: expect.any(String) }),
      expect.objectContaining({ path: 'events.0.timestamp', message: expect.any(String) }),
    ]));
  });

  it.each(['missing', 'wrong'])('rejects a %s API key', async (keyType) => {
    const req = request(makeApp()).post('/v1/events');
    if (keyType === 'wrong') req.set('x-api-key', 'wrong-key');
    const response = await req.send({ events: [event] });
    expect(response.status).toBe(401);
    expect(response.body.error).toBe('unauthorized');
  });

  it('keeps each client’s events separate and deduplicates IDs per client', async () => {
    const app = makeApp();
    for (const key of [keys.first, keys.first, keys.second]) {
      expect((await request(app).post('/v1/events').set('x-api-key', key).send({ events: [{ ...event, id }] })).status).toBe(201);
    }
    for (const key of [keys.first, keys.second]) {
      const response = await request(app).get('/v1/stats?from=2026-01-10&to=2026-01-10').set('x-api-key', key);
      expect(response.body.stats).toEqual([{ date: '2026-01-10', name: 'button_clicked', count: 1 }]);
    }
  });

  it.each([
    '/v1/stats?from=2026-01-01',
    '/v1/stats?from=2026-02-30&to=2026-03-01',
    '/v1/stats?from=2026-02-01&to=2026-01-01',
    '/v1/stats?from=2026-01-01&to=2026-02-01',
  ])('rejects an invalid stats range: %s', async (url) => {
    const response = await request(makeApp()).get(url).set('x-api-key', keys.first);
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('invalid_request');
    expect(response.body.issues.length).toBeGreaterThan(0);
  });

  it('rejects malformed JSON and bodies larger than 100 KB', async () => {
    const app = makeApp();
    const malformed = await request(app).post('/v1/events').set('x-api-key', keys.first).set('Content-Type', 'application/json').send('{');
    expect(malformed.status).toBe(400);
    expect(malformed.body.error).toBe('invalid_request');
    expect(malformed.body.issues.length).toBeGreaterThan(0);

    const large = await request(app).post('/v1/events').set('x-api-key', keys.first).send({ events: [{ ...event, props: { data: 'a'.repeat(103000) } }] });
    expect(large.status).toBe(413);
    expect(large.body.error).toBe('payload_too_large');
  });

  it('groups timestamps by UTC day', async () => {
    const app = makeApp();
    await request(app).post('/v1/events').set('x-api-key', keys.first).send({
      events: [{ ...event, timestamp: '2026-01-10T00:30:00+02:00' }],
    });
    const response = await request(app).get('/v1/stats?from=2026-01-09&to=2026-01-09').set('x-api-key', keys.first);
    expect(response.body.stats).toEqual([{ date: '2026-01-09', name: 'button_clicked', count: 1 }]);
  });

  it('hides unexpected store errors from clients', async () => {
    const store = new MemoryEventStore();
    vi.spyOn(store, 'save').mockRejectedValue(new Error('private details'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const response = await request(createApp({ store, apiKeys: keys }))
        .post('/v1/events').set('x-api-key', keys.first).send({ events: [event] });
      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'internal_error', message: 'An unexpected error occurred.' });
    } finally {
      log.mockRestore();
    }
  });

  it('allows 60 requests per key per minute and supplies Retry-After on the next', async () => {
    const app = makeApp();
    for (let i = 0; i < 60; i++) {
      const response = await request(app).get('/v1/stats?from=2026-01-01&to=2026-01-01').set('x-api-key', keys.first);
      expect(response.status).toBe(200);
    }
    const limited = await request(app).get('/v1/stats?from=2026-01-01&to=2026-01-01').set('x-api-key', keys.first);
    expect(limited.status).toBe(429);
    expect(limited.body.error).toBe('rate_limited');
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    const other = await request(app).get('/v1/stats?from=2026-01-01&to=2026-01-01').set('x-api-key', keys.second);
    expect(other.status).toBe(200);
  });

  it('limits sdk-public-demo to 10 requests without reducing another client’s limit', async () => {
    const app = createApp({ apiKeys: { 'sdk-public-demo': 'test-demo-key', first: keys.first } });
    const url = '/v1/stats?from=2026-01-01&to=2026-01-01';
    for (let i = 0; i < 10; i++) {
      expect((await request(app).get(url).set('x-api-key', 'test-demo-key')).status).toBe(200);
    }
    const limited = await request(app).get(url).set('x-api-key', 'test-demo-key');
    expect(limited.status).toBe(429);
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    expect((await request(app).get(url).set('x-api-key', keys.first)).status).toBe(200);
  });

  it('resets the rate limit after one minute', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    try {
      const app = makeApp();
      for (let i = 0; i < 60; i++) {
        await request(app).get('/v1/stats?from=2026-01-01&to=2026-01-01').set('x-api-key', keys.first);
      }
      expect((await request(app).get('/v1/stats?from=2026-01-01&to=2026-01-01').set('x-api-key', keys.first)).status).toBe(429);
      now.mockReturnValue(1_060_000);
      expect((await request(app).get('/v1/stats?from=2026-01-01&to=2026-01-01').set('x-api-key', keys.first)).status).toBe(200);
    } finally {
      now.mockRestore();
    }
  });
});
