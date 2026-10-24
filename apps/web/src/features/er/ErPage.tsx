// Receiving (ER) view. This is a simulated handoff display: no hospital system is connected. It
// shows only the handoff the crew reviewed and shared — the platform's frozen snapshot, rendered with
// the same document component as the crew's review. New information recorded after that review is
// surfaced as an amendment notice, not silently merged. No fetching happens here — the shell polls
// the platform and passes the latest incident in through props.
import type { Handoff, Incident } from '../../platform';
import { clock } from '../../platform/time';
import { HandoffDocument, downloadHandoff, type HandoffMeta } from './HandoffDocument';
import './er.css';

function handoffMeta(handoff: Handoff): HandoffMeta {
  return {
    title: `Crew-reviewed handoff — version ${handoff.version}`,
    status: 'Reviewed and shared',
    reviewedBy: handoff.reviewedBy,
    reviewedAt: handoff.reviewedAt,
    version: handoff.version,
    // A shared handoff is, by definition, crew-approved for its own revision.
    approval: { approved: true, revision: handoff.revision, at: handoff.reviewedAt }
  };
}

export function ErPage({ incident }: { incident: Incident }) {
  const latest = incident.handoffs.at(-1);
  const earlier = incident.handoffs.slice(0, -1);

  return (
    <section className="er">
      <header className="er-head no-print">
        <h1>Receiving view — simulated; no hospital system is connected.</h1>
        <p className="text-quiet">Refreshes every two seconds while this page is open. Only crew-reviewed handoffs are shown here.</p>
      </header>

      {!latest ? (
        <article className="card er-empty">
          <p>No reviewed handoff has been shared yet.</p>
        </article>
      ) : (
        <article className="card">
          <p className="er-meta no-print">
            Version {latest.version}{latest.kind === 'amendment' ? ` (amends v${latest.amendsVersion})` : ''} · reviewed by {latest.reviewedBy} at {clock(latest.reviewedAt)} · revision {latest.revision}
          </p>

          {latest.revision !== incident.revision && (
            <p className="er-amendment alert alert-attn no-print" role="status">
              New information has been recorded since this version was reviewed; an amendment has not been shared yet.
            </p>
          )}

          <div className="er-actions no-print">
            <button type="button" className="btn btn-secondary" onClick={() => window.print()}>Print</button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => downloadHandoff({ doc: latest, incidentId: incident.id, sources: incident.sources, meta: handoffMeta(latest) }, `handoff-v${latest.version}.html`)}
            >
              Download HTML
            </button>
          </div>

          <HandoffDocument doc={latest} incidentId={incident.id} sources={incident.sources} meta={handoffMeta(latest)} />

          {earlier.length > 0 && (
            <details className="er-earlier no-print">
              <summary>Earlier reviewed versions ({earlier.length})</summary>
              {earlier.map(h => (
                <pre key={h.version}>{h.text}</pre>
              ))}
            </details>
          )}
        </article>
      )}
    </section>
  );
}
