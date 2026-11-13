import { createApp } from './app.js';

const port = Number(process.env.PORT ?? 8080);
const store = process.env.STORE ?? 'memory';

if (store !== 'memory') {
  throw new Error('Only STORE=memory is supported until the Firestore store is implemented');
}

createApp().listen(port, () => {
  console.log(`Event API listening on port ${port}`);
});
