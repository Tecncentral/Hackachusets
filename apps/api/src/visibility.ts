import type { Incident } from '@scenebrief/contracts';

// Patient-profile and wearable sources describe a specific person. Until the crew confirms the patient
// association, they must not be attributed to the patient in the handoff or sent for evaluation.
const PROFILE_SOURCE_TYPES = new Set(['wearable', 'patient_profile']);

export function visibleRecord(incident: Incident): Incident {
  if (incident.patient.matched) return incident;
  const hidden = new Set(incident.sources.filter(s => PROFILE_SOURCE_TYPES.has(s.type)).map(s => s.id));
  // Keep a record if it has at least one non-profile source (or none); drop hidden source links.
  const filter = <T extends { sourceIds: string[] }>(records: T[]): T[] => records
    .filter(r => r.sourceIds.length === 0 || r.sourceIds.some(id => !hidden.has(id)))
    .map(r => ({ ...r, sourceIds: r.sourceIds.filter(id => !hidden.has(id)) }));
  return {
    ...incident,
    sources: incident.sources.filter(s => !hidden.has(s.id)),
    claims: filter(incident.claims),
    observations: filter(incident.observations),
    measurements: filter(incident.measurements),
    careEvents: filter(incident.careEvents),
    timelineEvents: filter(incident.timelineEvents),
    contextFacts: filter(incident.contextFacts),
    environmentReadings: filter(incident.environmentReadings),
    wearableRecords: [],
  };
}
