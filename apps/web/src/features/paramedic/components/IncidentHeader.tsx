import { useState } from 'react';
import { useAction, useIncidentState, type WorkspaceIncident } from '../../../platform';
import { clock } from '../../../platform/time';

/** Dispatch brief + deliberate patient association. Patient context appears only after the crew confirms the match. */
export function IncidentHeader({ incident }: { incident: WorkspaceIncident }) {
  const { platform } = useIncidentState();
  const match = useAction();
  const [code, setCode] = useState('');
  const dispatch = incident.sources.find(s => s.type === 'dispatch');
  const { matched, sharing, context } = incident.patient;

  return <section className="card ws-incident" aria-labelledby="ws-inc-h">
    <p className="ws-label">Incident · {incident.id}</p>
    <h1 id="ws-inc-h" className="ws-title">{dispatch ? capitalize(dispatch.text.replace(/^Emergency call at [^:]+:\d\d [A-Z]+: /, '').replace(/\.$/, '')) : 'Incident'}</h1>
    <p className="ws-hint">{dispatch ? `${dispatch.label} · call ${clock(dispatch.eventTime)} EDT · ` : ''}Revision {incident.revision}</p>
    {matched ? <div className="ws-patient">
      <p><span className="tag tag-ok">Matched by crew</span> <strong>{incident.patient.name}</strong></p>
      {context && <dl className="ws-context">
        {([['Age', context.age], ['History', context.history], ['Allergies', context.allergies], ['Medications', context.medications], ['Contact', context.contact]] as const).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v ?? 'Not documented'}</dd></div>)}
      </dl>}
    </div> : <form className="ws-form" onSubmit={e => { e.preventDefault(); void match.run(() => platform.match(code.trim())); }}>
      <p><strong>Patient not matched.</strong> History stays hidden until the crew confirms who the patient is; the caller is not assumed to be the patient. You can document observations after confirming.</p>
      <div className="ws-row">
        <div className="ws-field">
          <label htmlFor="ws-code">Demo patient code</label>
          <input id="ws-code" value={code} onChange={e => setCode(e.target.value)} autoComplete="off" spellCheck={false} aria-describedby="ws-code-hint" />
          <p id="ws-code-hint" className="ws-hint">{sharing ? 'Shown on the patient’s demo sharing page. Not production authentication.' : 'Emergency sharing is off for this demo patient. Turn it on in “Patient sharing”.'}</p>
        </div>
      </div>
      <div className="ws-actions">
        <button type="button" className="btn btn-secondary" disabled={!sharing} onClick={() => setCode(incident.patient.id)}>Use demo code</button>
        <button type="submit" className="btn" disabled={match.pending || !sharing || !code.trim()}>Confirm this is the patient</button>
      </div>
      {match.error && <p role="alert" className="text-error">Not confirmed: {match.error.message}</p>}
    </form>}
  </section>;
}

const capitalize = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
