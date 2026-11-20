import type { RequestHandler } from 'express';

const hostedOrigins = new Set([
  'https://activity-tracker-514608.web.app',
  'https://activity-tracker-514608.firebaseapp.com',
]);

function allowedOrigin(origin: string): boolean {
  if (hostedOrigins.has(origin)) return true;
  try {
    const url = new URL(origin);
    return url.protocol === 'http:' && url.hostname === 'localhost' && url.origin === origin;
  } catch {
    return false;
  }
}

export const cors: RequestHandler = (req, res, next) => {
  res.vary('Origin');
  const origin = req.get('Origin');
  if (origin && allowedOrigin(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Access-Control-Expose-Headers', 'Retry-After');
    if (req.method === 'OPTIONS') {
      res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
      res.set('Access-Control-Max-Age', '600');
      res.status(204).end();
      return;
    }
  }
  if (req.method === 'OPTIONS' && origin) {
    res.status(403).json({ error: 'forbidden', message: 'Origin is not allowed.' });
    return;
  }
  next();
};
