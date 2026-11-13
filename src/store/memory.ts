import { randomUUID } from 'node:crypto';
import type { EventInput } from '../schemas.js';
import type { EventStat, EventStore } from './types.js';

interface StoredEvent extends EventInput {
  date: string;
  receivedAt: string;
}

export class MemoryEventStore implements EventStore {
  private readonly events = new Map<string, Map<string, StoredEvent>>();

  async save(clientId: string, events: EventInput[]): Promise<void> {
    let clientEvents = this.events.get(clientId);
    if (!clientEvents) {
      clientEvents = new Map();
      this.events.set(clientId, clientEvents);
    }
    const receivedAt = new Date().toISOString();
    for (const event of events) {
      clientEvents.set(event.id ?? randomUUID(), {
        ...event,
        props: event.props ? { ...event.props } : undefined,
        date: new Date(event.timestamp).toISOString().slice(0, 10),
        receivedAt,
      });
    }
  }

  async getStats(clientId: string, from: string, to: string): Promise<EventStat[]> {
    const counts = new Map<string, Map<string, number>>();
    for (const event of this.events.get(clientId)?.values() ?? []) {
      if (event.date < from || event.date > to) continue;
      let names = counts.get(event.date);
      if (!names) {
        names = new Map();
        counts.set(event.date, names);
      }
      names.set(event.name, (names.get(event.name) ?? 0) + 1);
    }
    const stats: EventStat[] = [];
    for (const [date, names] of counts) {
      for (const [name, count] of names) stats.push({ date, name, count });
    }
    return stats.sort((a, b) =>
      a.date < b.date ? -1 : a.date > b.date ? 1 : a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
    );
  }
}
