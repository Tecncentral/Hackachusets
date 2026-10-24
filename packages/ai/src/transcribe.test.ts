import { describe, it, expect } from 'vitest';
import {
  transcribe,
  transcriptionAvailability,
  TRANSCRIPTION_KEY_ENV,
  openAiTranscriptionProvider,
  providerFromEnv,
  type TranscriptionProvider,
} from './transcribe.js';

const audio = { bytes: new Uint8Array([1, 2, 3, 4]), mimeType: 'audio/webm' };

describe('transcription adapter', () => {
  it('returns an explicit unavailable state when nothing is configured', async () => {
    const r = await transcribe(audio, {});
    expect(r.mode).toBe('unavailable');
    expect(r.transcript).toBe('');
    expect(r.warnings.join(' ')).toContain(TRANSCRIPTION_KEY_ENV);
  });

  it('labels a fixture transcript as fixture, never as real', async () => {
    const r = await transcribe(audio, { fixtureTranscript: 'Patient found down near the trail, confused.' });
    expect(r.mode).toBe('fixture');
    expect(r.transcript).toContain('confused');
    expect(r.warnings.join(' ').toLowerCase()).toContain('fixture');
  });

  it('uses a live provider when present', async () => {
    const provider: TranscriptionProvider = {
      name: 'test-stub',
      async transcribe() { return '  He stopped running and became confused.  '; },
    };
    const r = await transcribe(audio, { provider });
    expect(r.mode).toBe('live');
    expect(r.transcript).toBe('He stopped running and became confused.');
  });

  it('reports an explicit error (not a fabricated transcript) when the provider fails', async () => {
    const provider: TranscriptionProvider = {
      name: 'flaky',
      async transcribe() { throw new Error('network down'); },
    };
    const r = await transcribe(audio, { provider });
    expect(r.mode).toBe('unavailable');
    expect(r.transcript).toBe('');
    expect(r.warnings.join(' ')).toContain('network down');
  });

  it('rejects empty audio', async () => {
    const r = await transcribe({ bytes: new Uint8Array(), mimeType: 'audio/webm' }, { fixtureTranscript: 'x' });
    expect(r.mode).toBe('unavailable');
  });

  it('availability check does not expose the secret value', () => {
    const a = transcriptionAvailability({ [TRANSCRIPTION_KEY_ENV]: 'super-secret' } as NodeJS.ProcessEnv);
    expect(a.available).toBe(true);
    expect(JSON.stringify(a)).not.toContain('super-secret');
    const b = transcriptionAvailability({} as NodeJS.ProcessEnv);
    expect(b.available).toBe(false);
  });
});


describe('live provider (OpenAI-compatible)', () => {
  it('sends audio as multipart with the key in a header and returns text as live', async () => {
    let seen: { url: string; auth: string | null; hasFile: boolean } | null = null;
    const fakeFetch = (async (url: string, init: RequestInit) => {
      const form = init.body as FormData;
      seen = { url, auth: new Headers(init.headers).get('authorization'), hasFile: form.get('file') instanceof Blob };
      return new Response(JSON.stringify({ text: 'Found him confused by the trail.' }), { status: 200 });
    }) as unknown as typeof fetch;
    const provider = providerFromEnv({ [TRANSCRIPTION_KEY_ENV]: 'k-test' } as NodeJS.ProcessEnv, fakeFetch)!;
    const r = await transcribe(audio, { provider });
    expect(r).toEqual({ transcript: 'Found him confused by the trail.', mode: 'live', warnings: [] });
    expect(seen!.url).toBe('https://api.openai.com/v1/audio/transcriptions');
    expect(seen!.auth).toBe('Bearer k-test');
    expect(seen!.hasFile).toBe(true);
  });

  it('provider HTTP error -> unavailable with no secret in the warning', async () => {
    const fakeFetch = (async () => new Response('bad key k-test', { status: 401 })) as unknown as typeof fetch;
    const provider = openAiTranscriptionProvider({ apiKey: 'k-test', fetch: fakeFetch });
    const r = await transcribe(audio, { provider });
    expect(r.mode).toBe('unavailable');
    expect(r.warnings.join(' ')).toContain('401');
    expect(r.warnings.join(' ')).not.toContain('k-test');
  });

  it('unsupported provider name is reported, not silently treated as available', () => {
    const a = transcriptionAvailability({ [TRANSCRIPTION_KEY_ENV]: 'x', SCENEBRIEF_TRANSCRIBE_PROVIDER: 'acme' } as NodeJS.ProcessEnv);
    expect(a.available).toBe(false);
    expect(a.reason).toMatch(/Unsupported/);
    expect(providerFromEnv({ [TRANSCRIPTION_KEY_ENV]: 'x', SCENEBRIEF_TRANSCRIBE_PROVIDER: 'acme' } as NodeJS.ProcessEnv)).toBeUndefined();
  });
});
