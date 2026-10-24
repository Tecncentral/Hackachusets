// Patient-linked context (profile, wearable records and the events derived from them) is shown only
// after the crew confirms the patient association. Crew documentation is never hidden or blocked.
import type { WorkspaceIncident } from './boundary';

export function patientScoped(incident: WorkspaceIncident): WorkspaceIncident {
  if (incident.patient.matched) return incident;
  const hidden = new Set(incident.sources.filter(s => s.type === 'wearable').map(s => s.id));
  return {
    ...incident,
    patient: { ...incident.patient, context: undefined },
    sources: incident.sources.filter(s => !hidden.has(s.id)),
    measurements: incident.measurements.filter(m => m.sourceKind !== 'wearable' && !hidden.has(m.sourceId)),
    timelineEvents: incident.timelineEvents.filter(t => !t.sourceIds.some(id => hidden.has(id))),
    feedback: incident.feedback.map(f => ({ ...f, evidenceSourceIds: f.evidenceSourceIds.filter(id => !hidden.has(id)) }))
  };
}
