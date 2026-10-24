// DEVELOPMENT ADAPTER (opt-in: ?adapter=dev). Runs the core platform's own IncidentStore
// (apps/api/src/store.ts: same validation, idempotency, revision rules, visibility, deterministic
// handoff and labeled mock assistant) inside this browser tab, so the website can be exercised without
// the API process. Records live in memory only: reloading the page resets them. Audio transcription is
// not simulated; it reports unavailable.
import { ZodError, z } from 'zod';
import { MatchRequest, ReviewRequest, SharingRequest } from '@scenebrief/contracts';
import { IncidentStore, StoreError } from '../../../api/src/store';
import { PlatformError, type Incident } from './boundary';
import type { Platform } from './types';

function toPlatformError(e: unknown, endpoint: string): PlatformError {
  if (e instanceof PlatformError) return e;
  if (e instanceof ZodError) return new PlatformError('invalid', z.prettifyError(e), endpoint, 400);
  if (e instanceof StoreError) {
    const kind = e.status === 409 ? 'conflict' : e.status === 403 ? 'forbidden' : e.status === 404 ? 'not_found' : e.status === 400 ? 'invalid' : 'server';
    return new PlatformError(kind, e.message, endpoint, e.status);
  }
  return new PlatformError('server', e instanceof Error ? e.message : String(e), endpoint, 500);
}

/** One store per page load, shared by every view, like the API process would be. */
let shared: IncidentStore | null = null;

export function createDevPlatform(opts: { store?: IncidentStore } = {}): Platform {
  const store = opts.store ?? (shared ??= new IncidentStore());
  // Mutations are serialized through the store's queue, as in the API (app.ts `tx`).
  const tx = async <T,>(endpoint: string, fn: () => T | Promise<T>): Promise<T> => {
    try { return structuredClone(await store.transaction(fn)); } catch (e) { throw toPlatformError(e, endpoint); }
  };
  const read = async <T,>(endpoint: string, fn: () => T): Promise<T> => {
    try { return structuredClone(fn()); } catch (e) { throw toPlatformError(e, endpoint); }
  };
  return {
    info: { kind: 'dev', label: 'Development adapter', description: 'The platform’s record store runs in this tab only; reloading resets it. Assistant feedback is the platform’s labeled mock (fixture replay).' },
    getIncident: () => read('incident', () => store.snapshot()),
    reset: variant => tx('demo/reset', () => store.reset(variant)),
    setSharing: sharing => tx('sharing', () => store.sharing(SharingRequest.parse({ sharing }).sharing)),
    match: patientId => tx('match', () => store.match(MatchRequest.parse({ patientId, confirmed: true }).patientId)),
    addObservation: input => tx('observations', () => store.addObservation(input)),
    addMeasurement: input => tx('measurements', () => store.addMeasurement(input)),
    addCareEvent: input => tx('care-events', () => store.addCareEvent(input)),
    addTimelineEvent: input => tx('timeline-events', () => store.addTimelineEvent(input)),
    addEnvironmentReading: input => tx('environment-readings', () => store.addEnvironmentReading(input)),
    async transcribe() {
      throw new PlatformError('unavailable', 'Transcription is not available in the development adapter. Type the observation instead.', 'audio/transcriptions', 503);
    },
    // Like the API, evaluate() is called outside transaction(): capture can continue while it runs.
    async evaluate(input): Promise<Incident> {
      try { return structuredClone(await store.evaluate(input)); } catch (e) { throw toPlatformError(e, 'evaluations'); }
    },
    resolveFeedback: ({ feedbackId, ...body }) => tx(`feedback/${feedbackId}/resolutions`, () => store.resolve(feedbackId, body)),
    getHandoffDraft: () => read('handoff-draft', () => store.handoffDraft()),
    approveHandoff: input => tx('handoffs', () => { const body = ReviewRequest.parse(input); return store.review(body.revision, body.reviewedBy); }),
    assistantStatus: () => read('health', () => store.assistant.status()),
    setAssistantEnabled: async enabled => { store.assistant.enabled = enabled; return store.assistant.status(); }
  };
}
