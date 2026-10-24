// Behaviour tests for the HTTP adapter (http.ts). fetch is stubbed per-test so we can assert how the
// adapter maps platform responses to PlatformError kinds, falls back to compatibility routes when an
// endpoint is unavailable, and shapes its requests (JSON vs multipart). No real network is used.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHttpPlatform } from './http';
import { PlatformError } from './boundary';
import { createDemoIncident } from '@scenebrief/fixtures';

const BASE = '/api/incidents/runner-found-down';
// A legacy-shaped incident (no observations collection) so normalizeIncident runs.
const demoIncident = JSON.parse(JSON.stringify(createDemoIncident()));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('http adapter — error mapping', () => {
  it('maps a 404 {error:"Unknown endpoint"} to PlatformError kind "unavailable"', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: 'Unknown endpoint' }, 404)));
    const platform = createHttpPlatform();
    await expect(platform.addMeasurement({
      requestId: 'm1', baseRevision: 0, kind: 'temperature', status: 'obtained', value: 41, value2: null,
      unit: '°C', method: 'rectal', eventTime: null, coolingPhase: 'before', sourceKind: 'manual',
      device: null, recordedBy: 'crew', note: null
    })).rejects.toMatchObject({ kind: 'unavailable' });
  });

  it('maps a 409 to PlatformError kind "conflict"', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: 'Incident changed.' }, 409)));
    const platform = createHttpPlatform();
    await expect(platform.addMeasurement({
      requestId: 'm1', baseRevision: 0, kind: 'temperature', status: 'obtained', value: 41, value2: null,
      unit: '°C', method: 'rectal', eventTime: null, coolingPhase: 'before', sourceKind: 'manual',
      device: null, recordedBy: 'crew', note: null
    })).rejects.toMatchObject({ kind: 'conflict' });
  });

  it('maps a fetch rejection to PlatformError kind "network"', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    const platform = createHttpPlatform();
    await expect(platform.getIncident()).rejects.toMatchObject({ kind: 'network' });
  });
});

describe('http adapter — addObservation compatibility fallback', () => {
  it('falls back to POST /transcripts with only {requestId,text} and returns a compatibility message', async () => {
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      if (u === `${BASE}/observations`) return jsonResponse({ error: 'Unknown endpoint' }, 404);
      if (u === `${BASE}/transcripts`) {
        const body = JSON.parse(String(init?.body));
        // Only the compatibility fields are sent.
        expect(Object.keys(body).sort()).toEqual(['requestId', 'text']);
        return jsonResponse(demoIncident, 200);
      }
      throw new Error(`unexpected url ${u}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const platform = createHttpPlatform();
    const result = await platform.addObservation({
      requestId: 'obs-1', baseRevision: 0, text: 'Patient is confused.', observedAt: null,
      category: 'mental_status', inputMode: 'typed'
    });
    expect(result.compatibility).toBeTruthy();
    expect(result.incident.id).toBe('runner-found-down');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('http adapter — getHandoffDraft fallback', () => {
  it('falls back to buildDraft with mode "website-grouped" when the endpoint is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: 'Unknown endpoint' }, 404)));
    const platform = createHttpPlatform();
    // normalizeIncident gives a WorkspaceIncident shape to hand buildDraft.
    const incident = await (async () => {
      vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(demoIncident, 200)));
      const got = await platform.getIncident();
      vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: 'Unknown endpoint' }, 404)));
      return got;
    })();
    const draft = await platform.getHandoffDraft(incident);
    expect(draft.mode).toBe('website-grouped');
    expect(draft.revision).toBe(incident.revision);
  });
});

describe('http adapter — transcribe', () => {
  it('posts a multipart FormData body carrying "audio" and "requestId"', async () => {
    let captured: FormData | null = null;
    vi.stubGlobal('fetch', vi.fn(async (_url: string | URL, init?: RequestInit) => {
      captured = init?.body as FormData;
      return jsonResponse({ transcript: 'reviewed text', mode: 'demo', warnings: [] }, 200);
    }));
    const platform = createHttpPlatform();
    const blob = new Blob(['audio-bytes'], { type: 'audio/webm' });
    const result = await platform.transcribe(blob, 'req-audio');
    expect(result.transcript).toBe('reviewed text');
    expect(captured).toBeInstanceOf(FormData);
    expect(captured!.get('requestId')).toBe('req-audio');
    const audio = captured!.get('audio');
    expect(audio).toBeInstanceOf(Blob);
  });
});
