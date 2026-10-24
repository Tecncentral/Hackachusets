import {
  EvaluateRequest as AssistantRequestSchema, EvaluateResponse as AssistantResponseSchema, referenceById,
  type EvaluateRequest as AssistantRequest, type EvaluateResponse as AssistantResponse,
} from '@scenebrief/ai';
import { EvaluateResponseSchema, type EvaluateRequest, type EvaluateResponse, type KnowledgeReference, type Measurement, type TimelineEvent } from '@scenebrief/contracts';

// Platform-owned adapter between the canonical incident snapshot (@scenebrief/contracts)
// and the correction assistant's /evaluate contract (@scenebrief/ai, workstream 02).
// The platform keeps the canonical schema; this is the only place field names are translated.

const MEASUREMENT_KIND: Record<Measurement['kind'], AssistantRequest['measurements'][number]['kind']> = {
  body_temperature: 'temperature', skin_temperature: 'skinTemperatureDeviation', heart_rate: 'heartRate', blood_pressure: 'bloodPressure',
  respiratory_rate: 'respiratoryRate', spo2: 'spo2', glucose: 'glucose',
};
const TIMELINE_KIND: Record<TimelineEvent['kind'], string> = {
  exertion_start: 'exertionStart', exertion_end: 'exertionEnd', symptom_onset: 'symptomOnset', last_known_normal: 'lastKnownWell',
  collapse: 'collapse', discovery: 'discovery', device_fall_event: 'deviceFall', emergency_call: 'emergencyCall', crew_arrival: 'crewArrival',
  patient_contact: 'patientContact', transport_start: 'transportStart', hospital_arrival: 'hospitalArrival', handoff: 'handoff',
};
const COOLING: Record<Measurement['coolingPhase'], boolean | null> = { before_cooling: true, during_cooling: false, after_cooling: false, unknown: null };
const PERSON = new Set(['witness', 'patient', 'bystander']);

/** Canonical (already current-only, matching-filtered) snapshot → assistant request. */
export function toAssistantRequest(req: EvaluateRequest): AssistantRequest {
  const measurements: AssistantRequest['measurements'] = req.measurements.map(m => {
    const site = m.site && m.site !== 'unknown' ? m.site : null; // "unknown" site stays missing
    return {
      id: m.id, kind: MEASUREMENT_KIND[m.kind],
      value: m.kind === 'blood_pressure' ? `${m.value}/${m.diastolic}` : String(m.value),
      unit: m.unit,
      method: m.kind === 'body_temperature' ? site : m.kind === 'skin_temperature' ? 'skin probe or consumer wearable skin' : m.device,
      site, eventTime: m.measuredAt, beforeCooling: COOLING[m.coolingPhase], sourceId: m.sourceIds[0] ?? null,
    };
  });
  // Environmental readings and wearable skin-temperature deviation are context, never body temperature.
  for (const e of req.environmentReadings) {
    if (e.kind === 'wbgt') continue;
    measurements.push({ id: e.id, kind: e.kind === 'ambient_temperature' ? 'ambientTemperature' : 'humidity', value: String(e.value), unit: e.unit, method: e.method, site: null, eventTime: e.measuredAt, beforeCooling: null, sourceId: e.sourceIds[0] ?? null });
  }
  for (const w of req.wearableRecords) {
    if (w.metric !== 'skin_temperature_deviation' || w.value === null) continue;
    measurements.push({ id: w.id, kind: 'skinTemperatureDeviation', value: String(w.value), unit: w.unit, method: 'consumer wearable skin', site: null, eventTime: w.endTime ?? w.startTime, beforeCooling: null, sourceId: w.sourceId });
  }
  return AssistantRequestSchema.parse({
    incidentId: req.incidentId,
    revision: req.revision,
    observations: req.observations.map(o => ({ id: o.id, text: o.text, observedAt: o.observedAt, sourceIds: o.sourceIds })),
    measurements,
    sources: req.sources.map(s => ({ id: s.id, type: s.type, label: s.label, text: s.text })),
    // Only care that was actually performed is passed as an action.
    careEvents: req.careEvents.filter(c => c.performance === 'performed').map(c => ({
      id: c.id, action: `${c.kind}: ${c.description}${c.coolingMethod ? ` (${c.coolingMethod.replaceAll('_', ' ')})` : ''}`, startedAt: c.startedAt, stoppedAt: c.endedAt,
    })),
    timelineEvents: req.timelineEvents.map(t => ({
      id: t.id, kind: TIMELINE_KIND[t.kind], time: t.time,
      certainty: t.certainty === 'unknown' ? 'unknown' : t.certainty === 'approximate' ? 'estimated' : PERSON.has(t.reportedBy) ? 'reported' : 'recorded',
      sourceIds: t.sourceIds,
    })),
    protocolContext: { agency: req.protocolContext.agencyProtocolId, protocolConfirmed: req.protocolContext.applicability === 'configured' },
  });
}

function toKnowledgeReference(id: string): KnowledgeReference | null {
  const r = referenceById(id);
  if (!r) return null;
  return {
    id: r.id, title: r.title, url: r.url, versionDate: r.publishedOn, section: r.locator.slice(0, 200), passage: r.passage.slice(0, 600),
    applicability: r.applicability.slice(0, 300),
    // The registry has no clinician-reviewed entries; everything requires clinical review.
    reviewStatus: 'unreviewed',
  };
}

/** Assistant response → canonical response (validated). Throws if it cannot be represented. */
export function fromAssistantResponse(res: AssistantResponse): EvaluateResponse {
  const ids = [...new Set(res.feedback.flatMap(f => f.knowledgeReferenceIds))];
  return EvaluateResponseSchema.parse({
    incidentId: res.incidentId,
    revision: res.revision,
    mode: res.mode === 'rules-only' ? 'deterministic' : 'hybrid',
    feedback: res.feedback.slice(0, 10),
    knowledgeReferences: ids.map(toKnowledgeReference).filter((r): r is KnowledgeReference => r !== null),
  });
}

export { AssistantResponseSchema };
