import { Router } from 'express';
import { statsQuerySchema } from '../schemas.js';
import type { EventStore } from '../store/types.js';
import { validationError } from '../validation.js';

export function statsRouter(store: EventStore): Router {
  const router = Router();
  router.get('/stats', async (req, res) => {
    const result = statsQuerySchema.safeParse(req.query);
    if (!result.success) {
      res.status(400).json(validationError(result.error));
      return;
    }
    const { from, to } = result.data;
    const stats = await store.getStats(res.locals.clientId as string, from, to);
    res.json({ from, to, stats });
  });
  return router;
}
