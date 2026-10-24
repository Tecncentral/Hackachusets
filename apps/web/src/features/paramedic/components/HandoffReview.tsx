// Crew review view (Trauma Llama "review view" from Main.dc.html + Phone-Review). The document the
// crew reviews is shown in full on the left; the "Crew review" aside carries the review checkbox,
// approval button and the distinct approval states (saving / success / connection failure / newer
// draft / changed after approval). Approval confirms review only; it never clinically verifies
// reported information. Printing is available before approval — an unapproved printout shows the
// DRAFT banner. Only the document prints (the aside is .no-print).
//
// Binding: ticking the checkbox stores the exact draft on screen. Approve and Retry both send that
// stored draft (approveReviewed re-reads the platform draft first and refuses if it differs). If a
// different draft arrives — new revision, patient match, reset — the confirmation is cleared and the
// crew must review again.
import { useEffect, useState } from 'react';
import { clock } from '../../../platform/time';
import {
  PlatformError, approveReviewed, handoffFingerprint, sameContent, sharedVersionFor, useIncidentState,
  type Handoff, type HandoffDraft, type Incident
} from '../../../platform';
import { HandoffDocument, downloadHandoff, type HandoffMeta } from '../../er/HandoffDocument';

type Approval =
  | { state: 'idle' }
  | { state: 'pending' }
  | { state: 'approved'; handoff: Handoff }
  | { state: 'failed'; message: string }
  /** The platform has a newer draft (or 409). Nothing from the earlier review was shared. */
  | { state: 'changed'; message: string }
  | { state: 'mismatch'; handoff: Handoff };

export const REVIEWER = 'Crew (demo)';

export function HandoffReview({ incident, draft, draftError, onDraft, onBack }: {
  incident: Incident;
  draft: HandoffDraft | null;
  draftError: string | null;
  /** Replace the displayed draft (when the platform reports a newer one during approval). */
  onDraft?: (d: HandoffDraft) => void;
  onBack: () => void;
}) {
  const { platform, apply, refresh, reportSave } = useIncidentState();
  const [reviewed, setReviewed] = useState<HandoffDraft | null>(null);
  const [approval, setApproval] = useState<Approval>({ state: 'idle' });
  const draftKey = draft ? handoffFingerprint(draft) : null;

  // A different draft on screen invalidates an earlier review, including one kept for retry.
  useEffect(() => {
    if (reviewed && draft && !sameContent(reviewed, draft)) {
      setReviewed(null);
      setApproval(a => (a.state === 'failed' || a.state === 'idle' ? { state: 'changed', message: 'A newer draft replaced the one you reviewed. Nothing was shared. Review this draft before approving.' } : a));
    }
  }, [draftKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const latest = incident.handoffs.at(-1);
  const shared = draft ? sharedVersionFor(incident, draft) : undefined;
  const changedAfterApproval = latest !== undefined && !shared && draft !== null;
  const draftCurrent = draft !== null && draft.revision === incident.revision && draft.patientMatched === incident.patient.matched;
  const checked = reviewed !== null && draft !== null && sameContent(reviewed, draft);
  const pending = approval.state === 'pending';

  const meta: HandoffMeta = {
    title: 'ER handoff — Trauma Llama',
    status: shared ? 'Crew approved' : 'Draft — not crew approved',
    reviewedBy: shared?.reviewedBy, reviewedAt: shared?.reviewedAt, version: shared?.version,
    approval: shared ? { approved: true, revision: shared.revision, at: shared.reviewedAt } : undefined
  };

  /** Approve exactly `target` — the draft the crew confirmed. Retry passes the same object. */
  const runApprove = async (target: HandoffDraft) => {
    setApproval({ state: 'pending' }); reportSave({ state: 'saving' });
    try {
      const outcome = await approveReviewed(platform, target, REVIEWER);
      if (outcome.status === 'changed') {
        setReviewed(null); onDraft?.(outcome.latest); void refresh();
        setApproval({ state: 'changed', message: 'The platform has a newer draft than the one you reviewed. Nothing was shared. Review the updated draft before approving.' });
        reportSave({ state: 'idle' });
        return;
      }
      apply(outcome.incident); setReviewed(null);
      if (outcome.status === 'mismatch') { setApproval({ state: 'mismatch', handoff: outcome.handoff }); reportSave({ state: 'error', message: 'Shared version differs from the reviewed draft.' }); return; }
      setApproval({ state: 'approved', handoff: outcome.handoff }); reportSave({ state: 'saved' });
    } catch (e) {
      const err = e instanceof PlatformError ? e : new PlatformError('server', String(e), 'handoffs');
      if (err.kind === 'conflict') {
        setReviewed(null); void refresh();
        setApproval({ state: 'changed', message: `${err.message} Nothing from your review was shared. Review the latest draft before approving.` });
        reportSave({ state: 'idle' });
      } else {
        // Keep the reviewed draft: Retry re-sends this exact draft, and only while it is still current.
        setApproval({ state: 'failed', message: err.message });
        reportSave({ state: 'error', message: err.message });
      }
    }
  };

  return (
    <div className="hr">
      <div className="hr-doc">
        {draftError ? (
          <div className="card"><p role="alert" className="text-error">Draft not available: {draftError}</p></div>
        ) : !draft ? (
          <div className="card"><p className="hr-loading">Loading draft…</p></div>
        ) : (
          <HandoffDocument doc={shared ?? draft} incidentId={incident.id} sources={incident.sources} meta={meta} />
        )}
      </div>

      <aside className="hr-aside card no-print" aria-label="Crew review">
        <h2>Crew review</h2>

        {approval.state === 'approved' && shared && (
          <p className="alert alert-ok" role="status">✓ Crew approved · version {shared.version} · revision {shared.revision} at {clock(shared.reviewedAt)}</p>
        )}

        {approval.state === 'failed' && (
          <>
            <p className="alert alert-crit" role="alert">
              Approval not saved: {approval.message} {checked ? 'Your review of this draft is kept — retry.' : ''}
            </p>
            {checked && reviewed && (
              <button type="button" className="btn" onClick={() => void runApprove(reviewed)} disabled={pending}>
                Retry approval (rev {reviewed.revision})
              </button>
            )}
          </>
        )}

        {approval.state === 'changed' && (
          <p className="alert alert-crit" role="alert">{approval.message}</p>
        )}

        {approval.state === 'mismatch' && (
          <p className="alert alert-crit" role="alert">
            The platform shared version {approval.handoff.version} with content that differs from the draft you reviewed (the record changed during approval). Review the current draft and share an amendment.
          </p>
        )}

        {changedAfterApproval && approval.state !== 'changed' && approval.state !== 'mismatch' && (
          <p className="alert alert-attn" role="status">
            Fresh review required. The draft changed after version {latest!.version} was approved (approved revision {latest!.revision}, current draft revision {draft!.revision}).
          </p>
        )}

        {approval.state !== 'failed' && approval.state !== 'approved' && (
          <p className="hr-status" role="status">{pending ? 'Saving approval…' : shared ? 'Crew approved' : 'Not yet reviewed'}</p>
        )}

        {draft && !shared && (
          <label className="hr-review-check">
            <input
              type="checkbox"
              checked={checked}
              disabled={pending || !draftCurrent}
              onChange={e => { setReviewed(e.target.checked ? draft : null); if (approval.state !== 'pending') setApproval({ state: 'idle' }); }}
            />
            I reviewed the complete draft, including {draft.uncertainties.length} unresolved items.
          </label>
        )}

        <div className="hr-approve-row">
          {!shared && approval.state !== 'failed' && (
            <button
              type="button"
              className="btn"
              disabled={!draft || !checked || !draftCurrent || pending}
              onClick={() => { if (reviewed) void runApprove(reviewed); }}
            >
              {pending ? 'Saving approval…' : `Approve reviewed handoff (rev ${draft?.revision ?? incident.revision})`}
            </button>
          )}
          <button type="button" className="btn btn-secondary" onClick={() => window.print()}>Print handoff</button>
        </div>

        <div className="hr-actions hr-secondary-actions">
          {draft && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => downloadHandoff({ doc: shared ?? draft, incidentId: incident.id, sources: incident.sources, meta }, `trauma-llama-handoff-r${draft.revision}.html`)}
            >
              Download HTML
            </button>
          )}
          <button type="button" className="btn btn-quiet" onClick={onBack}>Back to workspace</button>
        </div>

        <p className="hr-note hr-secondary-actions">Approval confirms review. It does not clinically verify reported information.</p>
      </aside>
    </div>
  );
}
