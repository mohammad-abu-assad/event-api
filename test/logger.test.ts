import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { MemoryEventStore } from '../src/store/memory.js';

const apiKey = 'test-key-not-for-logs';

afterEach(() => vi.restoreAllMocks());

describe('structured request logging', () => {
  it('logs a successful batch once without keys, query strings or props', async () => {
    const output = vi.spyOn(console, 'log').mockImplementation(() => {});
    const app = createApp({ store: new MemoryEventStore(), apiKeys: { demo: apiKey } });
    const response = await request(app)
      .post('/v1/events?private=not-for-logs')
      .set('x-api-key', apiKey)
      .send({ events: [{ name: 'tap', timestamp: '2026-01-01T00:00:00Z', props: { private: 'not-for-logs' } }] });

    expect(response.status).toBe(201);
    expect(output).toHaveBeenCalledOnce();
    const line = String(output.mock.calls[0][0]);
    expect(line).not.toContain(apiKey);
    expect(line).not.toContain('not-for-logs');
    expect(JSON.parse(line)).toMatchObject({
      severity: 'INFO',
      message: expect.any(String),
      method: 'POST',
      path: '/v1/events',
      status: 201,
      durationMs: expect.any(Number),
      clientId: 'demo',
      eventCount: 1,
    });
  });

  it('logs unauthenticated requests as WARNING without a client ID', async () => {
    const output = vi.spyOn(console, 'log').mockImplementation(() => {});
    const app = createApp({ store: new MemoryEventStore(), apiKeys: { demo: apiKey } });
    expect((await request(app).get('/v1/stats')).status).toBe(401);
    expect(output).toHaveBeenCalledOnce();
    expect(JSON.parse(String(output.mock.calls[0][0]))).toMatchObject({
      severity: 'WARNING', method: 'GET', path: '/v1/stats', status: 401, clientId: null,
    });
  });

  it('logs unexpected failures as ERROR without exposing error contents', async () => {
    const output = vi.spyOn(console, 'log').mockImplementation(() => {});
    const store = new MemoryEventStore();
    vi.spyOn(store, 'save').mockRejectedValue(new Error('sensitive exception details'));
    const app = createApp({ store, apiKeys: { demo: apiKey } });
    const response = await request(app).post('/v1/events').set('x-api-key', apiKey)
      .send({ events: [{ name: 'tap', timestamp: '2026-01-01T00:00:00Z' }] });
    expect(response.status).toBe(500);
    expect(output).toHaveBeenCalledOnce();
    const line = String(output.mock.calls[0][0]);
    expect(line).not.toContain('sensitive exception details');
    expect(JSON.parse(line)).toMatchObject({ severity: 'ERROR', status: 500, clientId: 'demo', eventCount: 1 });
  });
});
