// Crew review view (Trauma Llama "review view" from Main.dc.html + Phone-Review). The document the
// crew reviews is shown in full on the left; the right-hand "Crew review" aside carries the review
// checkbox, approval button, and the distinct approval states (saving / success / connection
// failure / version conflict / changed-after-approval). Approval confirms review only; it never
// clinically verifies reported information. Printing is available before approval — an unapproved
// printout shows the DRAFT banner. Only the document prints (the aside is .no-print).
import { useEffect, useState } from 'react';
import { clock } from '../../../platform/time';
import { useAction, useIncidentState, type HandoffDraft, type WorkspaceIncident } from '../../../platform';
import { HandoffDocument, downloadHandoff, type HandoffMeta } from '../../er/HandoffDocument';

export function HandoffReview({
  incident,
  draft,
  draftError,
  onBack
}: {
  incident: WorkspaceIncident;
  draft: HandoffDraft | null;
  draftError: string | null;
  onBack: () => void;
}) {
  const { platform, refresh } = useIncidentState();
  const approve = useAction();

  // Review confirmation is bound to the draft revision. It resets whenever the draft revision
  // changes (a new draft) or after an approval attempt (success or failure).
  const [reviewedRevision, setReviewedRevision] = useState<number | null>(null);

  useEffect(() => {
    setReviewedRevision(null);
    // Reset the checkbox whenever the draft revision changes. A conflict alert stays until the crew
    // chooses "Reload latest draft", so the reason for the fresh review stays visible.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft?.revision]);

  const latest = incident.handoffs.at(-1);
  // The document represents the draft revision; it is "approved" only when the latest shared
  // handoff is for this exact draft revision.
  const approvedForDraft = draft !== null && latest !== undefined && latest.revision === draft.revision;
  // The incident changed after the last approval: there is an approved handoff but it is behind.
  const changedAfterApproval = latest !== undefined && latest.revision < incident.revision;
  const draftCurrent = draft !== null && draft.revision === incident.revision;
  const checked = draft !== null && reviewedRevision === draft.revision;

  const meta: HandoffMeta = draft
    ? {
        title: 'ER handoff — Trauma Llama',
        status: approvedForDraft ? 'Crew approved' : 'Draft — not crew approved',
        reviewedBy: latest?.reviewedBy,
        reviewedAt: latest?.reviewedAt,
        version: latest?.version,
        approval: latest ? { approved: true, revision: latest.revision, at: latest.reviewedAt } : undefined
      }
    : { title: 'ER handoff — Trauma Llama', status: 'Draft' };

  const runApprove = async () => {
    if (!draft) return;
    const ok = await approve.run(() => platform.approveHandoff({ revision: draft.revision, reviewedBy: 'Crew (demo)' }));
    // Keep the review confirmation on a connection failure; clear it on success or conflict.
    setReviewedRevision(r => (ok ? null : r));
  };

  const reloadDraft = () => {
    approve.clear();
    setReviewedRevision(null);
    void refresh();
  };

  const conflict = approve.error?.kind === 'conflict';
  const networkFailure = approve.error !== null && !conflict;

  return (
    <div className="hr">
      <div className="hr-doc">
        {draftError ? (
          <div className="card">
            <p role="alert" className="text-error">Draft not available: {draftError}</p>
          </div>
        ) : !draft ? (
          <div className="card">
            <p className="hr-loading">Loading draft…</p>
          </div>
        ) : (
          <HandoffDocument draft={draft} incident={incident} meta={meta} />
        )}
      </div>

      <aside className="hr-aside card no-print" aria-label="Crew review">
        <h2>Crew review</h2>

        {approve.state === 'done' && approvedForDraft && (
          <p className="alert alert-ok" role="status">
            ✓ Crew approved · revision {latest!.revision}
            {latest?.reviewedAt ? ` at ${clock(latest.reviewedAt)}` : ''}
          </p>
        )}

        {networkFailure && (
          <>
            <p className="alert alert-crit" role="alert">
              Approval not saved. Connection problem. Your review is kept — retry.
            </p>
            <button type="button" className="btn" onClick={() => void runApprove()} disabled={approve.pending}>
              Retry approval
            </button>
          </>
        )}

        {conflict && (
          <>
            <p className="alert alert-crit" role="alert">
              This draft is out of date. A newer revision exists. Reload the draft and review it again before approving.
            </p>
            <button type="button" className="btn btn-secondary" onClick={reloadDraft}>
              Reload latest draft
            </button>
          </>
        )}

        {changedAfterApproval && !conflict && !networkFailure && (
          <p className="alert alert-attn" role="status">
            Fresh review required. The incident changed after approval (approved revision {latest!.revision}, now {incident.revision}).
          </p>
        )}

        {!networkFailure && !conflict && !(approve.state === 'done' && approvedForDraft) && (
          <p className="hr-status" role="status">
            {approve.pending
              ? 'Saving approval…'
              : approvedForDraft
                ? 'Crew approved'
                : 'Not yet reviewed'}
          </p>
        )}

        {draft && !approvedForDraft && (
          <label className="hr-review-check">
            <input
              type="checkbox"
              checked={checked}
              disabled={approve.pending}
              onChange={e => setReviewedRevision(e.target.checked ? draft.revision : null)}
            />
            I reviewed the complete draft, including {draft.uncertainties.length} unresolved items.
          </label>
        )}

        <div className="hr-approve-row">
          {!approvedForDraft && <button
            type="button"
            className="btn"
            disabled={!draft || !checked || !draftCurrent || approve.pending || conflict}
            onClick={() => void runApprove()}
          >
            {approve.pending ? 'Saving approval…' : `Approve reviewed handoff (rev ${draft?.revision ?? incident.revision})`}
          </button>}

          <button type="button" className="btn btn-secondary" onClick={() => window.print()}>
            Print handoff
          </button>
        </div>

        <div className="hr-actions hr-secondary-actions">
          {draft && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() =>
                downloadHandoff({ draft, incident, meta }, `trauma-llama-handoff-r${draft.revision}.html`)
              }
            >
              Download HTML
            </button>
          )}
          <button type="button" className="btn btn-quiet" onClick={onBack}>
            Back to workspace
          </button>
        </div>

        <p className="hr-note hr-secondary-actions">Approval confirms review. It does not clinically verify reported information.</p>
      </aside>
    </div>
  );
}
