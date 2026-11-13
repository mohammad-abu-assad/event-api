import type { ZodError } from 'zod';

export function validationError(error: ZodError) {
  return {
    error: 'invalid_request',
    message: 'Request validation failed.',
    issues: error.issues.map((issue) => ({
      path: issue.path.map(String).join('.'),
      message: issue.message,
    })),
  };
}
