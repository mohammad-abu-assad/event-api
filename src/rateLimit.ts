import type { RequestHandler } from 'express';

export function createRateLimiter(): RequestHandler {
  const windows = new Map<string, { count: number; resetAt: number }>();
  return (_req, res, next) => {
    const clientId = res.locals.clientId as string;
    const now = Date.now();
    let window = windows.get(clientId);
    if (!window || now >= window.resetAt) {
      window = { count: 0, resetAt: now + 60_000 };
      windows.set(clientId, window);
    }
    const limit = clientId === 'sdk-public-demo' ? 10 : 60;
    if (window.count >= limit) {
      res.set('Retry-After', String(Math.max(1, Math.ceil((window.resetAt - now) / 1000))));
      res.status(429).json({ error: 'rate_limited', message: 'Too many requests; try again later.' });
      return;
    }
    window.count++;
    next();
  };
}
