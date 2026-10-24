import { afterAll, beforeAll, expect, it } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from './app.js';
import { DemoInitial, DemoClarification, IncidentSchema } from '@scenebrief/contracts';
let server: Server, base: string;
beforeAll(async () => { await new Promise<void>((resolve, reject) => { server = createApp().listen(0, '127.0.0.1', error => error ? reject(error) : resolve()); }); base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`; });
afterAll(async () => { await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())); });
async function post(path: string, body: unknown) { return fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
it('runs patient-to-paramedic-to-ER flow over HTTP', async () => {
 const route = '/incidents/runner-found-down';
 expect((await post(`${route}/transcripts`, { requestId: 'blocked', text: DemoInitial })).status).toBe(403);
 expect((await post(`${route}/sharing`, { sharing: true })).status).toBe(200);
 expect((await post(`${route}/match`, { patientId: 'patient-demo-01', confirmed: true })).status).toBe(200);
 expect((await post(`${route}/transcripts`, { requestId: 'one', text: DemoInitial })).status).toBe(200);
 const incident = IncidentSchema.parse(await (await post(`${route}/transcripts`, { requestId: 'two', text: DemoClarification })).json());
 const shared = IncidentSchema.parse(await (await post(`${route}/handoffs`, { revision: incident.revision, reviewedBy: 'test crew' })).json());
 expect(shared.handoffs[0].text).toContain('collapseTime: Unknown');
 const received = IncidentSchema.parse(await (await fetch(`${base}${route}`)).json()); expect(received.handoffs).toEqual(shared.handoffs);
 expect((await post(`${route}/transcripts`, { text: '' })).status).toBe(400);
 expect((await post('/incidents/not-real/sharing', { sharing: true })).status).toBe(404);
});
