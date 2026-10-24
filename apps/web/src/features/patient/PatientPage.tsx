import { useAction, useIncidentState, type WorkspaceIncident } from '../../platform';

/** Preserved demo sharing toggle. The patient portal is not a priority for the EMT website. */
export function PatientPage({ incident }: { incident: WorkspaceIncident }) {
  const { platform } = useIncidentState();
  const sharing = useAction();
  return <section className="card" style={{ maxWidth: 640 }}>
    <h1>Emergency sharing (demo)</h1>
    <p>{incident.patient.name}</p>
    <p className="text-quiet">Wearable records are synthetic fixtures. No device account is connected and nobody is monitoring this profile.</p>
    <label className="app-switch"><input type="checkbox" checked={incident.patient.sharing} disabled={sharing.pending}
      onChange={e => { const v = e.target.checked; void sharing.run(() => platform.setSharing(v)); }} /> Enable fictional emergency sharing</label>
    {sharing.error && <p role="alert" className="text-error">{sharing.error.message}</p>}
    <h2>Demo patient code</h2>
    <p><code>{incident.patient.id}</code></p>
    <p className="text-quiet">The crew enters this code and confirms the association. This is not production authentication.</p>
  </section>;
}
