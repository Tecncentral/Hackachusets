import { useEffect, useState } from 'react';
import { errorMessage, useIncidentState, type HandoffDraft, type WorkspaceIncident } from '../../platform';

/**
 * The handoff draft for the incident's current revision, fetched through the adapter (platform
 * GET /handoff-draft, or the labeled website grouping when that endpoint is unavailable).
 * Unresolved counts and lists come from this draft, not from separate UI logic.
 */
export function useHandoffDraft(incident: WorkspaceIncident) {
  const { platform } = useIncidentState();
  const [draft, setDraft] = useState<HandoffDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const key = `${incident.revision}|${incident.patient.matched}|${incident.feedback.map(f => `${f.id}:${f.status}:${f.revision}`).join()}`;
  useEffect(() => {
    let live = true;
    platform.getHandoffDraft(incident).then(d => { if (live) { setDraft(d); setError(null); } }, e => { if (live) setError(errorMessage(e)); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platform, key]);
  return { draft, error, current: draft !== null && draft.revision === incident.revision };
}
