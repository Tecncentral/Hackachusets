import { IncidentSchema, IncidentId, type Incident } from '@scenebrief/contracts';
export function createDemoIncident(): Incident {
 return IncidentSchema.parse({ id: IncidentId, revision: 0, synthetic: true,
 patient: { id: 'patient-demo-01', name: 'Alex Morgan (fictional)', sharing: false, matched: false },
 sources: [
 { id: 'workout', type: 'wearable', label: 'Synthetic workout', capturedAt: '2026-10-24T14:43:00Z', eventTime: '2026-10-24T13:05:00Z', text: 'Workout record begins at 09:05 EDT. Does not establish illness onset.' },
 { id: 'fall', type: 'wearable', label: 'Synthetic fall fixture — integration unverified', capturedAt: '2026-10-24T14:43:00Z', eventTime: '2026-10-24T14:42:00Z', text: 'Device-reported fall at 10:42 EDT. Collapse and loss of consciousness unconfirmed.' },
 { id: 'dispatch', type: 'dispatch', label: 'Simulated dispatch', capturedAt: '2026-10-24T14:44:00Z', eventTime: '2026-10-24T14:44:00Z', text: 'Emergency call at 10:44 EDT: person found down near running trail.' }
 ], claims: [{ id: 'collapse-unknown', field: 'collapseTime', value: null, sourceIds: [], status: 'unknown', recordedAt: '2026-10-24T14:55:00Z' }], corrections: [], handoffs: [] });
}
