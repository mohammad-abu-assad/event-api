import type { EventInput } from '../schemas.js';

export interface EventStat {
  date: string;
  name: string;
  count: number;
}

export interface EventStore {
  save(clientId: string, events: EventInput[]): Promise<void>;
  getStats(clientId: string, from: string, to: string): Promise<EventStat[]>;
}
