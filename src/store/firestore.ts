import { createHash } from 'node:crypto';
import { FieldValue, Firestore, type DocumentReference } from '@google-cloud/firestore';
import type { EventInput } from '../schemas.js';
import type { EventStat, EventStore } from './types.js';

function eventDocumentId(clientId: string, eventId: string): string {
  return createHash('sha256').update(JSON.stringify([clientId, eventId])).digest('hex');
}

export class FirestoreEventStore implements EventStore {
  constructor(private readonly firestore = new Firestore()) {}

  async save(clientId: string, events: EventInput[]): Promise<void> {
    const collection = this.firestore.collection('events');
    const documents = new Map<string, { ref: DocumentReference; event: EventInput }>();
    for (const event of events) {
      const ref = event.id
        ? collection.doc(eventDocumentId(clientId, event.id))
        : collection.doc();
      documents.set(ref.id, { ref, event });
    }
    const batch = this.firestore.batch();
    for (const { ref, event } of documents.values()) {
      batch.set(ref, {
        clientId,
        name: event.name,
        timestamp: event.timestamp,
        date: new Date(event.timestamp).toISOString().slice(0, 10),
        props: event.props ?? {},
        receivedAt: FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
  }

  async getStats(clientId: string, from: string, to: string): Promise<EventStat[]> {
    const snapshot = await this.firestore.collection('events')
      .where('clientId', '==', clientId)
      .where('date', '>=', from)
      .where('date', '<=', to)
      .get();
    const counts = new Map<string, Map<string, number>>();
    for (const doc of snapshot.docs) {
      const { date, name } = doc.data();
      let names = counts.get(date);
      if (!names) {
        names = new Map();
        counts.set(date, names);
      }
      names.set(name, (names.get(name) ?? 0) + 1);
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
