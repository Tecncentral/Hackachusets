import { createApp } from './app.js';
import { IncidentStore } from './store.js';
import { assistantFromEnv } from './assistant.js';

const port = Number(process.env.SCENEBRIEF_API_PORT ?? 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('SCENEBRIEF_API_PORT must be a valid port number.');
const store = new IncidentStore({ assistant: assistantFromEnv(process.env) });
createApp(store).listen(port, '127.0.0.1', () => {
  const a = store.assistant.status();
  console.log(`SceneBrief synthetic API: http://127.0.0.1:${port} · assistant: ${a.configuredMode}${a.baseUrl ? ` (${a.baseUrl})` : ''}`);
});
