import { useId, useState } from 'react';
import { useAction, useIncidentState, type Incident } from '../../../platform';

/**
 * Optional patient association. Matching only adds profile and wearable context; it is never
 * required to document or hand off. Shown as a disclosure so it stays out of the way until needed.
 */
export function PatientMatch({ incident }: { incident: Incident }) {
  const { platform } = useIncidentState();
  const match = useAction();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const { sharing } = incident.patient;
  const panelId = useId();
  const codeId = useId();
  const hintId = useId();

  return <div className="ws-summary-match">
    <button
      type="button"
      className="btn btn-quiet ws-summary-match-toggle"
      aria-expanded={open}
      aria-controls={panelId}
      onClick={() => setOpen(o => !o)}
    >Identify patient (optional)</button>

    {open && <div id={panelId} className="ws-summary-match-panel">
      <p>
        Identifying the patient adds their profile and any wearable context to this incident. It is
        never required to document observations or to hand off — you can do all of that now.
      </p>
      <form
        className="ws-summary-match-form"
        onSubmit={e => { e.preventDefault(); void match.run(() => platform.match(code.trim())); }}
      >
        <div className="ws-summary-match-field">
          <label htmlFor={codeId}>Demo patient code</label>
          <input
            id={codeId}
            className="field"
            value={code}
            onChange={e => setCode(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            aria-describedby={hintId}
          />
          <p id={hintId} className="ws-summary-hint">
            {sharing
              ? 'Shown on the patient’s demo sharing page. Not production authentication.'
              : 'Emergency sharing is off for this demo patient. Turn it on in “Patient sharing”.'}
          </p>
        </div>
        <div className="ws-summary-match-actions">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={!sharing}
            onClick={() => setCode(incident.patient.id)}
          >Use demo code</button>
          <button
            type="submit"
            className="btn"
            disabled={match.pending || !sharing || !code.trim()}
          >Confirm this is the patient</button>
        </div>
        {match.error && <p role="alert" className="text-error">Not confirmed: {match.error.message}</p>}
      </form>
    </div>}
  </div>;
}
