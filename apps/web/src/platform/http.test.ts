// Behaviour tests for the HTTP adapter (http.ts). fetch is stubbed per test (responses come from the
// platform's own fixture) so we can assert error mapping, contract validation and request shapes.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createIncidentFixture } from '@scenebrief/fixtures';
import { IncidentStore } from '../../../api/src/store';
import { createHttpPlatform } from './http';

const BASE = '/api/incidents/runner-found-down';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const measurement = { requestId: 'm1', baseRevision: 0, kind: 'body_temperature' as const, value: 41, unit: '°C' as const, site: 'rectal' as const, measuredAt: null, coolingPhase: 'before_cooling' as const };

afterEach(() => { vi.unstubAllGlobals(); });

describe('http adapter — error mapping', () => {
  it('maps a 404 {error:"Unknown endpoint"} to "unavailable"', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'Unknown endpoint' }, 404)));
    await expect(createHttpPlatform().addMeasurement(measurement)).rejects.toMatchObject({ kind: 'unavailable' });
  });

  it('maps 409 to "conflict" and 400 to "invalid" with the platform message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'Incident changed.' }, 409)));
    await expect(createHttpPlatform().addMeasurement(measurement)).rejects.toMatchObject({ kind: 'conflict', message: 'Incident changed.' });
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: '✖ Value 104 °C is outside the plausible range' }, 400)));
    await expect(createHttpPlatform().addMeasurement(measurement)).rejects.toMatchObject({ kind: 'invalid' });
  });

  it('maps a fetch rejection to "network"', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    await expect(createHttpPlatform().getIncident()).rejects.toMatchObject({ kind: 'network' });
  });

  it('rejects a response that does not match the canonical Incident schema', async () => {
    const legacy = { ...createIncidentFixture(), observations: undefined };
    vi.stubGlobal('fetch', vi.fn(async () => json(legacy)));
    await expect(createHttpPlatform().getIncident()).rejects.toMatchObject({ kind: 'server', message: expect.stringMatching(/shared contract/) });
  });
});

describe('http adapter — routes', () => {
  it('posts the canonical body to each capture route and validates the returned incident', async () => {
    const fixture = createIncidentFixture();
    const calls: Array<[string, unknown]> = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => { calls.push([url, init?.body ? JSON.parse(String(init.body)) : null]); return json(fixture); }));
    const p = createHttpPlatform();
    await p.addMeasurement(measurement);
    await p.addEnvironmentReading({ requestId: 'e', baseRevision: 0, kind: 'ambient_temperature', value: 88, unit: '°F', measuredAt: null });
    await p.resolveFeedback({ feedbackId: 'fb 1', requestId: 'r', baseRevision: 0, action: 'defer' });
    await p.approveHandoff({ revision: 0, reviewedBy: 'Crew (demo)' });
    expect(calls.map(c => c[0])).toEqual([`${BASE}/measurements`, `${BASE}/environment-readings`, `${BASE}/feedback/fb%201/resolutions`, `${BASE}/handoffs`]);
    expect(calls[0][1]).toEqual(measurement);
    expect(calls[2][1]).toEqual({ requestId: 'r', baseRevision: 0, action: 'defer' });
  });

  it('reads the handoff draft from the platform and validates it', async () => {
    const draft = new IncidentStore().handoffDraft();
    vi.stubGlobal('fetch', vi.fn(async () => json(draft)));
    expect((await createHttpPlatform().getHandoffDraft()).sections.map(s => s.id)).toEqual(draft.sections.map(s => s.id));
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'Unknown endpoint' }, 404)));
    await expect(createHttpPlatform().getHandoffDraft()).rejects.toMatchObject({ kind: 'unavailable' });
  });

  it('reads and sets assistant availability through the demo routes', async () => {
    const status = { configuredMode: 'mock', enabled: false, effectiveMode: 'unavailable', baseUrl: null };
    const fetchMock = vi.fn(async (url: string) => json(url === '/api/health' ? { ok: true, mode: 'synthetic-demo', assistant: status } : status));
    vi.stubGlobal('fetch', fetchMock);
    const p = createHttpPlatform();
    expect(await p.assistantStatus()).toEqual(status);
    expect(await p.setAssistantEnabled(false)).toEqual(status);
    expect(fetchMock).toHaveBeenLastCalledWith('/api/demo/assistant', expect.objectContaining({ method: 'POST', body: '{"enabled":false}' }));
  });

  it('transcribe posts multipart audio + requestId, and reports the missing route as unavailable', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => json({ error: 'Unknown endpoint' }, 404));
    vi.stubGlobal('fetch', fetchMock);
    await expect(createHttpPlatform().transcribe(new Blob(['x'], { type: 'audio/webm' }), 'a1')).rejects.toMatchObject({ kind: 'unavailable' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/audio/transcriptions`);
    const form = init!.body as FormData;
    expect(form.get('requestId')).toBe('a1');
    expect(form.get('audio')).toBeInstanceOf(Blob);
  });
});
