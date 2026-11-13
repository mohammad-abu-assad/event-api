import { performance } from 'node:perf_hooks';
import type { RequestHandler } from 'express';

export const requestLogger: RequestHandler = (req, res, next) => {
  const started = performance.now();
  const path = req.path;

  res.once('finish', () => {
    const status = res.statusCode;
    const severity = status >= 500 ? 'ERROR' : status >= 400 ? 'WARNING' : 'INFO';
    const entry = {
      severity,
      message: status >= 500 ? 'Unexpected request error' : 'Request completed',
      method: req.method,
      path,
      status,
      durationMs: Math.round(performance.now() - started),
      clientId: typeof res.locals.clientId === 'string' ? res.locals.clientId : null,
      ...(typeof res.locals.eventCount === 'number' ? { eventCount: res.locals.eventCount } : {}),
    };
    console.log(JSON.stringify(entry));
  });
  next();
};
