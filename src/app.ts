import express, { type ErrorRequestHandler } from 'express';
import { authenticate, readApiKeys } from './auth.js';
import { requestLogger } from './logger.js';
import { createRateLimiter } from './rateLimit.js';
import { healthRouter } from './routes/health.js';
import { eventsRouter } from './routes/events.js';
import { statsRouter } from './routes/stats.js';
import { MemoryEventStore } from './store/memory.js';
import type { EventStore } from './store/types.js';

interface AppOptions {
  store?: EventStore;
  apiKeys?: Record<string, string>;
}

export function createApp(options: AppOptions = {}) {
  const app = express();
  const store = options.store ?? new MemoryEventStore();
  const apiKeys = options.apiKeys ?? readApiKeys(process.env.API_KEYS);

  app.use(requestLogger);
  app.use(healthRouter);
  app.use('/v1', authenticate(apiKeys), createRateLimiter());
  app.use('/v1/events', express.json({ limit: '100kb' }));
  app.use('/v1', eventsRouter(store), statsRouter(store));

  const handleError: ErrorRequestHandler = (error: unknown, _req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    const type = typeof error === 'object' && error !== null && 'type' in error ? error.type : undefined;
    if (type === 'entity.too.large') {
      res.status(413).json({ error: 'payload_too_large', message: 'The request body is too large.' });
    } else if (type === 'entity.parse.failed') {
      res.status(400).json({
        error: 'invalid_request',
        message: 'Request validation failed.',
        issues: [{ path: '', message: 'Invalid JSON body' }],
      });
    } else {
      res.status(500).json({ error: 'internal_error', message: 'An unexpected error occurred.' });
    }
  };
  app.use(handleError);

  return app;
}
