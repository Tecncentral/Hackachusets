import { useAction, useIncidentState, type Incident } from '../../platform';

/**
 * The REAL demo platform setting (POST /incidents/:id/sharing), kept from the earlier patient view.
 * It is what the EMT workspace checks before a crew can match this patient code. It changes only
 * when the person clicks this button — never from the setup flow, the sync, or local choices.
 */
export function PlatformSharing({ incident }: { incident: Incident }) {
  const { platform } = useIncidentState();
  const sharing = useAction();
  const on = incident.patient.sharing;
  return <section className="pt-card pt-platform" aria-labelledby="pt-platform-h">
    <div className="pt-card-body">
      <p className="caps">Platform setting · synthetic demo</p>
      <h2 id="pt-platform-h">Emergency sharing with crews</h2>
      <p className="pt-platform-state" role="status">
        <span className={`chip ${on ? 'chip-ok' : 'chip-notdoc'}`}>{on ? 'On' : 'Off'}</span>{' '}
        {on ? 'A crew that enters your demo patient code and confirms it can add your synthetic profile and wearable background to their incident.' : 'Crews cannot match your profile to an incident.'}
      </p>
      <button type="button" className={`btn ${on ? 'btn-secondary' : ''}`} disabled={sharing.pending} onClick={() => void sharing.run(() => platform.setSharing(!on))}>
        {sharing.pending ? 'Saving…' : on ? 'Turn off emergency sharing' : 'Turn on emergency sharing'}
      </button>
      {sharing.error && <p role="alert" className="text-error">Not changed: {sharing.error.message}</p>}
      <p className="pt-hint">Demo patient code <code>{incident.patient.id}</code>. The crew enters this code and confirms the association. This is not production authentication.</p>
      <p className="pt-hint">Your per-field choices below are kept in this browser only. The platform does not enforce them: when sharing is on and a crew confirms the match, the whole synthetic profile is available to that incident.</p>
    </div>
  </section>;
}
