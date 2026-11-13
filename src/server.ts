import { createApp } from './app.js';

const port = Number(process.env.PORT ?? 8080);

createApp().listen(port, () => {
  console.log(`Event API listening on port ${port}`);
});
