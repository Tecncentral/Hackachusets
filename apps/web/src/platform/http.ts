// HTTP adapter for the core platform. Routes follow the shared logical boundary. Where the current
// platform does not implement a route, the adapter raises PlatformError('unavailable') — it never
// pretends a save succeeded. The only compatibility path is POST /transcripts, which the current
// platform does implement and which genuinely stores the note.
import { IncidentId } from '@scenebrief/contracts';
import { HandoffDraftSchema, PlatformError, TranscriptionSchema, type HandoffDraft, type WorkspaceIncident } from './boundary';
import { normalizeIncident } from './legacy';
import { buildDraft } from './draft';
import { patientScoped } from './scope';
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
  if (response.status === 501) throw new PlatformError('unavailable', message, endpoint, 501);
  if (response.status === 503) throw new PlatformError('unavailable', message, endpoint, 503);
  const kind = response.status === 409 ? 'conflict' : response.status === 403 ? 'forbidden' : response.status === 400 || response.status === 413 || response.status === 415 ? 'invalid' : response.status === 404 ? 'not_found' : 'server';
  if (response.status >= 500 && response.status !== 503 && message.startsWith('Request failed')) throw new PlatformError('network', 'The platform did not respond correctly. Check that the API is running.', endpoint, response.status);
  throw new PlatformError(kind, message, endpoint, response.status);
}

const post = (endpoint: string, body: unknown) => call(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const incident = async (p: Promise<unknown>) => normalizeIncident(await p);

export function createHttpPlatform(): Platform {
  return {
    info: { kind: 'http', label: 'Platform API', description: 'Connected to the local SceneBrief platform (synthetic data).' },
    getIncident: () => incident(call(base)),
    reset: () => incident(post('/api/demo/reset', {})),
    setSharing: sharing => incident(post(`${base}/sharing`, { sharing })),
    match: patientId => incident(post(`${base}/match`, { patientId, confirmed: true })),
    async addObservation(input) {
      try {
        return { incident: await incident(post(`${base}/observations`, input)), compatibility: null };
      } catch (e) {
        if (!(e instanceof PlatformError && e.kind === 'unavailable')) throw e;
        // Compatibility: the current platform stores notes through /transcripts (no category, observed time, or revision check).
        const saved = await incident(post(`${base}/transcripts`, { requestId: input.requestId, text: input.text }));
        return { incident: saved, compatibility: 'Saved through the platform’s transcript route: category and observed time were not stored, and no revision check was applied.' };
      }
    },
    addMeasurement: input => incident(post(`${base}/measurements`, input)),
    addCareEvent: input => incident(post(`${base}/care-events`, input)),
    addTimelineEvent: input => incident(post(`${base}/timeline-events`, input)),
    async transcribe(audio, requestId) {
      const form = new FormData();
      form.append('requestId', requestId);
      form.append('audio', audio, `recording.${audio.type.includes('mp4') ? 'mp4' : audio.type.includes('ogg') ? 'ogg' : 'webm'}`);
      return TranscriptionSchema.parse(await call(`${base}/audio/transcriptions`, { method: 'POST', body: form }));
    },
    evaluate: input => incident(post(`${base}/evaluations`, input)),
    resolveFeedback: ({ feedbackId, ...body }) => incident(post(`${base}/feedback/${encodeURIComponent(feedbackId)}/resolutions`, body)),
    async getHandoffDraft(current: WorkspaceIncident): Promise<HandoffDraft> {
      try { return HandoffDraftSchema.parse(await call(`${base}/handoff-draft`)); }
      catch (e) { if (e instanceof PlatformError && e.kind === 'unavailable') return buildDraft(patientScoped(current)); throw e; }
    },
    approveHandoff: input => incident(post(`${base}/handoffs`, input))
  };
}
