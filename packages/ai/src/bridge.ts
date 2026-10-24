import { evaluateHybrid, type HybridOptions } from './hybrid.js';
import { KNOWLEDGE, KNOWLEDGE_VERSION, referenceById } from './knowledge.js';
import {
  EvaluateRequest,
  EvaluateResponse,
  type FeedbackItem,
  type MeasurementInput,
} from './evaluate.types.js';

// Integration bridge: the ONE place that converts between the platform/website
// incident shape and the assistant's /evaluate contract.
//
// Who calls this:
//   - Platform (Member 3): `evaluateIncidentSnapshot(incident)` inside its
//     POST /api/incidents/:id/evaluations route, then stores the returned
//     feedback against `revision`. In-process by default; pass `client` to use
//     the standalone apps/assistant service over HTTP instead.
//   - Website (Member 1): never calls this directly. It calls the platform.
//
// Input shape: the website's proposed incident shape
// (apps/web/src/platform/boundary.ts on feat/emt-website-ehs). It also accepts the
// current scaffold incident (claims[]) so it works on main today. Types here are
// structural and lenient on purpose: the platform owns the canonical schema.

// ---------- Input (platform incident snapshot, structural) ----------

export interface BridgeSource { id: string; type: string; label: string; text?: string | null }
export interface BridgeObservation {
  id: string; text: string; observedAt?: string | null; sourceId?: string | null;
  sourceIds?: string[]; status?: string;
}
export interface BridgeMeasurement {
  id: string; kind: string; status?: 'obtained' | 'not_obtained' | string;
  value: number | string | null; value2?: number | string | null; unit?: string | null;
  method?: string | null; eventTime?: string | null;
  coolingPhase?: 'before' | 'during' | 'after' | 'unknown' | string; sourceId?: string | null;
}
export interface BridgeCareEvent {
  id: string; category?: string; action: string; startedAt?: string | null; endedAt?: string | null;
}
export interface BridgeTimelineEvent {
  id: string; kind: string; time: string | null; certainty?: string; sourceIds?: string[];
}
/** Scaffold-era claim (contracts IncidentSchema on main). */
export interface BridgeClaim { id: string; field: string; value: string | null; sourceIds: string[]; status: string }

export interface BridgeIncident {
  id: string;
  revision: number;
  sources?: BridgeSource[];
  observations?: BridgeObservation[];
  measurements?: BridgeMeasurement[];
  careEvents?: BridgeCareEvent[];
  timelineEvents?: BridgeTimelineEvent[];
  claims?: BridgeClaim[];
  protocolContext?: { agency: string | null; protocolConfirmed: boolean };
}

const MEASUREMENT_KINDS = new Set<MeasurementInput['kind']>([
  'temperature', 'heartRate', 'bloodPressure', 'respiratoryRate', 'spo2', 'glucose',
  'ambientTemperature', 'humidity', 'skinTemperatureDeviation', 'other',
]);
const CERTAINTIES = new Set(['recorded', 'reported', 'estimated', 'unknown']);

function str(v: number | string | null | undefined): string | null {
  return v === null || v === undefined || v === '' ? null : String(v);
}

/** Convert a platform incident snapshot into a validated /evaluate request. */
export function toEvaluateRequest(incident: BridgeIncident): EvaluateRequest {
  const observations = (incident.observations ?? [])
    .filter((o) => o.status !== 'clarified') // clarified originals are superseded by their replacement
    .map((o) => ({
      id: o.id,
      text: o.text,
      observedAt: o.observedAt ?? null,
      sourceIds: o.sourceIds ?? (o.sourceId ? [o.sourceId] : []),
    }));

  const timelineEvents = (incident.timelineEvents ?? []).map((t) => ({
    id: t.id,
    kind: t.kind,
    time: t.time,
    certainty: (CERTAINTIES.has(t.certainty ?? '') ? t.certainty : 'unknown') as 'recorded' | 'reported' | 'estimated' | 'unknown',
    sourceIds: t.sourceIds ?? [],
  }));

  // Scaffold incident (main today): account claims are observations; time claims
  // are timeline facts. An `unknown` claim keeps the time unknown.
  for (const c of incident.claims ?? []) {
    if (c.status === 'superseded') continue;
    if (c.field === 'account' && c.value) {
      observations.push({ id: c.id, text: c.value, observedAt: null, sourceIds: c.sourceIds });
    } else if (c.field === 'discoveryTime' || c.field === 'collapseTime') {
      timelineEvents.push({
        id: c.id,
        kind: c.field === 'discoveryTime' ? 'discovery' : 'collapse',
        time: c.status === 'unknown' ? null : c.value,
        certainty: c.status === 'unknown' || c.value === null ? 'unknown' : 'reported',
        sourceIds: c.sourceIds,
      });
    }
  }

  const measurements: MeasurementInput[] = [];
  for (const m of incident.measurements ?? []) {
    if (m.status === 'not_obtained') continue; // "not obtained" is not a value; never invent one
    const value = str(m.value);
    if (value === null) continue;
    const kind = (MEASUREMENT_KINDS.has(m.kind as MeasurementInput['kind']) ? m.kind : 'other') as MeasurementInput['kind'];
    const v2 = str(m.value2);
    measurements.push({
      id: m.id,
      kind,
      value: kind === 'bloodPressure' && v2 ? `${value}/${v2}` : value,
      unit: m.unit ?? null,
      method: m.method ?? (kind === 'skinTemperatureDeviation' ? 'consumer wearable skin' : null),
      site: null,
      eventTime: m.eventTime ?? null,
      beforeCooling: m.coolingPhase === 'before' ? true : m.coolingPhase === 'during' || m.coolingPhase === 'after' ? false : null,
      sourceId: m.sourceId ?? null,
    });
  }

  return EvaluateRequest.parse({
    incidentId: incident.id,
    revision: incident.revision,
    observations,
    measurements,
    sources: (incident.sources ?? []).map((s) => ({ id: s.id, type: s.type, label: s.label, text: s.text ?? '' })),
    careEvents: (incident.careEvents ?? []).map((c) => ({
      id: c.id,
      action: c.category ? `${c.category}: ${c.action}` : c.action,
      startedAt: c.startedAt ?? null,
      stoppedAt: c.endedAt ?? null,
    })),
    timelineEvents,
    protocolContext: incident.protocolContext,
  });
}

// ---------- Output (what the platform stores; matches the website's FeedbackSchema) ----------

export interface PlatformFeedback extends FeedbackItem {
  revision: number;
  mode: string;
  status: 'open';
  resolution: null;
}

/** Matches the website's KnowledgeReferenceSchema so the UI can render it as-is. */
export interface PlatformKnowledgeReference {
  id: string; title: string; url: string; version: string; passage: string;
  applicability: string; reviewStatus: string;
}

export function toPlatformReference(id: string): PlatformKnowledgeReference | null {
  const r = referenceById(id);
  if (!r) return null;
  return {
    id: r.id,
    title: r.title,
    url: r.url,
    version: `${r.publishedOn} (registry ${KNOWLEDGE_VERSION})`,
    passage: r.passage,
    applicability: r.applicability,
    reviewStatus: `${r.reviewStatus}${r.verified ? '' : ' — passage not machine-verified'}; clinical review required`,
  };
}

export type SnapshotMode = EvaluateResponse['mode'] | 'unavailable';

export interface SnapshotResult {
  incidentId: string;
  /** Always the revision that was evaluated. Platform must reject if it no longer matches. */
  revision: number;
  mode: SnapshotMode;
  feedback: PlatformFeedback[];
  /** Only references the feedback actually cites. */
  knowledgeReferences: PlatformKnowledgeReference[];
  knowledgeVersion: string;
  warnings: string[];
}

/** HTTP client for the standalone apps/assistant service. */
export interface AssistantClient { evaluate(req: EvaluateRequest): Promise<EvaluateResponse> }

export function createAssistantClient(opts: {
  baseUrl: string; // e.g. http://127.0.0.1:3002
  timeoutMs?: number;
  fetch?: typeof fetch;
}): AssistantClient {
  const doFetch = opts.fetch ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 5000;
  return {
    async evaluate(req) {
      const res = await doFetch(`${opts.baseUrl.replace(/\/$/, '')}/evaluate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(req),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) throw new Error(`assistant HTTP ${res.status}`);
      return EvaluateResponse.parse(await res.json()); // never trust the wire
    },
  };
}

export interface SnapshotOptions extends HybridOptions {
  /** Use the HTTP service instead of in-process evaluation. */
  client?: AssistantClient;
  /** Simulate "assistant off" (the platform's toggle). */
  disabled?: boolean;
}

/**
 * Evaluate one immutable incident snapshot. NEVER throws and never mutates the
 * incident: if the assistant is off, slow, or broken the result is
 * `mode: 'unavailable'` with no feedback, so capture and handoff keep working.
 */
export async function evaluateIncidentSnapshot(
  incident: BridgeIncident,
  opts: SnapshotOptions = {},
): Promise<SnapshotResult> {
  const empty = (warning: string): SnapshotResult => ({
    incidentId: incident.id,
    revision: incident.revision,
    mode: 'unavailable',
    feedback: [],
    knowledgeReferences: [],
    knowledgeVersion: KNOWLEDGE_VERSION,
    warnings: [warning],
  });
  if (opts.disabled) return empty('Assistant is turned off. Records and handoff are unaffected.');

  let res: EvaluateResponse;
  try {
    const req = toEvaluateRequest(incident);
    res = opts.client ? await opts.client.evaluate(req) : await evaluateHybrid(req, opts);
  } catch (err) {
    return empty(`Assistant unavailable (${(err as Error).message}). Records and handoff are unaffected.`);
  }
  if (res.revision !== incident.revision || res.incidentId !== incident.id) {
    return empty('Assistant answered for a different incident or revision; response discarded.');
  }

  const refIds = [...new Set(res.feedback.flatMap((f) => f.knowledgeReferenceIds))];
  return {
    incidentId: res.incidentId,
    revision: res.revision,
    mode: res.mode,
    feedback: res.feedback.map((f) => ({ ...f, revision: res.revision, mode: res.mode, status: 'open', resolution: null })),
    knowledgeReferences: refIds.map(toPlatformReference).filter((r): r is PlatformKnowledgeReference => r !== null),
    knowledgeVersion: KNOWLEDGE_VERSION,
    warnings: res.warnings,
  };
}

/** Full registry in the website's reference shape (for a references page or seed data). */
export function allPlatformReferences(): PlatformKnowledgeReference[] {
  return KNOWLEDGE.map((r) => toPlatformReference(r.id)!);
}
