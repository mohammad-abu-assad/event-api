import { performance } from 'node:perf_hooks';
import type { RequestHandler } from 'express';

// Firestore uses numeric gRPC status codes. Never include raw exception text:
// it can contain request data or credentials.
export function safeErrorCategory(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
  switch (code) {
    case 4: return 'DEADLINE_EXCEEDED';
    case 7: return 'PERMISSION_DENIED';
    case 8: return 'RESOURCE_EXHAUSTED';
    case 9: return 'FAILED_PRECONDITION';
    case 14: return 'UNAVAILABLE';
    case 16: return 'UNAUTHENTICATED';
    default: return 'UNKNOWN';
  }
}

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
      ...(typeof res.locals.errorCategory === 'string' ? { errorCategory: res.locals.errorCategory } : {}),
    };
    console.log(JSON.stringify(entry));
  });
  next();
};
