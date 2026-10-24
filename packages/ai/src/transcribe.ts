// Audio transcription adapter.
//
// Contract: POST /transcribe (audio) -> { transcript, mode, warnings }.
// This NEVER saves a clinical observation; it returns text for the EMT to review
// and then submit via POST /observations.
//
// Credential handling:
//   - a live provider key is read SERVER-SIDE from an environment variable only;
//   - if no key is configured, the adapter returns mode:"unavailable" with an
//     explicit warning — it does NOT fabricate a transcript;
//   - a fixture transcript is only returned when explicitly asked for (tests/demo)
//     and is always labeled mode:"fixture".
// Text evaluation does not depend on this adapter in any way.

export type TranscriptionMode = 'live' | 'fixture' | 'unavailable';

export interface TranscriptionResult {
  transcript: string;
  mode: TranscriptionMode;
  warnings: string[];
}

export interface AudioInput {
  bytes: Uint8Array;
  mimeType: string;
}

export interface TranscriptionProvider {
  /** Name for logging/labeling, e.g. "openai-whisper". */
  readonly name: string;
  transcribe(audio: AudioInput): Promise<string>;
}

export interface TranscriptionConfig {
  /** Live provider, wired by the server when a key is present. */
  provider?: TranscriptionProvider;
  /** Canned transcript for demo/tests. Returned ONLY when no live provider is set. */
  fixtureTranscript?: string;
  timeoutMs?: number;
}

/** The env var the server reads to decide if live transcription is possible. */
export const TRANSCRIPTION_KEY_ENV = 'SCENEBRIEF_TRANSCRIBE_API_KEY';
export const TRANSCRIPTION_PROVIDER_ENV = 'SCENEBRIEF_TRANSCRIBE_PROVIDER';

function timeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('transcription timeout')), ms);
    p.then((v) => (clearTimeout(t), resolve(v)), (e) => (clearTimeout(t), reject(e)));
  });
}

export async function transcribe(
  audio: AudioInput,
  config: TranscriptionConfig = {},
): Promise<TranscriptionResult> {
  if (!audio || !(audio.bytes instanceof Uint8Array) || audio.bytes.length === 0) {
    return { transcript: '', mode: 'unavailable', warnings: ['No audio data received.'] };
  }

  if (config.provider) {
    try {
      const text = await timeout(config.provider.transcribe(audio), config.timeoutMs ?? 15000);
      if (!text || !text.trim()) {
        return {
          transcript: '',
          mode: 'unavailable',
          warnings: [`Provider ${config.provider.name} returned empty text.`],
        };
      }
      return { transcript: text.trim(), mode: 'live', warnings: [] };
    } catch (err) {
      return {
        transcript: '',
        mode: 'unavailable',
        warnings: [
          `Live transcription failed (${(err as Error).message}). Type the observation manually.`,
        ],
      };
    }
  }

  if (config.fixtureTranscript != null) {
    return {
      transcript: config.fixtureTranscript,
      mode: 'fixture',
      warnings: [
        'FIXTURE transcript — not real transcription. Set ' +
          `${TRANSCRIPTION_KEY_ENV} server-side for live audio.`,
      ],
    };
  }

  return {
    transcript: '',
    mode: 'unavailable',
    warnings: [
      'Audio transcription is not configured. Set ' +
        `${TRANSCRIPTION_KEY_ENV} (and optionally ${TRANSCRIPTION_PROVIDER_ENV}) ` +
        'server-side to enable live audio. Text entry still works.',
    ],
  };
}

/**
 * Decide transcription availability from the process environment, without
 * reading or exposing the secret value. "available" means a provider the code
 * can actually call is configured — not merely that some key exists.
 */
export function transcriptionAvailability(
  env: NodeJS.ProcessEnv = process.env,
): { available: boolean; provider: string | null; reason?: string } {
  const hasKey = typeof env[TRANSCRIPTION_KEY_ENV] === 'string' && env[TRANSCRIPTION_KEY_ENV]!.length > 0;
  if (!hasKey) return { available: false, provider: null };
  const name = (env[TRANSCRIPTION_PROVIDER_ENV] ?? 'openai').toLowerCase();
  if (!SUPPORTED_PROVIDERS.includes(name)) {
    return { available: false, provider: name, reason: `Unsupported provider "${name}". Supported: ${SUPPORTED_PROVIDERS.join(', ')}.` };
  }
  return { available: true, provider: name };
}

// ---------- Live provider: OpenAI-compatible audio transcription ----------

const SUPPORTED_PROVIDERS = ['openai'];
/** Optional overrides (not secrets). */
export const TRANSCRIPTION_MODEL_ENV = 'SCENEBRIEF_TRANSCRIBE_MODEL'; // default whisper-1
export const TRANSCRIPTION_BASE_URL_ENV = 'SCENEBRIEF_TRANSCRIBE_BASE_URL'; // default https://api.openai.com/v1

function extFor(mimeType: string): string {
  const m = mimeType.toLowerCase();
  if (m.includes('webm')) return 'webm';
  if (m.includes('ogg')) return 'ogg';
  if (m.includes('mp4') || m.includes('m4a') || m.includes('aac')) return 'm4a';
  if (m.includes('mpeg') || m.includes('mp3')) return 'mp3';
  if (m.includes('wav')) return 'wav';
  return 'webm';
}

/** OpenAI `/audio/transcriptions`. The key never leaves the server and is never logged. */
export function openAiTranscriptionProvider(opts: {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  fetch?: typeof fetch;
}): TranscriptionProvider {
  const doFetch = opts.fetch ?? fetch;
  const base = (opts.baseUrl ?? 'https://api.openai.com/v1').replace(/\/$/, '');
  return {
    name: 'openai',
    async transcribe(audio) {
      const form = new FormData();
      // Copy into a plain ArrayBuffer so Blob accepts it regardless of the source buffer type.
      const buf = audio.bytes.slice().buffer as ArrayBuffer;
      form.append('file', new Blob([buf], { type: audio.mimeType }), `audio.${extFor(audio.mimeType)}`);
      form.append('model', opts.model ?? 'whisper-1');
      form.append('response_format', 'json');
      const res = await doFetch(`${base}/audio/transcriptions`, {
        method: 'POST',
        headers: { authorization: `Bearer ${opts.apiKey}` },
        body: form,
      });
      if (!res.ok) throw new Error(`provider HTTP ${res.status}`); // no body echo: may contain request data
      const body = (await res.json()) as { text?: unknown };
      if (typeof body.text !== 'string') throw new Error('provider returned no text');
      return body.text;
    },
  };
}

/** Build the live provider from env, or undefined (→ explicit "unavailable"). */
export function providerFromEnv(env: NodeJS.ProcessEnv = process.env, fetchImpl?: typeof fetch): TranscriptionProvider | undefined {
  const a = transcriptionAvailability(env);
  if (!a.available) return undefined;
  return openAiTranscriptionProvider({
    apiKey: env[TRANSCRIPTION_KEY_ENV]!,
    model: env[TRANSCRIPTION_MODEL_ENV] || undefined,
    baseUrl: env[TRANSCRIPTION_BASE_URL_ENV] || undefined,
    fetch: fetchImpl,
  });
}
