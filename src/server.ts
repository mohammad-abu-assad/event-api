import { createApp } from './app.js';
import { FirestoreEventStore } from './store/firestore.js';
import { MemoryEventStore } from './store/memory.js';

const port = Number(process.env.PORT ?? 8080);
const store = process.env.STORE ?? 'memory';

if (store !== 'memory' && store !== 'firestore') {
  throw new Error('STORE must be memory or firestore');
}

const eventStore = store === 'firestore' ? new FirestoreEventStore() : new MemoryEventStore();

createApp({ store: eventStore }).listen(port, () => {
  console.log(`Event API listening on port ${port}`);
});
