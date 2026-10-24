// DEVELOPMENT ADAPTER (opt-in: ?adapter=dev). Implements the same Platform interface in the
// browser so endpoints the platform has not shipped yet (measurements, care events, evaluations,
// resolutions, handoff draft) can be exercised. It is seeded from the platform's own synthetic
// fixture via GET /api/incidents/:id; records then live in this browser's localStorage only and are
// shown as such on every screen. Audio transcription is NOT simulated: it reports unavailable.
import { PlatformError, WorkspaceIncidentSchema, type Feedback, type Mutation, type WorkspaceIncident, type WorkspaceSource } from './boundary';
import { createHttpPlatform } from './http';
import { devEvaluate, DEV_REFERENCES } from './devAssistant';
import { buildDraft, draftText } from './draft';
import type { Platform } from './types';

const KEY = 'scenebrief.dev-adapter.v1';
const ASSISTANT_KEY = 'scenebrief.dev-adapter.assistant';

interface Stored { incident: WorkspaceIncident; requests: Record<string, string> }

export interface DevStorage { get(key: string): string | null; set(key: string, value: string): void; remove(key: string): void }
const browserStorage: DevStorage = { get: k => localStorage.getItem(k), set: (k, v) => localStorage.setItem(k, v), remove: k => localStorage.removeItem(k) };

export function devAssistantEnabled(storage: DevStorage = browserStorage) { return storage.get(ASSISTANT_KEY) !== 'off'; }
export function setDevAssistantEnabled(on: boolean, storage: DevStorage = browserStorage) { storage.set(ASSISTANT_KEY, on ? 'on' : 'off'); }

export function createDevPlatform(opts: { storage?: DevStorage; seed?: () => Promise<WorkspaceIncident>; now?: () => string; evaluationDelayMs?: number; uuid?: () => string } = {}): Platform {
  const storage = opts.storage ?? browserStorage;
  const http = createHttpPlatform();
  const seed = opts.seed ?? (() => http.getIncident());
  const now = opts.now ?? (() => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'));
  const uuid = opts.uuid ?? (() => crypto.randomUUID());
  const delay = opts.evaluationDelayMs ?? 700;
  let queue: Promise<unknown> = Promise.resolve();

  const fresh = (incident: WorkspaceIncident): WorkspaceIncident => ({
    ...incident, revision: 0, sources: incident.sources.filter(s => s.type !== 'voice'), claims: incident.claims.filter(c => c.field !== 'account' && c.status === 'unknown'),
    corrections: [], handoffs: [], observations: [], measurements: incident.measurements, careEvents: incident.careEvents,
    timelineEvents: incident.timelineEvents.filter(t => t.kind !== 'discovery'), feedback: [], observationCorrections: [],
    knowledgeReferences: [...incident.knowledgeReferences, ...DEV_REFERENCES.filter(r => !incident.knowledgeReferences.some(k => k.id === r.id))],
    patient: { ...incident.patient, sharing: false, matched: false }
  });

  async function load(): Promise<Stored> {
    const raw = storage.get(KEY);
    if (raw) { try { const s = JSON.parse(raw); return { incident: WorkspaceIncidentSchema.parse(s.incident), requests: s.requests ?? {} }; } catch { storage.remove(KEY); } }
    const stored = { incident: fresh(await seed()), requests: {} };
    storage.set(KEY, JSON.stringify(stored));
    return stored;
  }
  const save = (s: Stored) => storage.set(KEY, JSON.stringify(s));
  const snapshot = (s: Stored) => WorkspaceIncidentSchema.parse(structuredClone(s.incident));

  // Serialize mutations within this tab.
  function tx<T>(fn: (s: Stored) => T | Promise<T>): Promise<T> {
    const next = queue.then(async () => { const s = await load(); const result = await fn(s); save(s); return result; });
    queue = next.catch(() => undefined);
    return next;
  }
  const requireMatch = (s: Stored, endpoint: string) => { if (!s.incident.patient.sharing || !s.incident.patient.matched) throw new PlatformError('forbidden', 'Confirm the patient association first.', endpoint, 403); };
  /** Idempotency + revision check. Returns true when this exact request was already applied. */
  function guard(s: Stored, endpoint: string, input: Mutation): boolean {
    requireMatch(s, endpoint);
    const body = JSON.stringify({ endpoint, ...input });
    const previous = s.requests[input.requestId];
    if (previous !== undefined) { if (previous !== body) throw new PlatformError('conflict', 'Request ID already used for different content.', endpoint, 409); return true; }
    if (input.baseRevision !== s.incident.revision) throw new PlatformError('conflict', 'The incident changed since you started. Check the latest record, then submit again.', endpoint, 409);
    s.requests[input.requestId] = body;
    return false;
  }
  function source(s: Stored, label: string, text: string, eventTime: string | null, type: WorkspaceSource['type'] = 'crew'): string {
    const id = uuid();
    s.incident.sources.push({ id, type, label, text, eventTime, capturedAt: now() });
    return id;
  }

  const platform: Platform = {
    info: { kind: 'dev', label: 'Development adapter', description: 'Records are kept in this browser only (seeded from the platform fixture). Assistant feedback is a deterministic development stub.' },
    getIncident: () => tx(snapshot),
    async reset() { storage.remove(KEY); return tx(snapshot); },
    setSharing: sharing => tx(s => { s.incident.patient.sharing = sharing; if (!sharing) s.incident.patient.matched = false; return snapshot(s); }),
    match: patientId => tx(s => {
      if (!s.incident.patient.sharing) throw new PlatformError('forbidden', 'Enable synthetic sharing in the patient view first.', 'match', 403);
      if (patientId !== s.incident.patient.id) throw new PlatformError('conflict', 'Patient identifier does not match.', 'match', 409);
      s.incident.patient.matched = true; return snapshot(s);
    }),
    addObservation: input => tx(s => {
      if (!input.text.trim()) throw new PlatformError('invalid', 'Observation text is empty.', 'observations', 400);
      if (!guard(s, 'observations', input)) {
        const label = input.inputMode === 'voice-reviewed' ? 'Crew observation — voice, reviewed transcript' : input.inputMode === 'example' ? 'Crew observation — example transcript (not a recording)' : 'Crew observation — typed';
        const sourceId = source(s, label, input.text, input.observedAt);
        s.incident.observations.push({ id: uuid(), text: input.text.trim(), category: input.category, observedAt: input.observedAt, capturedAt: now(), sourceId, author: 'crew', inputMode: input.inputMode, status: 'active', baseRevision: input.baseRevision });
        s.incident.revision++;
      }
      return { incident: snapshot(s), compatibility: null };
    }),
    addMeasurement: input => tx(s => {
      if (input.status === 'obtained' && input.value === null) throw new PlatformError('invalid', 'Enter a value or mark the measurement as not obtained.', 'measurements', 400);
      if (!guard(s, 'measurements', input)) {
        const { requestId: _r, baseRevision: _b, ...m } = input;
        const sourceId = source(s, `Crew entry — ${m.kind} (manual)`, `${m.kind} ${m.status === 'obtained' ? `${m.value}${m.value2 !== null ? `/${m.value2}` : ''} ${m.unit}` : 'not obtained'}`, m.eventTime);
        s.incident.measurements.push({ ...m, id: uuid(), capturedAt: now(), sourceId, synthetic: false });
        s.incident.revision++;
      }
      return snapshot(s);
    }),
    addCareEvent: input => tx(s => {
      if (!input.action.trim()) throw new PlatformError('invalid', 'Describe the action performed.', 'care-events', 400);
      if (!guard(s, 'care-events', input)) {
        const { requestId: _r, baseRevision: _b, ...c } = input;
        const sourceId = source(s, 'Crew entry — care event', c.action, c.startedAt);
        s.incident.careEvents.push({ ...c, id: uuid(), capturedAt: now(), sourceId });
        s.incident.revision++;
      }
      return snapshot(s);
    }),
    addTimelineEvent: input => tx(s => {
      if (!guard(s, 'timeline-events', input)) {
        const { requestId: _r, baseRevision: _b, ...t } = input;
        const sourceId = source(s, `Crew entry — ${t.kind} time`, t.note ?? t.kind, t.time);
        s.incident.timelineEvents.push({ ...t, certainty: t.time === null ? 'unknown' : t.certainty, id: uuid(), capturedAt: now(), sourceIds: [sourceId] });
        s.incident.revision++;
      }
      return snapshot(s);
    }),
    async transcribe() {
      throw new PlatformError('unavailable', 'Transcription is not available in the development adapter. Type the observation or use the platform with a configured assistant.', 'audio/transcriptions', 503);
    },
    async evaluate(input) {
      const start = await tx(s => {
        requireMatch(s, 'evaluations');
        if (!devAssistantEnabled(storage)) throw new PlatformError('unavailable', 'The assistant is switched off in the development adapter.', 'evaluations', 503);
        if (input.baseRevision !== s.incident.revision) throw new PlatformError('conflict', 'The incident changed before the check started.', 'evaluations', 409);
        return snapshot(s);
      });
      const proposed = devEvaluate(start);
      await new Promise(r => setTimeout(r, delay));
      return tx(s => {
        // A late response must not be applied to a different revision.
        if (s.incident.revision !== start.revision) throw new PlatformError('conflict', 'New information was added while the check ran; its feedback was not applied. Check again.', 'evaluations', 409);
        s.incident.feedback.push(...proposed);
        return snapshot(s);
      });
    },
    resolveFeedback: input => tx(s => {
      const endpoint = `feedback/${input.feedbackId}/resolutions`;
      const f = s.incident.feedback.find(x => x.id === input.feedbackId);
      if (!f) throw new PlatformError('not_found', 'Feedback item not found.', endpoint, 404);
      if (input.action === 'clarify' && !input.clarificationText?.trim()) throw new PlatformError('invalid', 'Enter the clarification before saving.', endpoint, 400);
      if (guard(s, endpoint, input)) return snapshot(s);
      if (f.status === 'clarified' || f.status === 'dismissed') throw new PlatformError('conflict', 'This item was already resolved.', endpoint, 409);
      let replacementObservationId: string | null = null;
      if (input.action === 'clarify') {
        const originals = s.incident.observations.filter(o => f.observationIds.includes(o.id));
        const text = input.clarificationText!.trim();
        const sourceId = source(s, 'Crew clarification — in response to assistant question', text, null);
        replacementObservationId = uuid();
        s.incident.observations.push({ id: replacementObservationId, text, category: originals[0]?.category ?? 'general', observedAt: null, capturedAt: now(), sourceId, author: 'crew', inputMode: 'typed', status: 'active', baseRevision: input.baseRevision });
        for (const o of originals) {
          o.status = 'clarified';
          s.incident.observationCorrections.push({ id: uuid(), originalObservationId: o.id, replacementObservationId, feedbackId: f.id, author: 'crew', recordedAt: now() });
        }
        s.incident.revision++;
      }
      f.status = ({ clarify: 'clarified', dismiss: 'dismissed', defer: 'deferred' } as const)[input.action];
      f.resolution = { action: input.action, text: input.clarificationText?.trim() || null, recordedAt: now(), author: 'crew', revision: input.baseRevision, replacementObservationId };
      return snapshot(s);
    }),
    async getHandoffDraft(current) { return buildDraft(current); },
    approveHandoff: input => tx(s => {
      requireMatch(s, 'handoffs');
      if (input.revision !== s.incident.revision) throw new PlatformError('conflict', 'Incident changed. Review the latest draft before sharing.', 'handoffs', 409);
      if (!s.incident.handoffs.some(h => h.revision === input.revision)) {
        const draft = buildDraft(s.incident);
        s.incident.handoffs.push({ version: s.incident.handoffs.length + 1, revision: input.revision, reviewedAt: now(), reviewedBy: input.reviewedBy, text: draftText(draft), draft });
      }
      return snapshot(s);
    })
  };
  return platform;
}

export type { Feedback };
