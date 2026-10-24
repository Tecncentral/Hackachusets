import type { HandoffDraft, WorkspaceIncident } from '../../../platform';
import './care.css';

type UncertaintyState = HandoffDraft['uncertainties'][number]['state'];
const STATE_WORD: Record<UncertaintyState, string> = {
  unknown: 'Unknown', not_documented: 'Not documented', not_obtained: 'Not performed', unresolved: 'Unresolved'
};
const STATE_CHIP: Record<UncertaintyState, string> = {
  unknown: 'chip-unknown', not_documented: 'chip-notdoc', not_obtained: 'chip-notperf', unresolved: 'chip-attn'
};

/** Right-column handoff card: approval status, the full unresolved list, and a link into the full review. */
export function HandoffCard({ incident, draft, draftError, onReview }: { incident: WorkspaceIncident; draft: HandoffDraft | null; draftError: string | null; onReview: () => void }) {
  const latest = incident.handoffs.at(-1);
  const current = latest?.revision === incident.revision;
  const uncertainties = draft?.uncertainties ?? [];

  return <section className="card ws-hcard" aria-labelledby="ws-hcard-h">
    <div className="ws-hcard-head">
      <h2 id="ws-hcard-h">ER handoff</h2>
    </div>

    <div className="ws-hcard-status">
      {!latest && <span className="text-quiet">Not yet approved</span>}
      {latest && current && <span className="chip chip-ok">Crew approved · version {latest.version} · revision {latest.revision}</span>}
      {latest && !current && <span className="chip chip-attn">Fresh review required — approved revision {latest.revision}, now {incident.revision}</span>}
    </div>

    {draftError && <p role="alert" className="alert alert-crit">Draft not available: {draftError}</p>}
    {!draft && !draftError && <p className="text-quiet">Loading draft…</p>}

    {draft && <div className="ws-hcard-unresolved">
      <p className="caps">Unresolved ({uncertainties.length})</p>
      {uncertainties.length === 0
        ? <p className="text-quiet">None listed.</p>
        : <ul className="ws-hcard-list">
            {uncertainties.map((u, i) => <li key={`${u.label}-${i}`} className="ws-hcard-item">
              <span className="ws-hcard-item-label">{u.label}</span>
              <span className={`chip ${STATE_CHIP[u.state]}`}>{STATE_WORD[u.state]}</span>
              {u.detail && <span className="ws-hcard-item-detail"> {u.detail}</span>}
            </li>)}
          </ul>}
    </div>}

    <div className="ws-hcard-actions">
      <button type="button" className="btn" onClick={onReview}>Review full handoff</button>
    </div>
    <p className="ws-hcard-note">Review is available at any time; it never gates care or transport.</p>
  </section>;
}
