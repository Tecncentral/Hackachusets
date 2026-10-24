// Print-friendly, exportable handoff document. It renders the structured draft the crew reviewed
// (sections, source attribution, and explicit uncertainties) without adding any clinical
// interpretation. Unknown / not documented / not obtained are kept distinct, and every source in
// the draft is listed with its own attribution in the Sources appendix.
import { renderToStaticMarkup } from 'react-dom/server';
import type { HandoffDraft, WorkspaceIncident, WorkspaceSource } from '../../platform';
import { clock } from '../../platform/time';
import './er.css';

export interface HandoffMeta {
  title: string;
  status: string;
  reviewedBy?: string;
  reviewedAt?: string;
  version?: number;
}

export interface HandoffDocumentProps {
  draft: HandoffDraft;
  incident: WorkspaceIncident;
  meta: HandoffMeta;
}

const UNCERTAINTY_LABEL: Record<HandoffDraft['uncertainties'][number]['state'], string> = {
  unknown: 'Unknown',
  not_documented: 'Not documented',
  not_obtained: 'Not obtained',
  unresolved: 'Unresolved question'
};

const SOURCE_TYPE_LABEL: Record<WorkspaceSource['type'], string> = {
  wearable: 'Consumer wearable',
  dispatch: 'Dispatch',
  voice: 'Voice note',
  crew: 'Crew entry',
  reference: 'Reference'
};

/** Short, human-visible source reference: first 8 characters of the id. */
export function shortRef(sourceId: string): string {
  return sourceId.slice(0, 8);
}

/** Stable, DOM-safe anchor id for a source within this document. */
function sourceAnchor(sourceId: string): string {
  return `hd-src-${sourceId.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
}

export function HandoffDocument({ draft, incident, meta }: HandoffDocumentProps) {
  // Every source listed in the draft that we can find in the incident record, in draft order.
  const sources = draft.sourceIds
    .map(id => incident.sources.find(s => s.id === id))
    .filter((s): s is WorkspaceSource => s !== undefined);
  const known = new Set(sources.map(s => s.id));

  return (
    <article className="hd" aria-label={meta.title}>
      <p className="hd-banner">SYNTHETIC DEMO</p>
      <h1>{meta.title}</h1>
      <p className="hd-review">{incident.patient.name}</p>
      <dl className="hd-review">
        <div>
          <dt>Revision</dt>
          <dd>{draft.revision}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{meta.status}</dd>
        </div>
        {meta.version !== undefined && (
          <div>
            <dt>Version</dt>
            <dd>{meta.version}</dd>
          </div>
        )}
        {meta.reviewedBy && (
          <div>
            <dt>Reviewed by</dt>
            <dd>{meta.reviewedBy}</dd>
          </div>
        )}
        {meta.reviewedAt && (
          <div>
            <dt>Reviewed at</dt>
            <dd>{clock(meta.reviewedAt)}</dd>
          </div>
        )}
      </dl>

      {draft.mode === 'website-grouped' && (
        <p className="hd-grouped">Grouped by the website because the platform draft endpoint is unavailable.</p>
      )}

      {draft.sections.map(section => (
        <section key={section.id}>
          <h2>{section.title}</h2>
          {section.items.length === 0 ? (
            <p className="hd-empty">Not documented</p>
          ) : (
            <ul className="hd-list">
              {section.items.map((item, i) => (
                <li key={i}>
                  {item.text}
                  {item.note ? <span className="hd-note"> [{item.note}]</span> : null}
                  {item.sourceIds.length > 0 && (
                    <span className="hd-refs">
                      {item.sourceIds.map(id =>
                        known.has(id) ? (
                          <a key={id} className="hd-ref" href={`#${sourceAnchor(id)}`} title={`Source ${shortRef(id)}`}>
                            {shortRef(id)}
                          </a>
                        ) : (
                          <span key={id} className="hd-ref" title={`Source ${shortRef(id)}`}>
                            {shortRef(id)}
                          </span>
                        )
                      )}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}

      <section>
        <h2>Uncertain / not documented</h2>
        {draft.uncertainties.length === 0 ? (
          <p className="hd-empty">None listed</p>
        ) : (
          <dl className="hd-unc">
            {draft.uncertainties.map((u, i) => (
              <div key={i}>
                <dt>
                  {u.label}: <span className="hd-state">{UNCERTAINTY_LABEL[u.state]}</span>
                </dt>
                {u.detail && <dd>{u.detail}</dd>}
              </div>
            ))}
          </dl>
        )}
      </section>

      <section>
        <h2>Sources</h2>
        {sources.length === 0 ? (
          <p className="hd-empty">No sources attached</p>
        ) : (
          <div className="hd-sources">
            {sources.map(s => (
              <div key={s.id} id={sourceAnchor(s.id)} className="hd-source">
                <h3>
                  {s.label} <span className="hd-note">({shortRef(s.id)})</span>
                </h3>
                <p className="hd-source-meta">
                  Type: {SOURCE_TYPE_LABEL[s.type]} · Event time: {s.eventTime ? clock(s.eventTime) : 'unknown'} · Captured: {clock(s.capturedAt)}
                </p>
                <p className="hd-source-text">{s.text}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </article>
  );
}

/** Minimal readable print stylesheet duplicating the essential .hd styles for the standalone export. */
const EXPORT_STYLE = `
  :root { color-scheme: light; }
  body { margin: 24px; max-width: 820px; color: #142e32; background: #fff;
    font: 16px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
  .hd-banner { display: inline-block; font-size: .75rem; font-weight: 700; letter-spacing: .04em;
    padding: 3px 10px; border-radius: 999px; background: #fff4d5; border: 1px solid #8a6a1c; color: #142e32; margin: 0 0 10px; }
  h1 { font-size: 1.4rem; margin: 0 0 4px; }
  h2 { font-size: 1.1rem; margin: 18px 0 6px; border-bottom: 1px solid #cfdcd7; padding-bottom: 3px; }
  h3 { font-size: 1rem; margin: 0 0 2px; }
  .hd-review { color: #46615b; margin: 0 0 6px; }
  .hd-review dt { font-weight: 650; }
  ul.hd-list { margin: 4px 0 0; padding-left: 20px; }
  ul.hd-list li { margin: 6px 0; }
  .hd-note { color: #46615b; }
  .hd-empty { color: #46615b; font-style: italic; }
  .hd-ref { font-size: .8rem; font-weight: 650; text-decoration: none; color: #175d55; margin-left: 4px; white-space: nowrap; }
  .hd-unc dt { font-weight: 650; margin-top: 6px; }
  .hd-unc dd { margin: 0; color: #46615b; }
  .hd-state { font-weight: 650; color: #142e32; }
  .hd-source { margin: 0 0 12px; padding: 0 0 10px; border-bottom: 1px solid #cfdcd7; }
  .hd-source-meta { color: #46615b; font-size: .9rem; margin: 0 0 2px; }
  .hd-grouped { margin: 10px 0 0; padding: 8px 12px; border-radius: 8px; background: #e3f1ec; border: 1px solid #8fb9ab; color: #142e32; font-size: .9rem; }
  p { overflow-wrap: anywhere; }
  @media print { body { margin: 0; } }
`;

/** A complete standalone HTML file string for the handoff document. */
export function handoffHtml(props: HandoffDocumentProps): string {
  const body = renderToStaticMarkup(<HandoffDocument {...props} />);
  const title = escapeHtml(props.meta.title);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>${EXPORT_STYLE}</style>
</head>
<body>
${body}
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

/** Build a standalone HTML file and trigger a browser download, cleaning up the object URL. */
export function downloadHandoff(props: HandoffDocumentProps, filename: string): void {
  const html = handoffHtml(props);
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Wrap already-provided platform text in a simple standalone HTML file (for text-only handoffs). */
export function textHandoffHtml(title: string, text: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${EXPORT_STYLE}</style>
</head>
<body>
<p class="hd-banner">SYNTHETIC DEMO</p>
<h1>${escapeHtml(title)}</h1>
<pre style="white-space: pre-wrap; overflow-wrap: anywhere; font: 14px/1.5 ui-monospace, Menlo, monospace;">${escapeHtml(text)}</pre>
</body>
</html>`;
}

export function downloadTextHandoff(title: string, text: string, filename: string): void {
  const blob = new Blob([textHandoffHtml(title, text)], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
