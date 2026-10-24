// Maps between the core platform's canonical incident (@scenebrief/contracts, docs/core-api-contract.md)
// and the website's view model (boundary.ts). This is the website's single translation point:
// incoming responses are mapped with fromCanonical*, outgoing requests with to*Request. It copies
// what the platform stored and never adds facts; anything with no website equivalent is left out.
import { HandoffDraftSchema as CanonicalDraftSchema, IncidentSchema, type HandoffDraft as CanonicalDraft, type Handoff as CanonicalHandoff, type Incident } from '@scenebrief/contracts';
import {
  WorkspaceIncidentSchema, type CareEventInput, type HandoffDraft, type MeasurementInput, type ObservationInput, type TimelineEventInput,
  type WorkspaceIncident, type Observation, type Measurement, type CareEvent, type TimelineEvent, type Feedback, type KnowledgeReference
} from './boundary';
import { zoneDate, zoneTimeToIso } from './time';

type C = Incident;
const invert = <K extends string, V extends string>(m: Record<K, V>) => Object.fromEntries(Object.entries(m).map(([k, v]) => [v, k])) as Record<V, K>;

// ---- vocabularies ------------------------------------------------------------------------------
const OBS_CATEGORY_IN: Record<Observation['category'], C['observations'][number]['category']> = {
  account: 'account', mental_status: 'neurological', skin: 'skin', exertion: 'exertion', environment: 'environment', history: 'history', general: 'general'
};
const OBS_CATEGORY_OUT: Record<C['observations'][number]['category'], Observation['category']> = {
  account: 'account', neurological: 'mental_status', skin: 'skin', exertion: 'exertion', environment: 'environment', history: 'history', general: 'general', reassessment: 'general', care_response: 'general'
};
const INPUT_IN = { typed: 'typed', 'voice-reviewed': 'transcribed', example: 'example', legacy: 'typed' } as const;
const INPUT_OUT = { typed: 'typed', transcribed: 'voice-reviewed', example: 'example' } as const;
const KIND_IN = { temperature: 'body_temperature', heartRate: 'heart_rate', bloodPressure: 'blood_pressure', respiratoryRate: 'respiratory_rate', spo2: 'spo2', glucose: 'glucose', skinTemperatureDeviation: 'skin_temperature' } as const;
const KIND_OUT = invert(KIND_IN);
const PHASE_IN = { before: 'before_cooling', during: 'during_cooling', after: 'after_cooling', unknown: 'unknown' } as const;
const PHASE_OUT = invert(PHASE_IN);
const SITES = new Set(['rectal', 'esophageal', 'oral', 'tympanic', 'temporal_artery', 'axillary', 'other']);
const CARE_IN = { cooling: 'cooling', airway: 'airway', iv_access: 'vascular_access', medication: 'medication', positioning: 'positioning', transport: 'other', other: 'other' } as const;
const CARE_OUT: Record<C['careEvents'][number]['kind'], CareEvent['category']> = {
  cooling: 'cooling', oxygen: 'airway', airway: 'airway', vascular_access: 'iv_access', fluids: 'other', medication: 'medication', positioning: 'positioning', other: 'other'
};
const COOLING_LABEL: Record<string, string> = { cold_water_immersion: 'cold-water immersion', ice_water_towels: 'ice-water towels', ice_packs: 'ice packs', evaporative_fanning: 'evaporative fanning', other: 'other method' };
const TIME_IN = {
  activityStart: 'exertion_start', activityEnd: 'exertion_end', symptomOnset: 'symptom_onset', lastKnownWell: 'last_known_normal', discovery: 'discovery', collapse: 'collapse',
  deviceFall: 'device_fall_event', call: 'emergency_call', arrival: 'crew_arrival', transport: 'transport_start', handoff: 'handoff'
} as const;
const TIME_OUT: Partial<Record<C['timelineEvents'][number]['kind'], TimelineEvent['kind']>> = invert(TIME_IN);
const PERSON = new Set(['witness', 'patient', 'bystander', 'other']);

// ---- incoming ----------------------------------------------------------------------------------
export function isCanonicalIncident(raw: unknown): boolean { return IncidentSchema.safeParse(raw).success; }

export function fromCanonicalIncident(raw: unknown): WorkspaceIncident {
  const c = IncidentSchema.parse(raw);
  const origin = new Map(c.sources.map(s => [s.id, s]));
  const current = <T extends { status: string }>(xs: T[]) => xs.filter(x => x.status === 'current');
  const profileIds = new Set(c.sources.filter(s => s.type === 'patient_profile').map(s => s.id));
  const synthetic = (ids: string[]) => ids.some(id => origin.get(id)?.origin === 'synthetic_fixture');

  const observations: Observation[] = c.observations.map(o => ({
    id: o.id, text: o.text, category: OBS_CATEGORY_OUT[o.category], observedAt: o.observedAt, capturedAt: o.recordedAt, sourceId: o.sourceIds[0] ?? o.id,
    author: o.recordedBy, inputMode: INPUT_OUT[o.inputMode], status: o.status === 'superseded' ? 'clarified' : 'active', baseRevision: o.baseRevision
  }));
  const measurements: Measurement[] = [
    ...current(c.measurements).map(m => ({
      id: m.id, kind: KIND_OUT[m.kind], status: m.obtained ? 'obtained' as const : 'not_obtained' as const, value: m.value, value2: m.diastolic, unit: m.unit,
      method: m.site && m.site !== 'unknown' ? m.site.replace('_', ' ') : null, eventTime: m.measuredAt, capturedAt: m.recordedAt, coolingPhase: PHASE_OUT[m.coolingPhase],
      sourceKind: 'manual' as const, device: m.device, recordedBy: m.recordedBy, note: m.note, sourceId: m.sourceIds[0] ?? m.id, synthetic: synthetic(m.sourceIds)
    })),
    // Environment is context, never body temperature.
    ...current(c.environmentReadings).filter(e => e.kind !== 'wbgt').map(e => ({
      id: e.id, kind: e.kind === 'ambient_temperature' ? 'ambientTemperature' as const : 'humidity' as const, status: 'obtained' as const, value: e.value, value2: null, unit: e.unit,
      method: null, eventTime: e.measuredAt, capturedAt: e.recordedAt, coolingPhase: 'unknown' as const, sourceKind: 'reference' as const, device: null,
      recordedBy: e.recordedBy, note: e.location, sourceId: e.sourceIds[0] ?? e.id, synthetic: synthetic(e.sourceIds)
    })),
    // Consumer skin-temperature deviation: background only, never core temperature.
    ...c.wearableRecords.filter(w => w.metric === 'skin_temperature_deviation' && w.value !== null).map(w => ({
      id: w.id, kind: 'skinTemperatureDeviation' as const, status: 'obtained' as const, value: w.value, value2: null, unit: '°C', method: null,
      eventTime: w.endTime ?? w.startTime, capturedAt: origin.get(w.sourceId)?.capturedAt ?? c.sources[0]?.capturedAt ?? new Date(0).toISOString(), coolingPhase: 'unknown' as const,
      sourceKind: 'wearable' as const, device: null, recordedBy: 'device', note: w.limitation, sourceId: w.sourceId, synthetic: synthetic([w.sourceId])
    }))
  ];
  const careEvents: CareEvent[] = current(c.careEvents).map(e => ({
    id: e.id, category: CARE_OUT[e.kind],
    action: `${e.description}${e.coolingMethod ? ` (${COOLING_LABEL[e.coolingMethod]})` : ''}${e.performance === 'not_performed' ? ' — not performed' : e.performance === 'unknown' ? ' — whether performed is unknown' : ''}`,
    startedAt: e.startedAt, endedAt: e.endedAt, note: e.response, recordedBy: e.recordedBy, capturedAt: e.recordedAt, sourceId: e.sourceIds[0] ?? e.id
  }));
  const timelineEvents: TimelineEvent[] = current(c.timelineEvents).flatMap(t => {
    const kind = TIME_OUT[t.kind];
    if (!kind) return [];
    const certainty: TimelineEvent['certainty'] = t.certainty === 'unknown' ? 'unknown'
      : t.certainty === 'approximate' ? (t.reportedBy === 'crew' ? 'estimated' : 'reported')
      : PERSON.has(t.reportedBy) ? 'reported' : 'recorded';
    return [{ id: t.id, kind, time: t.time, certainty, note: t.note, sourceIds: t.sourceIds, capturedAt: t.recordedAt }];
  });

  // Legacy /transcripts records (claims + voice sources) are shown alongside, without duplicating structured kinds.
  const claimFor = (sourceId: string) => c.claims.find(k => k.sourceIds.includes(sourceId));
  for (const s of c.sources.filter(s => s.type === 'voice' && !observations.some(o => o.sourceId === s.id))) {
    observations.push({ id: s.id, text: s.text, category: 'account', observedAt: s.eventTime, capturedAt: s.capturedAt, sourceId: s.id, author: 'crew', inputMode: 'legacy', status: claimFor(s.id)?.status === 'superseded' ? 'clarified' : 'active', baseRevision: null });
  }
  for (const k of c.claims.filter(k => k.field !== 'account' && k.status !== 'superseded')) {
    const kind = k.field === 'discoveryTime' ? 'discovery' as const : 'collapse' as const;
    if (timelineEvents.some(t => t.kind === kind)) continue;
    const hhmm = k.value?.match(/\b(\d{2}):(\d{2})\b/)?.[0] ?? null;
    const time = k.status === 'unknown' || !hhmm ? null : zoneTimeToIso(zoneDate(k.recordedAt), hhmm);
    timelineEvents.push({ id: `claim-${k.id}`, kind, time, certainty: time === null ? 'unknown' : 'reported', note: k.value, sourceIds: k.sourceIds, capturedAt: k.recordedAt });
  }
  const observationCorrections = c.corrections.flatMap(k => {
    if (k.targetType === 'observation') return [{ id: k.id, originalObservationId: k.originalId, replacementObservationId: k.replacementId, feedbackId: k.feedbackId, author: k.author, recordedAt: k.recordedAt }];
    if (k.targetType !== 'claim') return [];
    const from = c.claims.find(x => x.id === k.originalId)?.sourceIds[0], to = c.claims.find(x => x.id === k.replacementId)?.sourceIds[0];
    return from && to ? [{ id: k.id, originalObservationId: from, replacementObservationId: to, feedbackId: null, author: k.author, recordedAt: k.recordedAt }] : [];
  });

  // Stale feedback was produced for an older revision and never applied: not shown.
  const feedback: Feedback[] = c.feedback.filter(f => f.status !== 'stale').map(f => {
    const r = c.resolutions.filter(x => x.feedbackId === f.id).at(-1);
    return {
      id: f.id, revision: f.revision, kind: f.kind, message: f.message, suggestedQuestion: f.suggestedQuestion, observationIds: f.observationIds,
      evidenceSourceIds: f.evidenceSourceIds, knowledgeReferenceIds: f.knowledgeReferenceIds, spokenSummary: f.spokenSummary, mode: f.mode,
      status: f.status as Feedback['status'],
      resolution: r ? { action: r.action, text: r.clarificationText ?? r.note, recordedAt: r.resolvedAt, author: r.resolvedBy, revision: r.baseRevision, replacementObservationId: r.clarificationObservationId } : null
    };
  });
  const knowledgeReferences: KnowledgeReference[] = c.knowledgeReferences.map(k => ({
    id: k.id, title: k.title, url: k.url, version: [k.versionDate, k.section].filter(Boolean).join(' · ') || 'Version not recorded', passage: k.passage ?? '',
    applicability: k.applicability, reviewStatus: k.reviewStatus === 'clinician_reviewed' ? 'Clinician reviewed' : 'Not clinically reviewed'
  }));

  // Patient context: crew-entered facts always; profile facts only once the patient is matched.
  const facts = current(c.contextFacts).filter(f => c.patient.matched || !f.sourceIds.length || f.sourceIds.some(id => !profileIds.has(id)));
  const joined = (category: string) => { const v = facts.filter(f => f.category === category).map(f => f.value ?? 'Unknown'); return v.length ? v.join('; ') : null; };
  const context = { age: joined('age'), history: joined('relevant_history'), allergies: joined('allergy'), medications: joined('medication'), contact: joined('witness_contact') };

  return WorkspaceIncidentSchema.parse({
    id: c.id, revision: c.revision, synthetic: true,
    sources: c.sources.map(s => ({ id: s.id, type: s.type, label: s.label, capturedAt: s.capturedAt, eventTime: s.eventTime, text: s.text, origin: s.origin, limitation: s.limitation })),
    claims: c.claims, corrections: [],
    patient: { ...c.patient, context: Object.values(context).some(v => v !== null) ? context : undefined },
    handoffs: c.handoffs.map(fromCanonicalHandoff),
    observations, measurements, careEvents, timelineEvents, feedback, knowledgeReferences, observationCorrections
  });
}

const UNCERTAINTY_STATE = { unknown: 'unknown', not_documented: 'not_documented', not_performed: 'not_obtained', approximate: 'unresolved', conflicting: 'unresolved' } as const;
function mapDraft(d: Pick<CanonicalDraft, 'revision' | 'sections' | 'sourceIds' | 'uncertainties'>): HandoffDraft {
  return {
    revision: d.revision, mode: 'platform', sourceIds: d.sourceIds,
    sections: d.sections.map(s => ({ id: s.id, title: s.title, items: s.items.map(i => ({ text: i.text, sourceIds: i.sourceIds, note: null })) })),
    uncertainties: d.uncertainties.map(u => ({ label: u.topic, state: UNCERTAINTY_STATE[u.state], detail: u.text }))
  };
}
export function fromCanonicalDraft(raw: unknown): HandoffDraft | null {
  const parsed = CanonicalDraftSchema.safeParse(raw);
  return parsed.success ? mapDraft(parsed.data) : null;
}
function fromCanonicalHandoff(h: CanonicalHandoff) {
  return { version: h.version, revision: h.revision, reviewedAt: h.reviewedAt, reviewedBy: h.reviewedBy, text: h.text, kind: h.kind, amendsVersion: h.amendsVersion, changeSummary: h.changeSummary, draft: mapDraft(h) };
}

// ---- outgoing ----------------------------------------------------------------------------------
export function toObservationRequest(i: ObservationInput) {
  return { requestId: i.requestId, baseRevision: i.baseRevision, text: i.text, observedAt: i.observedAt, category: OBS_CATEGORY_IN[i.category], reportedBy: i.category === 'account' ? 'witness' : 'crew', inputMode: INPUT_IN[i.inputMode] };
}

/** Returns the platform route and body. Air temperature and humidity are environment readings, not measurements. */
export function toMeasurementRequest(i: MeasurementInput): { route: 'measurements' | 'environment-readings'; body: Record<string, unknown> } {
  const meta = { requestId: i.requestId, baseRevision: i.baseRevision, recordedBy: i.recordedBy };
  if (i.kind === 'ambientTemperature' || i.kind === 'humidity') {
    return { route: 'environment-readings', body: { ...meta, kind: i.kind === 'humidity' ? 'relative_humidity' : 'ambient_temperature', value: i.value, unit: i.unit, measuredAt: i.eventTime, method: 'unknown' } };
  }
  const kind = KIND_IN[i.kind];
  const method = i.method?.trim().toLowerCase().replace(/\s+/g, '_') ?? null;
  const site = kind !== 'body_temperature' ? null : !method ? 'unknown' : method === 'temporal' ? 'temporal_artery' : SITES.has(method) ? method : 'other';
  const obtained = i.status === 'obtained';
  return {
    route: 'measurements',
    body: {
      ...meta, kind, obtained, value: obtained ? i.value : null, diastolic: obtained && kind === 'blood_pressure' ? i.value2 : null, unit: i.unit, site,
      device: i.device, deviceClass: 'unknown', measuredAt: i.eventTime, coolingPhase: PHASE_IN[i.coolingPhase], note: i.note
    }
  };
}

export function toCareEventRequest(i: CareEventInput) {
  return {
    requestId: i.requestId, baseRevision: i.baseRevision, recordedBy: i.recordedBy, kind: CARE_IN[i.category],
    description: i.category === 'transport' ? `Transport: ${i.action}` : i.action, performance: 'performed', startedAt: i.startedAt, endedAt: i.endedAt, response: i.note
  };
}

export function toTimelineEventRequest(i: TimelineEventInput) {
  const known = i.time !== null && i.certainty !== 'unknown';
  return {
    requestId: i.requestId, baseRevision: i.baseRevision, kind: TIME_IN[i.kind], time: known ? i.time : null,
    certainty: !known ? 'unknown' : i.certainty === 'recorded' ? 'recorded' : 'approximate',
    reportedBy: i.certainty === 'reported' ? 'other' : 'crew', note: i.note
  };
}
