import { Router } from 'express';
import { batchSchema } from '../schemas.js';
import type { EventStore } from '../store/types.js';
import { validationError } from '../validation.js';

export function eventsRouter(store: EventStore): Router {
  const router = Router();
  router.post('/events', async (req, res) => {
    const result = batchSchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json(validationError(result.error));
      return;
    }
    res.locals.eventCount = result.data.events.length;
    await store.save(res.locals.clientId as string, result.data.events);
    res.status(201).json({ accepted: result.data.events.length });
  });
  return router;
}
