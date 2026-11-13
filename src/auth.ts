import type { RequestHandler } from 'express';

export function readApiKeys(value: string | undefined): Record<string, string> {
  if (!value) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('API_KEYS must be a JSON object mapping client IDs to keys');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('API_KEYS must be a JSON object mapping client IDs to keys');
  }
  const entries = Object.entries(parsed);
  if (entries.some(([id, key]) => !id || typeof key !== 'string' || key.length === 0)) {
    throw new Error('API_KEYS must contain non-empty client IDs and keys');
  }
  const keys = entries.map(([, key]) => key);
  if (new Set(keys).size !== keys.length) throw new Error('API_KEYS must not contain duplicate keys');
  return Object.fromEntries(entries) as Record<string, string>;
}

export function authenticate(apiKeys: Record<string, string>): RequestHandler {
  const clientsByKey = new Map(Object.entries(apiKeys).map(([client, key]) => [key, client]));
  return (req, res, next) => {
    const key = req.get('x-api-key');
    const clientId = key ? clientsByKey.get(key) : undefined;
    if (!clientId) {
      res.status(401).json({ error: 'unauthorized', message: 'A valid API key is required.' });
      return;
    }
    res.locals.clientId = clientId;
    next();
  };
}
