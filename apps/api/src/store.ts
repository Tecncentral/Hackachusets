import { randomUUID } from 'node:crypto';
import { ZodError, type ZodType } from 'zod';
import { createIncidentFixture } from '@scenebrief/fixtures';
import { demoAdapter, DemoInitial } from '@scenebrief/ai';
import {
  IncidentSchema, findIntegrityProblems,
  ObservationRequest, MeasurementRequest, CareEventRequest, TimelineEventRequest, ContextFactRequest, EnvironmentReadingRequest,
  ObservationInputSchema, MeasurementInputSchema, CareEventInputSchema, TimelineEventInputSchema, ContextFactInputSchema, EnvironmentReadingInputSchema,
  CorrectionRequest, EvaluationRequest, ResolutionRequest,
  type Incident, type TranscriptInput, type ScenarioVariantValue, type EvaluateRequest, type HandoffDraft, type Handoff,
} from '@scenebrief/contracts';
import { AssistantGateway, type AssistantOutcome } from './assistant.js';
import { visibleRecord } from './visibility.js';
import { buildHandoffDraft, reviewSnapshot } from './handoff.js';
import { describeMeasurement, describeCareEvent, describeTimelineEvent, describeFact, describeEnvironment } from './describe.js';

export class StoreError extends Error { constructor(public status: number, message: string) { super(message); } }

type RecordKind = 'observation' | 'measurement' | 'careEvent' | 'timelineEvent' | 'contextFact' | 'environmentReading';
type Collection = 'observations' | 'measurements' | 'careEvents' | 'timelineEvents' | 'contextFacts' | 'environmentReadings';
type Fields = Record<string, unknown> & { sourceIds: string[] };
interface KindSpec {
  collection: Collection; prefix: string; label: string; request: ZodType; input: ZodType;
  // Loosely typed on purpose: inputs are schema-validated, and commit() re-validates the full incident.
  describe: (f: any) => string; eventTime: (f: any) => string | null; limitation?: (f: any) => string | null;
}
const KINDS: Record<RecordKind, KindSpec> = {
  observation: { collection: 'observations', prefix: 'obs', label: 'observation', request: ObservationRequest, input: ObservationInputSchema, describe: f => f.text, eventTime: f => f.observedAt },
  measurement: { collection: 'measurements', prefix: 'meas', label: 'measurement', request: MeasurementRequest, input: MeasurementInputSchema, describe: f => describeMeasurement(f), eventTime: f => f.measuredAt, limitation: f => (f.kind === 'skin_temperature' ? 'Skin temperature; not core temperature.' : null) },
  careEvent: { collection: 'careEvents', prefix: 'care', label: 'care event', request: CareEventRequest, input: CareEventInputSchema, describe: f => describeCareEvent(f), eventTime: f => f.startedAt },
  timelineEvent: { collection: 'timelineEvents', prefix: 'tl', label: 'timeline event', request: TimelineEventRequest, input: TimelineEventInputSchema, describe: f => describeTimelineEvent(f), eventTime: f => f.time },
  contextFact: { collection: 'contextFacts', prefix: 'fact', label: 'context', request: ContextFactRequest, input: ContextFactInputSchema, describe: f => describeFact(f), eventTime: () => null },
  environmentReading: { collection: 'environmentReadings', prefix: 'env', label: 'environment reading', request: EnvironmentReadingRequest, input: EnvironmentReadingInputSchema, describe: f => describeEnvironment(f), eventTime: f => f.measuredAt, limitation: () => 'Environmental reading; not body temperature.' },
};
const META_KEYS = new Set(['id', 'status', 'sourceIds', 'recordedAt', 'recordedBy', 'addedAtRevision', 'baseRevision', 'clarifiesFeedbackId']);
const PROTOCOL_CONTEXT = { agencyProtocolId: null, applicability: 'not_configured', note: 'No agency protocol configured. Consensus documents are background only; responders follow their applicable agency protocols.' } as const;

export interface StoreOptions { assistant?: AssistantGateway; clock?: () => Date; variant?: ScenarioVariantValue }

export class IncidentStore {
  readonly assistant: AssistantGateway;
  private clock: () => Date;
  private defaultVariant: ScenarioVariantValue;
  private incident: Incident;
  private requests = new Map<string, { route: string; fingerprint: string }>();
  private generation = 0;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(options: StoreOptions = {}) {
    this.assistant = options.assistant ?? new AssistantGateway();
    this.clock = options.clock ?? (() => new Date());
    this.defaultVariant = options.variant ?? 'ehs-runner';
    this.incident = createIncidentFixture(this.defaultVariant);
  }

  snapshot(): Incident { return structuredClone(this.incident); }

  // Serialize mutations, including asynchronous adapter calls, to avoid lost corrections.
  transaction<T>(fn: () => Promise<T> | T): Promise<T> {
    const next = this.queue.then(fn); this.queue = next.catch(() => undefined); return next;
  }

  reset(variant: ScenarioVariantValue = this.defaultVariant) {
    this.incident = createIncidentFixture(variant); this.requests.clear(); this.generation++; return this.snapshot();
  }

  // ---- internals -----------------------------------------------------------
  private now() { return this.clock().toISOString(); }

  /** Apply fn to a draft copy; validate schema and references before replacing state (atomic). */
  private commit<T>(fn: (draft: Incident) => T, bumpRevision: boolean): T {
    const draft = structuredClone(this.incident);
    const result = fn(draft);
    if (bumpRevision) draft.revision++;
    let parsed: Incident;
    try { parsed = IncidentSchema.parse(draft); } catch (error) {
      if (error instanceof ZodError) throw new Error(`Internal record validation failed: ${error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
      throw error;
    }
    const problems = findIntegrityProblems(parsed);
    if (problems.length) throw new Error(`Integrity check failed: ${problems.join('; ')}`);
    this.incident = parsed;
    return result;
  }

  /** True if this exact request was already applied. Reuse of the ID for anything else is a 409. */
  private replayed(route: string, requestId: string, body: unknown, message = 'Request ID already used for a different request.'): boolean {
    const prior = this.requests.get(requestId);
    if (!prior) return false;
    if (prior.route === route && prior.fingerprint === JSON.stringify(body)) return true;
    throw new StoreError(409, message);
  }
  private remember(route: string, requestId: string, body: unknown) { this.requests.set(requestId, { route, fingerprint: JSON.stringify(body) }); }

  /** Appends may be based on an older revision (documentation is never blocked), but not a future one. */
  private checkAppend(baseRevision: number) {
    if (baseRevision > this.incident.revision) throw new StoreError(409, `baseRevision ${baseRevision} is ahead of the incident (revision ${this.incident.revision}). Refresh the incident.`);
  }
  /** Edits to existing records and reviews must be based on the current revision. */
  private checkCurrent(baseRevision: number) {
    if (baseRevision !== this.incident.revision) throw new StoreError(409, `Incident changed (now revision ${this.incident.revision}; request was based on ${baseRevision}). Refresh and retry.`);
  }

  private requireSources(draft: Incident, ids: string[]) {
    const known = new Set(draft.sources.map(s => s.id));
    const missing = ids.filter(id => !known.has(id));
    if (missing.length) throw new StoreError(400, `Unknown source id: ${missing.join(', ')}`);
  }

  /** Append a crew-entered record with its own entry source. Returns the new record ID. */
  private appendRecord(draft: Incident, kind: RecordKind, fields: Fields, meta: { recordedBy: string; baseRevision: number }, extra: Record<string, unknown> = {}, action = ''): string {
    const spec = KINDS[kind];
    this.requireSources(draft, fields.sourceIds);
    const { sourceIds, ...rest } = fields;
    const mode = kind === 'observation' ? ` (${rest.inputMode === 'transcribed' ? 'transcribed, crew-reviewed' : 'typed'})` : '';
    const sourceId = `src-${randomUUID()}`;
    draft.sources.push({ id: sourceId, type: 'crew', label: `Crew entry \u2014 ${spec.label}${action ? ` ${action}` : ''}${mode}`, capturedAt: this.now(), eventTime: spec.eventTime(rest), text: spec.describe(rest), origin: 'crew_entry', limitation: spec.limitation?.(rest) ?? null });
    const id = `${spec.prefix}-${randomUUID()}`;
    (draft[spec.collection] as unknown[]).push({ id, status: 'current', sourceIds: [sourceId, ...sourceIds], recordedAt: this.now(), recordedBy: meta.recordedBy, addedAtRevision: draft.revision + 1, baseRevision: meta.baseRevision, ...rest, ...(kind === 'observation' ? { clarifiesFeedbackId: null } : {}), ...extra });
    return id;
  }

  private create(kind: RecordKind, raw: unknown): Incident {
    const input = KINDS[kind].request.parse(raw) as Fields & { requestId: string; baseRevision: number; recordedBy: string };
    if (this.replayed(kind, input.requestId, input)) return this.snapshot();
    this.checkAppend(input.baseRevision);
    const { requestId, baseRevision, recordedBy, ...fields } = input;
    this.commit(draft => this.appendRecord(draft, kind, fields as Fields, { recordedBy, baseRevision }), true);
    this.remember(kind, requestId, input);
    return this.snapshot();
  }

  private locate(id: string): { kind: RecordKind; record: Record<string, unknown> & { status: string } } | null {
    for (const kind of Object.keys(KINDS) as RecordKind[]) {
      const record = (this.incident[KINDS[kind].collection] as (Record<string, unknown> & { id: string; status: string })[]).find(r => r.id === id);
      if (record) return { kind, record };
    }
    return null;
  }

  // ---- capture ---------------------------------------------------------------
  addObservation(raw: unknown) { return this.create('observation', raw); }
  addMeasurement(raw: unknown) { return this.create('measurement', raw); }
  addCareEvent(raw: unknown) { return this.create('careEvent', raw); }
  addTimelineEvent(raw: unknown) { return this.create('timelineEvent', raw); }
  addContextFact(raw: unknown) { return this.create('contextFact', raw); }
  addEnvironmentReading(raw: unknown) { return this.create('environmentReading', raw); }

  /** Replace a record. The original stays, marked superseded, with its value and sources. */
  correct(raw: unknown): Incident {
    const input = CorrectionRequest.parse(raw);
    if (this.replayed('correction', input.requestId, input)) return this.snapshot();
    if (this.incident.claims.some(c => c.id === input.targetId)) throw new StoreError(400, 'Legacy claims are corrected through /transcripts.');
    const target = this.locate(input.targetId);
    if (!target) throw new StoreError(404, 'Unknown record');
    this.checkCurrent(input.baseRevision);
    if (target.record.status === 'superseded') throw new StoreError(409, 'Record already superseded. Correct its current replacement.');
    // Partial replacement: unspecified fields keep the original values. Sources are not carried over.
    const original = Object.fromEntries(Object.entries(target.record).filter(([k]) => !META_KEYS.has(k)));
    const fields = KINDS[target.kind].input.parse({ ...original, ...input.replacement }) as Fields;
    const spec = KINDS[target.kind];
    this.commit(draft => {
      const replacementId = this.appendRecord(draft, target.kind, fields, { recordedBy: input.recordedBy, baseRevision: input.baseRevision }, {}, 'correction');
      const old = (draft[spec.collection] as { id: string; status: string }[]).find(r => r.id === input.targetId)!;
      old.status = 'superseded';
      draft.corrections.push({ id: `corr-${randomUUID()}`, targetType: target.kind, originalId: input.targetId, replacementId, author: input.recordedBy, recordedAt: this.now(), reason: input.reason, feedbackId: null, revision: draft.revision + 1 });
    }, true);
    this.remember('correction', input.requestId, input);
    return this.snapshot();
  }

  // ---- legacy scaffold routes ---------------------------------------------------
  // Sharing and matching gate access; they are not handoff content, so they do not bump revision
  // (a revision bump would falsely mark a reviewed handoff as stale in the ER view).
  sharing(value: boolean) { this.commit(d => { d.patient.sharing = value; if (!value) d.patient.matched = false; }, false); return this.snapshot(); }
  match(id: string) {
    if (!this.incident.patient.sharing) throw new StoreError(403, 'Enable synthetic sharing in the patient portal first.');
    if (id !== this.incident.patient.id) throw new StoreError(409, 'Patient identifier does not match.');
    this.commit(d => { d.patient.matched = true; }, false); return this.snapshot();
  }
  private requireMatch() { if (!this.incident.patient.sharing || !this.incident.patient.matched) throw new StoreError(403, 'Confirm the patient association first.'); }

  /** Legacy scripted transcript flow (claims). New capture should use addObservation. */
  async transcript(input: TranscriptInput) {
    this.requireMatch();
    if (this.replayed('transcript', input.requestId, { text: input.text }, 'Request ID already used for different text.')) return this.snapshot();
    const result = await demoAdapter.extract(input.text);
    this.commit(draft => {
      const now = this.now(), sourceId = randomUUID(), claimId = randomUUID();
      draft.sources.push({ id: sourceId, type: 'voice', label: 'Typed demo transcript \u2014 crew relays witness', text: input.text, eventTime: null, capturedAt: now, origin: 'crew_entry', limitation: 'Scripted legacy extraction; not verified.' });
      const original = draft.claims.find(c => c.field === 'account' && c.value === DemoInitial && c.status === 'reported');
      draft.claims.push({ id: claimId, field: result.field, value: result.value, sourceIds: [sourceId], status: 'reported', recordedAt: now });
      if (result.clarifiesInitial && original) {
        original.status = 'superseded';
        draft.corrections.push({ id: randomUUID(), targetType: 'claim', originalId: original.id, replacementId: claimId, originalClaimId: original.id, replacementClaimId: claimId, author: 'demo-crew', recordedAt: now, reason: null, feedbackId: null, revision: draft.revision + 1 });
      }
    }, true);
    this.remember('transcript', input.requestId, { text: input.text });
    return this.snapshot();
  }

  // ---- assistant evaluation ---------------------------------------------------
  private evaluateRequest(): EvaluateRequest {
    const view = visibleRecord(this.incident);
    const current = <T extends { status: string }>(xs: T[]) => xs.filter(x => x.status === 'current');
    return structuredClone({
      incidentId: view.id, revision: view.revision, patientMatched: view.patient.matched,
      observations: current(view.observations), measurements: current(view.measurements), sources: view.sources, careEvents: current(view.careEvents),
      timelineEvents: current(view.timelineEvents), contextFacts: current(view.contextFacts), environmentReadings: current(view.environmentReadings),
      wearableRecords: view.wearableRecords, protocolContext: PROTOCOL_CONTEXT,
    });
  }

  /**
   * Evaluate the current revision. The assistant call runs outside the mutation queue, so capture
   * continues meanwhile. A result for a revision that changed in the meantime is stored as stale.
   * Call directly (not inside transaction()).
   */
  async evaluate(raw: unknown): Promise<Incident> {
    const input = EvaluationRequest.parse(raw);
    const started = await this.transaction(() => {
      if (this.replayed('evaluation', input.requestId, input)) return null;
      this.checkCurrent(input.baseRevision);
      const id = `eval-${randomUUID()}`;
      this.commit(d => { d.evaluations.push({ id, requestId: input.requestId, revision: d.revision, status: 'pending', mode: null, requestedAt: this.now(), completedAt: null, feedbackIds: [], discardedItems: 0, suppressedDuplicates: 0, error: null }); }, false);
      this.remember('evaluation', input.requestId, input);
      return { id, generation: this.generation, request: this.evaluateRequest() };
    });
    if (!started) return this.snapshot();
    const outcome = await this.assistant.evaluate(started.request);
    return this.transaction(() => {
      if (this.generation !== started.generation) throw new StoreError(409, 'The incident was reset during evaluation; the result was discarded.');
      this.commit(d => this.applyEvaluation(d, started.id, started.request, outcome), false);
      return this.snapshot();
    });
  }

  private applyEvaluation(draft: Incident, evaluationId: string, request: EvaluateRequest, outcome: AssistantOutcome) {
    const evaluation = draft.evaluations.find(e => e.id === evaluationId)!;
    evaluation.completedAt = this.now();
    if (outcome.status !== 'completed') {
      evaluation.status = outcome.status; evaluation.mode = outcome.status === 'unavailable' ? 'unavailable' : null; evaluation.error = outcome.error; return;
    }
    const response = outcome.response;
    evaluation.mode = response.mode;
    if (response.incidentId !== request.incidentId || response.revision !== request.revision) {
      evaluation.status = 'failed'; evaluation.error = 'Assistant response did not match the evaluated incident revision.'; return;
    }
    const stale = draft.revision !== request.revision;
    const known = new Map(draft.knowledgeReferences.map(k => [k.id, k]));
    const offered = new Map(response.knowledgeReferences.map(k => [k.id, k]));
    const observationIds = new Set(request.observations.map(o => o.id));
    const sourceIds = new Set(request.sources.map(s => s.id));
    const key = (f: { kind: string; observationIds: string[]; knowledgeReferenceIds: string[]; evidenceSourceIds: string[] }) =>
      [f.kind, [...f.observationIds].sort(), [...f.knowledgeReferenceIds].sort(), [...f.evidenceSourceIds].sort()].map(String).join('|');
    const seen = new Set(draft.feedback.filter(f => f.status !== 'stale').map(key));
    for (const { id: assistantItemId, ...item } of response.feedback) {
      // Only IDs that exist in the evaluated snapshot (or supplied references) are accepted.
      const valid = item.observationIds.every(id => observationIds.has(id)) && item.evidenceSourceIds.every(id => sourceIds.has(id)) && item.knowledgeReferenceIds.every(id => known.has(id) || offered.has(id));
      if (!valid) { evaluation.discardedItems++; continue; }
      if (!stale && seen.has(key(item))) { evaluation.suppressedDuplicates++; continue; }
      seen.add(key(item));
      for (const id of item.knowledgeReferenceIds) if (!known.has(id)) { const ref = offered.get(id)!; draft.knowledgeReferences.push(ref); known.set(id, ref); }
      const feedbackId = `fb-${randomUUID()}`;
      draft.feedback.push({ ...item, id: feedbackId, assistantItemId, evaluationId, revision: request.revision, mode: response.mode, status: stale ? 'stale' : 'open', createdAt: this.now() });
      evaluation.feedbackIds.push(feedbackId);
    }
    evaluation.status = stale ? 'stale' : 'completed';
    if (stale) evaluation.error = `Incident changed to revision ${draft.revision} during evaluation; feedback stored as stale and not applied.`;
  }

  // ---- feedback resolution ----------------------------------------------------
  /** clarify: record the crew's own wording as a new observation. dismiss/defer: record the choice only. */
  resolve(feedbackId: string, raw: unknown): Incident {
    const input = ResolutionRequest.parse(raw);
    const route = `resolution:${feedbackId}`;
    if (this.replayed(route, input.requestId, input)) return this.snapshot();
    const feedback = this.incident.feedback.find(f => f.id === feedbackId);
    if (!feedback) throw new StoreError(404, 'Unknown feedback');
    if (feedback.status === 'stale') throw new StoreError(409, 'This feedback was produced for an earlier revision and was not applied. Re-evaluate.');
    if (feedback.status === 'clarified' || feedback.status === 'dismissed') throw new StoreError(409, `Feedback already ${feedback.status}.`);
    const clarify = input.action === 'clarify';
    if (clarify) this.checkCurrent(input.baseRevision); else this.checkAppend(input.baseRevision);
    this.commit(draft => {
      const fb = draft.feedback.find(f => f.id === feedbackId)!;
      const resolution = { id: `res-${randomUUID()}`, feedbackId, action: input.action, clarificationText: input.clarificationText ?? null, clarificationObservationId: null as string | null, note: input.note ?? null, resolvedBy: input.recordedBy, resolvedAt: this.now(), baseRevision: input.baseRevision, revisionAfter: draft.revision };
      if (clarify) {
        const referenced = fb.observationIds.map(id => draft.observations.find(o => o.id === id)!);
        const first = referenced[0];
        const observationId = this.appendRecord(draft, 'observation', {
          text: input.clarificationText!, observedAt: input.observedAt ?? null, category: input.category ?? first?.category ?? 'general',
          reportedBy: input.reportedBy ?? first?.reportedBy ?? 'crew', inputMode: input.inputMode ?? 'typed', sourceIds: [],
        }, { recordedBy: input.recordedBy, baseRevision: input.baseRevision }, { clarifiesFeedbackId: feedbackId }, 'clarification');
        for (const o of referenced.filter(o => o.status === 'current')) {
          o.status = 'superseded';
          draft.corrections.push({ id: `corr-${randomUUID()}`, targetType: 'observation', originalId: o.id, replacementId: observationId, author: input.recordedBy, recordedAt: this.now(), reason: input.note ?? null, feedbackId, revision: draft.revision + 1 });
        }
        fb.status = 'clarified'; resolution.clarificationObservationId = observationId; resolution.revisionAfter = draft.revision + 1;
      } else fb.status = input.action === 'dismiss' ? 'dismissed' : 'deferred';
      draft.resolutions.push(resolution);
    }, clarify);
    this.remember(route, input.requestId, input);
    return this.snapshot();
  }

  // ---- handoff -----------------------------------------------------------------
  handoffDraft(): HandoffDraft { return buildHandoffDraft(this.incident, this.clock()); }
  handoff(version: number): Handoff {
    const found = this.incident.handoffs.find(h => h.version === version);
    if (!found) throw new StoreError(404, 'Unknown handoff version');
    return structuredClone(found);
  }

  /** Freeze the reviewed revision. Same revision again returns the existing version. */
  review(revision: number, reviewer: string) {
    if (revision !== this.incident.revision) throw new StoreError(409, 'Incident changed. Refresh and review the latest draft.');
    if (this.incident.handoffs.some(h => h.revision === revision)) return this.snapshot();
    const draftDoc = buildHandoffDraft(this.incident, this.clock());
    this.commit(d => { d.handoffs.push(reviewSnapshot(draftDoc, reviewer, this.clock(), d.handoffs.at(-1))); }, false);
    return this.snapshot();
  }
}
