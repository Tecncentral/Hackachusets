// HTTP adapter for the core platform (docs/core-api-contract.md). Every response is validated against
// the canonical schemas. Routes the platform does not implement raise PlatformError('unavailable') —
// the adapter never pretends a save succeeded and has no compatibility fallbacks.
import type { z } from 'zod';
import { IncidentId, IncidentSchema, HandoffDraftSchema } from '@scenebrief/contracts';
import { AssistantStatusSchema, PlatformError, TranscriptionSchema, type Incident } from './boundary';
import type { Platform } from './types';

const base = `/api/incidents/${IncidentId}`;

async function call(endpoint: string, init?: RequestInit): Promise<unknown> {
  let response: Response;
  try { response = await fetch(endpoint, init); } catch { throw new PlatformError('network', 'Cannot reach the platform. Check that the API is running.', endpoint); }
  let data: any = null;
  try { data = await response.json(); } catch { /* non-JSON body */ }
  if (response.ok) return data;
  const message = typeof data?.error === 'string' ? data.error : `Request failed (${response.status})`;
  if (response.status === 404 && (message === 'Unknown endpoint' || data === null)) throw new PlatformError('unavailable', `Not available on this platform yet (${endpoint.replace(base, '…')}).`, endpoint, 404);
  if (response.status === 501 || response.status === 503) throw new PlatformError('unavailable', message, endpoint, response.status);
  if (response.status >= 500 && message.startsWith('Request failed')) throw new PlatformError('network', 'The platform did not respond correctly. Check that the API is running.', endpoint, response.status);
  const kind = response.status === 409 ? 'conflict' : response.status === 403 ? 'forbidden' : response.status === 400 || response.status === 413 || response.status === 415 ? 'invalid' : response.status === 404 ? 'not_found' : 'server';
  throw new PlatformError(kind, message, endpoint, response.status);
}

const post = (endpoint: string, body: unknown) => call(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

/** A response that does not match the canonical contract is a platform error, not data to display. */
function parse<T>(schema: z.ZodType<T>, endpoint: string, value: unknown): T {
  const r = schema.safeParse(value);
  if (r.success) return r.data;
  const first = r.error.issues[0];
  throw new PlatformError('server', `The platform response did not match the shared contract (${first ? `${first.path.join('.')}: ${first.message}` : 'invalid'}).`, endpoint);
}
const incident = async (endpoint: string, p: Promise<unknown>): Promise<Incident> => parse(IncidentSchema, endpoint, await p);
const send = (path: string, body: unknown) => incident(`${base}${path}`, post(`${base}${path}`, body));

export function createHttpPlatform(): Platform {
  return {
    info: { kind: 'http', label: 'Platform API', description: 'Connected to the local SceneBrief platform (synthetic data).' },
    getIncident: () => incident(base, call(base)),
    reset: variant => incident('/api/demo/reset', post('/api/demo/reset', variant ? { variant } : {})),
    setSharing: sharing => send('/sharing', { sharing }),
    match: patientId => send('/match', { patientId, confirmed: true }),
    addObservation: input => send('/observations', input),
    addMeasurement: input => send('/measurements', input),
    addCareEvent: input => send('/care-events', input),
    addTimelineEvent: input => send('/timeline-events', input),
    addEnvironmentReading: input => send('/environment-readings', input),
    async transcribe(audio, requestId) {
      const form = new FormData();
      form.append('requestId', requestId);
      form.append('audio', audio, `recording.${audio.type.includes('mp4') ? 'mp4' : audio.type.includes('ogg') ? 'ogg' : 'webm'}`);
      const endpoint = `${base}/audio/transcriptions`;
      return parse(TranscriptionSchema, endpoint, await call(endpoint, { method: 'POST', body: form }));
    },
    evaluate: input => send('/evaluations', input),
    resolveFeedback: ({ feedbackId, ...body }) => send(`/feedback/${encodeURIComponent(feedbackId)}/resolutions`, body),
    async getHandoffDraft() { const endpoint = `${base}/handoff-draft`; return parse(HandoffDraftSchema, endpoint, await call(endpoint)); },
    approveHandoff: input => send('/handoffs', input),
    async assistantStatus() {
      const health = await call('/api/health') as { assistant?: unknown } | null;
      return parse(AssistantStatusSchema, '/api/health', health?.assistant);
    },
    async setAssistantEnabled(enabled) { return parse(AssistantStatusSchema, '/api/demo/assistant', await post('/api/demo/assistant', { enabled })); }
  };
}
