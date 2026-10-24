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
 * reading or exposing the secret value. The server uses this to wire a provider.
 */
export function transcriptionAvailability(
  env: NodeJS.ProcessEnv = process.env,
): { available: boolean; provider: string | null } {
  const hasKey = typeof env[TRANSCRIPTION_KEY_ENV] === 'string' && env[TRANSCRIPTION_KEY_ENV]!.length > 0;
  return { available: hasKey, provider: hasKey ? env[TRANSCRIPTION_PROVIDER_ENV] ?? 'unspecified' : null };
}
