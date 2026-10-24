import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createAssistantApp } from './app.js';
import { evaluateRequestSweating } from '@scenebrief/ai';

let server: Server;
let base: string;

beforeAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server = createAssistantApp().listen(0, '127.0.0.1', (e?: Error) => (e ? reject(e) : resolve()));
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
});

describe('assistant service HTTP', () => {
  it('GET /health reports mode and transcription availability', async () => {
    const r = await fetch(`${base}/health`);
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.ok).toBe(true);
    expect(body.transcription).toHaveProperty('available');
  });

  it('POST /evaluate flags the sweating inference and echoes the revision', async () => {
    const r = await fetch(`${base}/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(evaluateRequestSweating),
    });
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.revision).toBe(evaluateRequestSweating.revision);
    expect(body.feedback.some((f: { spokenSummary: string }) => f.spokenSummary.toLowerCase().includes('sweating'))).toBe(true);
  });

  it('POST /evaluate rejects an invalid payload with 400', async () => {
    const r = await fetch(`${base}/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ revision: -1 }),
    });
    expect(r.status).toBe(400);
  });

  it('POST /transcribe returns an explicit unavailable state (no provider wired)', async () => {
    const r = await fetch(`${base}/transcribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'audio/webm' },
      body: new Uint8Array([1, 2, 3, 4]),
    });
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.mode).toBe('unavailable');
    expect(body.transcript).toBe('');
  });
});
