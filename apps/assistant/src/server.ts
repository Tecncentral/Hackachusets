import { createAssistantApp } from './app.js';

// Distinct port from api (3001) and web (5173) so all can run on one machine.
const PORT = Number(process.env.ASSISTANT_PORT ?? 3002);
const HOST = '127.0.0.1';

createAssistantApp().listen(PORT, HOST, () => {
  console.log(`[assistant] listening on http://${HOST}:${PORT} (synthetic-demo)`);
});
