// Patient-linked context (profile and wearable sources, and records that rely only on them) is shown
// only after the crew confirms the patient association. This is the platform's own rule
// (apps/api/src/visibility.ts), reused so the workspace shows exactly what the handoff and the
// assistant see. Crew documentation is never hidden or blocked.
import { visibleRecord } from '../../../api/src/visibility';
import type { Incident } from './boundary';

export function patientScoped(incident: Incident): Incident {
  return visibleRecord(incident);
}
