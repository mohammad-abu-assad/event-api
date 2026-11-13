import { createApp } from './app.js';
import { FirestoreEventStore } from './store/firestore.js';
import { MemoryEventStore } from './store/memory.js';

const port = Number(process.env.PORT ?? 8080);
const store = process.env.STORE ?? 'memory';

if (store !== 'memory' && store !== 'firestore') {
  console.log(JSON.stringify({ severity: 'ERROR', message: 'STORE must be memory or firestore' }));
  process.exit(1);
}

const eventStore = store === 'firestore' ? new FirestoreEventStore() : new MemoryEventStore();

createApp({ store: eventStore }).listen(port, () => {
  console.log(JSON.stringify({ severity: 'INFO', message: `Event API listening on port ${port}` }));
});
