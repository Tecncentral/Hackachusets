// Print-friendly, exportable handoff document (Trauma Llama "Handoff-Print" design). It renders the
// structured draft the crew reviewed (sections, source attribution, and explicit uncertainties)
// without adding any clinical interpretation. Unknown / Not documented / Not performed are kept
// distinct, and every source in the draft is listed with its own attribution in the Sources legend.
// Single column, near-black ink, >=1px rules, grayscale-legible. All patient data comes from the
// incident record; nothing is hard-coded from the design's demo values.
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
  /** Approval banner state. Drives the "DRAFT — NOT CREW APPROVED" / "CREW APPROVED" top-right banner. */
  approval?: { approved: boolean; revision: number; at?: string };
}

export interface HandoffDocumentProps {
  draft: HandoffDraft;
  incident: WorkspaceIncident;
  meta: HandoffMeta;
}

const UNCERTAINTY_LABEL: Record<HandoffDraft['uncertainties'][number]['state'], string> = {
  unknown: 'Unknown',
  not_documented: 'Not documented',
  not_obtained: 'Not performed',
  unresolved: 'Unresolved'
};

const SOURCE_TYPE_LABEL: Record<WorkspaceSource['type'], string> = {
  wearable: 'Consumer wearable',
  dispatch: 'Dispatch',
  voice: 'Voice note',
  patient_profile: 'Patient profile (self-reported)',
  weather: 'Weather record',
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

/** The right-hand banner text: approval status for the revision this document represents. */
function approvalText(meta: HandoffMeta, draft: HandoffDraft): string {
  const a = meta.approval;
  if (a && a.approved && a.revision === draft.revision) {
    return `CREW APPROVED · revision ${a.revision}${a.at ? ` · ${clock(a.at)}` : ''}`;
  }
  return 'DRAFT — NOT CREW APPROVED';
}

export function HandoffDocument({ draft, incident, meta }: HandoffDocumentProps) {
  // Every source listed in the draft that we can find in the incident record, in draft order.
  const sources = draft.sourceIds
    .map(id => incident.sources.find(s => s.id === id))
    .filter((s): s is WorkspaceSource => s !== undefined);
  const known = new Set(sources.map(s => s.id));
  const approved = approvalText(meta, draft);

  // Omit the device/wearable section entirely when empty; every other section renders even if empty.
  const sections = draft.sections.filter(s => !(s.id === 'device' && s.items.length === 0));

  return (
    <article className="hd" aria-label={meta.title}>
      <div className="hd-banner">
        <span>SYNTHETIC DEMO — NOT A REAL PATIENT</span>
        <span>{approved}</span>
      </div>

      <h1 className="hd-title">ER handoff — Trauma Llama</h1>
      <p className="hd-meta">
        Incident <span className="mono">{incident.id}</span> · Revision <span className="mono">{draft.revision}</span> · Printed{' '}
        <span className="mono">{clock(new Date().toISOString())}</span> · Source tags in [brackets] refer to the source list at the end.
      </p>

      {draft.mode === 'website-grouped' && (
        <p className="hd-grouped">Grouped by the website because the platform draft endpoint is unavailable.</p>
      )}

      {sections.map(section => (
        <section key={section.id} className="hd-section">
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
                            [{shortRef(id)}]
                          </a>
                        ) : (
                          <span key={id} className="hd-ref" title={`Source ${shortRef(id)}`}>
                            [{shortRef(id)}]
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

      <section className="hd-unresolved">
        <h2>Unresolved ({draft.uncertainties.length})</h2>
        {draft.uncertainties.length === 0 ? (
          <p className="hd-empty">None listed</p>
        ) : (
          <ul className="hd-unc">
            {draft.uncertainties.map((u, i) => (
              <li key={i}>
                <span className="hd-unc-label">{u.label}</span> — <span className="hd-state">{UNCERTAINTY_LABEL[u.state]}</span>
                {u.detail ? <span className="hd-note">. {u.detail}</span> : null}
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
  .hd-grouped { margin: 10px 0 0; padding: 8px 12px; border: 1px solid #15191F; color: #15191F; font-size: 14px; }
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
<div class="hd-banner"><span>SYNTHETIC DEMO — NOT A REAL PATIENT</span><span>DRAFT — NOT CREW APPROVED</span></div>
<h1 class="hd-title">${escapeHtml(title)}</h1>
<pre style="white-space: pre-wrap; overflow-wrap: anywhere; font: 14px/1.5 'Atkinson Hyperlegible Mono', ui-monospace, Menlo, monospace;">${escapeHtml(text)}</pre>
<p class="hd-footer">Generated from a synthetic demonstration incident. Not for clinical use.</p>
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
