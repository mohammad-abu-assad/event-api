import type { Firestore } from '@google-cloud/firestore';
import { describe, expect, it, vi } from 'vitest';
import { FirestoreEventStore } from '../src/store/firestore.js';

function fakeFirestore() {
  const doc = vi.fn((id?: string) => ({ id: id ?? 'generated-id' }));
  const set = vi.fn();
  const commit = vi.fn().mockResolvedValue([]);
  const get = vi.fn().mockResolvedValue({
    docs: [
      { data: () => ({ date: '2026-01-10', name: 'button_clicked' }) },
      { data: () => ({ date: '2026-01-09', name: 'app_opened' }) },
      { data: () => ({ date: '2026-01-10', name: 'button_clicked' }) },
    ],
  });
  const query = { where: vi.fn(), get };
  query.where.mockReturnValue(query);
  const collection = vi.fn().mockReturnValue({ doc, where: query.where });
  const database = {
    collection,
    batch: () => ({ set, commit }),
  } as unknown as Firestore;
  return { database, collection, doc, set, commit, query };
}

describe('Firestore event store', () => {
  it('writes client-owned events in a batch with UTC dates', async () => {
    const fake = fakeFirestore();
    const store = new FirestoreEventStore(fake.database);
    await store.save('client-a', [{
      name: 'button_clicked',
      timestamp: '2026-01-10T00:30:00+02:00',
    }]);
    expect(fake.collection).toHaveBeenCalledWith('events');
    expect(fake.set).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        clientId: 'client-a',
        name: 'button_clicked',
        timestamp: '2026-01-10T00:30:00+02:00',
        date: '2026-01-09',
        props: {},
        receivedAt: expect.anything(),
      }),
    );
    expect(fake.commit).toHaveBeenCalledOnce();
  });

  it('queries one client and date range, then aggregates and sorts counts', async () => {
    const fake = fakeFirestore();
    const store = new FirestoreEventStore(fake.database);
    const stats = await store.getStats('client-a', '2026-01-01', '2026-01-31');
    expect(fake.query.where).toHaveBeenCalledWith('clientId', '==', 'client-a');
    expect(fake.query.where).toHaveBeenCalledWith('date', '>=', '2026-01-01');
    expect(fake.query.where).toHaveBeenCalledWith('date', '<=', '2026-01-31');
    expect(stats).toEqual([
      { date: '2026-01-09', name: 'app_opened', count: 1 },
      { date: '2026-01-10', name: 'button_clicked', count: 2 },
    ]);
  });

  it('uses stable, client-scoped document IDs for supplied event IDs', async () => {
    const fake = fakeFirestore();
    const store = new FirestoreEventStore(fake.database);
    const event = { id: '123e4567-e89b-42d3-a456-426614174000', name: 'tap', timestamp: '2026-01-10T12:00:00Z' };
    await store.save('client-a', [event, event]);
    await store.save('client-b', [event]);
    const ids = fake.doc.mock.calls.map(([id]) => id);
    expect(ids[0]).toBe(ids[1]);
    expect(ids[0]).not.toBe(ids[2]);
    expect(fake.set).toHaveBeenCalledTimes(2);
  });
});
