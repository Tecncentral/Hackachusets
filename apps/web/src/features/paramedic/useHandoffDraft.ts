import { useCallback, useEffect, useState } from 'react';
import { errorMessage, useIncidentState, type HandoffDraft, type Incident } from '../../platform';

/**
 * The platform's handoff draft (GET /handoff-draft) for the incident as last seen. It is re-read when
 * the content can have changed: a new revision, a patient-match change (which does not bump the
 * revision), or a reset. Unresolved counts and lists come from this draft, not from UI logic.
 */
export function useHandoffDraft(incident: Incident) {
  const { platform } = useIncidentState();
  const [draft, setDraft] = useState<HandoffDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const key = `${incident.revision}|${incident.patient.matched}|${incident.sources.length}|${incident.scenario.variant}`;
  const reload = useCallback(async () => {
    try { const d = await platform.getHandoffDraft(); setDraft(d); setError(null); return d; } catch (e) { setError(errorMessage(e)); return null; }
  }, [platform]);
  useEffect(() => {
    let live = true;
    platform.getHandoffDraft().then(d => { if (live) { setDraft(d); setError(null); } }, e => { if (live) setError(errorMessage(e)); });
    return () => { live = false; };
  }, [platform, key]);
  return { draft, error, reload, setDraft, current: draft !== null && draft.revision === incident.revision && draft.patientMatched === incident.patient.matched };
}
