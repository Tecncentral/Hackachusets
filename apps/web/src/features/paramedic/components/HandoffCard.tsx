import { sharedVersionFor, type HandoffDraft, type Incident } from '../../../platform';
import { UNCERTAINTY_CHIP, UNCERTAINTY_LABEL } from '../../../platform/labels';
import './care.css';

/** Right-column handoff card: approval status, the full unresolved list from the platform draft, and a link into the full review. */
export function HandoffCard({ incident, draft, draftError, onReview }: { incident: Incident; draft: HandoffDraft | null; draftError: string | null; onReview: () => void }) {
  const latest = incident.handoffs.at(-1);
  const shared = draft ? sharedVersionFor(incident, draft) : undefined;
  const uncertainties = draft?.uncertainties ?? [];

  return <section className="card ws-hcard" aria-labelledby="ws-hcard-h">
    <div className="ws-hcard-head">
      <h2 id="ws-hcard-h" tabIndex={-1}>ER handoff</h2>
    </div>

    <div className="ws-hcard-status">
      {!latest && <span className="text-quiet">Not yet approved</span>}
      {shared && <span className="chip chip-ok">Crew approved · version {shared.version} · revision {shared.revision}</span>}
      {latest && !shared && draft && <span className="chip chip-attn">Fresh review required — version {latest.version} approved at revision {latest.revision}; draft is now revision {draft.revision}</span>}
    </div>

    {draftError && <p role="alert" className="alert alert-crit">Draft not available: {draftError}</p>}
    {!draft && !draftError && <p className="text-quiet">Loading draft…</p>}

    {draft && <div className="ws-hcard-unresolved">
      <p className="caps">Unresolved ({uncertainties.length})</p>
      {uncertainties.length === 0
        ? <p className="text-quiet">None identified from the structured record.</p>
        : <ul className="ws-hcard-list">
            {uncertainties.map((u, i) => <li key={`${u.topic}-${i}`} className="ws-hcard-item">
              <span className="ws-hcard-item-label">{u.topic}</span>
              <span className={`chip ${UNCERTAINTY_CHIP[u.state]}`}>{UNCERTAINTY_LABEL[u.state]}</span>
              <span className="ws-hcard-item-detail"> {u.text}</span>
            </li>)}
          </ul>}
    </div>}

    <div className="ws-hcard-actions">
      <button type="button" className="btn" onClick={onReview}>Review full handoff</button>
    </div>
    <p className="ws-hcard-note">Review is available at any time; it never gates care or transport.</p>
  </section>;
}
