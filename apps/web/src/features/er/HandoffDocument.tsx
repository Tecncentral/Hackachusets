// Print-friendly, exportable handoff document (Trauma Llama "Handoff-Print" design). It renders the
// platform's canonical handoff content — the same `sections` / `uncertainties` / `sourceIds` for the
// draft under review, the approved snapshot and the receiving view — without adding any clinical
// interpretation. Item states (documented / reported / unknown / not documented) are printed as
// words. Single column, near-black ink, >=1px rules, grayscale-legible.
import { renderToStaticMarkup } from 'react-dom/server';
import type { Handoff, HandoffContent, SourceRecord } from '../../platform';
import { SOURCE_TYPE_LABEL, UNCERTAINTY_LABEL } from '../../platform/labels';
import { clock } from '../../platform/time';
import './er.css';

export interface HandoffMeta {
  title: string;
  status: string;
  reviewedBy?: string;
  reviewedAt?: string;
  version?: number;
  /** Approval banner state. Drives the "DRAFT — NOT CREW APPROVED" / "CREW APPROVED" top-right banner. */
  approval?: { approved: boolean; revision: number; at?: string };
}

export interface HandoffDocumentProps {
  /** A HandoffDraft or a reviewed Handoff (same canonical content). */
  doc: HandoffContent & Partial<Pick<Handoff, 'kind' | 'amendsVersion' | 'changeSummary'>>;
  incidentId: string;
  sources: SourceRecord[];
  meta: HandoffMeta;
}

/** Short, human-visible source reference. Fixture ids are already short; generated ids are trimmed. */
export function shortRef(sourceId: string): string {
  return sourceId.startsWith('src-') ? sourceId.slice(4, 12) : sourceId.slice(0, 14);
}

/** Stable, DOM-safe anchor id for a source within this document. */
function sourceAnchor(sourceId: string): string {
  return `hd-src-${sourceId.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
}

function approvalText(meta: HandoffMeta, doc: HandoffContent): string {
  const a = meta.approval;
  if (a && a.approved && a.revision === doc.revision) return `CREW APPROVED · revision ${a.revision}${a.at ? ` · ${clock(a.at)}` : ''}`;
  return 'DRAFT — NOT CREW APPROVED';
}

const STATE_WORD: Record<string, string | null> = { documented: null, reported: 'reported', unknown: 'unknown', not_documented: 'not documented', superseded: 'superseded' };

export function HandoffDocument({ doc, incidentId, sources: all, meta }: HandoffDocumentProps) {
  // Every source listed in the document that we can find in the incident record, in document order.
  const sources = doc.sourceIds.map(id => all.find(s => s.id === id)).filter((s): s is SourceRecord => s !== undefined);
  const known = new Set(sources.map(s => s.id));

  return (
    <article className="hd" aria-label={meta.title}>
      <div className="hd-banner">
        <span>SYNTHETIC DEMO — NOT A REAL PATIENT</span>
        <span>{approvalText(meta, doc)}</span>
      </div>

      <h1 className="hd-title">ER handoff — Trauma Llama</h1>
      <p className="hd-meta">
        Incident <span className="mono">{incidentId}</span> · Revision <span className="mono">{doc.revision}</span>
        {meta.version ? <> · Version <span className="mono">{meta.version}</span>{doc.kind === 'amendment' && doc.amendsVersion ? ` (amends v${doc.amendsVersion})` : ''}</> : null}
        {' '}· Patient association {doc.patientMatched ? 'confirmed' : 'not confirmed'} · Printed{' '}
        <span className="mono">{clock(new Date().toISOString())}</span> · Source tags in [brackets] refer to the source list at the end.
      </p>

      {doc.changeSummary && doc.kind === 'amendment' && doc.changeSummary.length > 0 && (
        <section className="hd-section">
          <h2>Changes since previous version</h2>
          <ul className="hd-list">{doc.changeSummary.map((c, i) => <li key={i}>{c}</li>)}</ul>
        </section>
      )}

      {doc.sections.map(section => (
        <section key={section.id} className="hd-section">
          <h2>{section.title}</h2>
          {section.items.length === 0 ? (
            <p className="hd-empty">Not documented</p>
          ) : (
            <ul className="hd-list">
              {section.items.map((item, i) => (
                <li key={i} data-state={item.state}>
                  {item.text}
                  {STATE_WORD[item.state] ? <span className="hd-note"> [{STATE_WORD[item.state]}]</span> : null}
                  {item.sourceIds.length > 0 && (
                    <span className="hd-refs">
                      {item.sourceIds.map(id =>
                        known.has(id) ? (
                          <a key={id} className="hd-ref" href={`#${sourceAnchor(id)}`} title={`Source ${id}`}>[{shortRef(id)}]</a>
                        ) : (
                          <span key={id} className="hd-ref" title={`Source ${id}`}>[{shortRef(id)}]</span>
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

      <section className="hd-unresolved">
        <h2>Unresolved ({doc.uncertainties.length})</h2>
        {doc.uncertainties.length === 0 ? (
          <p className="hd-empty">None identified from the structured record</p>
        ) : (
          <ul className="hd-unc">
            {doc.uncertainties.map((u, i) => (
              <li key={i}>
                <span className="hd-unc-label">{u.topic}</span> — <span className="hd-state">{UNCERTAINTY_LABEL[u.state]}</span>
                <span className="hd-note">. {u.text}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="hd-section">
        <h2>Sources</h2>
        {sources.length === 0 ? (
          <p className="hd-empty">No sources attached</p>
        ) : (
          <div className="hd-sources">
            {sources.map(s => (
              <div key={s.id} id={sourceAnchor(s.id)} className="hd-source">
                <span className="hd-src-id mono">[{shortRef(s.id)}]</span>
                <span className="hd-src-body">
                  <strong>{s.label}</strong> · {SOURCE_TYPE_LABEL[s.type]} · event time{' '}
                  {s.eventTime ? <span className="mono">{clock(s.eventTime)}</span> : 'unknown'} · captured{' '}
                  <span className="mono">{clock(s.capturedAt)}</span>
                  {s.limitation ? <> · <span className="hd-note">{s.limitation}</span></> : null}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="hd-sign">
        <div className="hd-sign-line">Reviewed by ______</div>
        <div className="hd-sign-line">Time ______</div>
      </div>

      <p className="hd-footer">Generated from a synthetic demonstration incident. Not for clinical use.</p>
    </article>
  );
}

/** Print stylesheet duplicating the essential .hd styles for the standalone export. Matches er.css. */
const EXPORT_STYLE = `
  :root { color-scheme: light; }
  body { margin: 0; padding: 48px; max-width: 820px; color: #15191F; background: #fff;
    font: 15px/1.5 "Atkinson Hyperlegible Next", system-ui, -apple-system, "Segoe UI", sans-serif; }
  .mono { font-family: "Atkinson Hyperlegible Mono", ui-monospace, Menlo, monospace; font-variant-numeric: tabular-nums; }
  .hd-banner { border: 2px solid #15191F; padding: 6px 10px; font-weight: 700; font-size: 13px; letter-spacing: .04em;
    display: flex; justify-content: space-between; gap: 12px; }
  .hd-title { margin: 20px 0 4px; font-size: 28px; line-height: 1.2; }
  .hd-meta { margin: 0 0 4px; font-size: 14px; color: #3F4752; }
  h2 { margin: 24px 0 6px; font-size: 19px; border-bottom: 1px solid #15191F; padding-bottom: 4px; }
  ul.hd-list { margin: 4px 0 0; padding-left: 20px; }
  ul.hd-list li { margin: 6px 0; }
  .hd-note { color: #3F4752; }
  .hd-empty { color: #3F4752; font-style: italic; }
  .hd-ref { font-size: .85rem; font-weight: 600; text-decoration: none; color: #15191F; margin-left: 4px; white-space: nowrap; }
  .hd-unresolved { border: 2px solid #15191F; padding: 12px 14px; margin-top: 24px; }
  .hd-unresolved h2 { margin: 0 0 6px; border: none; padding: 0; }
  ul.hd-unc { margin: 0; padding-left: 20px; }
  ul.hd-unc li { margin: 4px 0; }
  .hd-unc-label { font-weight: 600; }
  .hd-state { font-weight: 700; }
  .hd-sources { display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
  .hd-source { display: grid; grid-template-columns: 70px 1fr; gap: 12px; }
  .hd-src-id { font-weight: 700; }
  .hd-sign { margin-top: 28px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px; font-size: 14px; }
  .hd-sign-line { border-bottom: 1px solid #15191F; padding-top: 28px; }
  .hd-footer { margin: 20px 0 0; font-size: 12px; color: #3F4752; }
  p { overflow-wrap: anywhere; }
  @media print { body { margin: 0; padding: 0; } }
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
