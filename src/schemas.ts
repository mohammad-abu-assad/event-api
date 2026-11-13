import { z } from 'zod';

const propertyValue = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export const eventSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().min(1).max(100),
  timestamp: z.iso.datetime({ offset: true }),
  props: z.record(z.string(), propertyValue)
    .refine((props) => Object.keys(props).length <= 20, 'Must contain at most 20 properties')
    .optional(),
});

export const batchSchema = z.object({
  events: z.array(eventSchema).min(1).max(100),
});

export const statsQuerySchema = z.object({
  from: z.iso.date(),
  to: z.iso.date(),
}).superRefine(({ from, to }, ctx) => {
  const first = Date.parse(`${from}T00:00:00Z`);
  const last = Date.parse(`${to}T00:00:00Z`);
  if (last < first) {
    ctx.addIssue({ code: 'custom', path: ['to'], message: 'Must not be before from' });
  } else if (last - first > 30 * 24 * 60 * 60 * 1000) {
    ctx.addIssue({ code: 'custom', path: ['to'], message: 'Range must not exceed 31 days, inclusive' });
  }
});

export type EventInput = z.infer<typeof eventSchema>;
