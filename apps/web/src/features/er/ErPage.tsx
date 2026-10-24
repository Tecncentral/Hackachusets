// Receiving (ER) view. This is a simulated handoff display: no hospital system is connected. It
// shows only the handoff the crew has reviewed and shared. New information recorded after that
// review is surfaced as an amendment notice, not silently merged. No fetching happens here — the
// shell polls the platform and passes the latest incident in through props.
import type { WorkspaceHandoff, WorkspaceIncident, WorkspaceSource } from '../../platform';
import { clock } from '../../platform/time';
import { HandoffDocument, downloadHandoff, downloadTextHandoff, type HandoffMeta } from './HandoffDocument';
import './er.css';

function handoffMeta(handoff: WorkspaceHandoff): HandoffMeta {
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

/** Sources relevant to a text-only handoff: those referenced by id in the text, plus wearables. */
function textSources(incident: WorkspaceIncident, text: string): WorkspaceSource[] {
  const out: WorkspaceSource[] = [];
  const seen = new Set<string>();
  for (const s of incident.sources) {
    if ((text.includes(s.id) || s.type === 'wearable') && !seen.has(s.id)) {
      seen.add(s.id);
      out.push(s);
    }
  }
  return out;
}

export function ErPage({ incident }: { incident: WorkspaceIncident }) {
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
            Version {latest.version} · reviewed by {latest.reviewedBy} at {clock(latest.reviewedAt)}
          </p>

          {latest.revision !== incident.revision && (
            <p className="er-amendment alert alert-attn no-print" role="status">
              New information has been recorded since this version was reviewed; an amendment has not been shared yet.
            </p>
          )}

          <div className="er-actions no-print">
            <button type="button" className="btn btn-secondary" onClick={() => window.print()}>Print</button>
            {latest.draft ? (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => downloadHandoff(
                  { draft: latest.draft!, incident, meta: handoffMeta(latest) },
                  `handoff-v${latest.version}.html`
                )}
              >
                Download HTML
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => downloadTextHandoff(
                  `Crew-reviewed handoff — version ${latest.version}`,
                  latest.text,
                  `handoff-v${latest.version}.html`
                )}
              >
                Download HTML
              </button>
            )}
          </div>

          {latest.draft ? (
            <HandoffDocument draft={latest.draft} incident={incident} meta={handoffMeta(latest)} />
          ) : (
            <div>
              <p className="er-textnote">Platform-generated text (structured sections not provided by this platform version)</p>
              <pre>{latest.text}</pre>
              <h2>Sources</h2>
              <ul className="er-srclist">
                {textSources(incident, latest.text).map(s => (
                  <li key={s.id}>
                    <strong>{s.label}</strong>
                    {s.eventTime ? ` · ${clock(s.eventTime)}` : ''}: {s.text}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {earlier.length > 0 && (
            <details className="er-earlier no-print">
              <summary>Earlier reviewed versions ({earlier.length})</summary>
              {earlier.map(h => (
                <pre key={h.version}>Version {h.version} · reviewed by {h.reviewedBy} at {clock(h.reviewedAt)}{'\n\n'}{h.text}</pre>
              ))}
            </details>
          )}
        </article>
      )}
    </section>
  );
}
