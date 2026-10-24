import { useEffect, useState } from 'react';
import { errorMessage, useAction, useIncidentState, type HandoffDraft, type WorkspaceIncident } from '../../../platform';
import { HandoffDocument, downloadHandoff } from '../../er/HandoffDocument';

/** Full draft before approval; approval is bound to the revision shown and requires a fresh confirmation after any change. */
export function HandoffPanel({ incident, open, onOpen, headingRef }: { incident: WorkspaceIncident; open: boolean; onOpen: () => void; headingRef?: React.Ref<HTMLHeadingElement> }) {
  const { platform } = useIncidentState();
  const approve = useAction();
  const [draft, setDraft] = useState<HandoffDraft | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<number | null>(null);
  const latest = incident.handoffs.at(-1);
  const sharedCurrent = latest?.revision === incident.revision;

  useEffect(() => {
    if (!open) return;
    let live = true;
    setDraftError(null);
    platform.getHandoffDraft(incident).then(d => { if (live) setDraft(d); }, e => { if (live) setDraftError(errorMessage(e)); });
    return () => { live = false; };
    // Re-fetch when the record changes; the incident object identity changes on every poll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, incident.revision, incident.feedback.map(f => f.status).join()]);

  const draftCurrent = draft !== null && draft.revision === incident.revision;
  const submit = async () => {
    if (!draft) return;
    await approve.run(() => platform.approveHandoff({ revision: draft.revision, reviewedBy: 'Crew (demo)' }));
    setConfirmed(null);
  };

  return <section className="card ws-handoff" aria-labelledby="ws-ho-h">
    <div className="ws-section-head">
      <h2 id="ws-ho-h" ref={headingRef} tabIndex={-1}>ER handoff</h2>
      {latest && <span className={`tag ${sharedCurrent ? 'tag-ok' : 'tag-warn'}`}>{sharedCurrent ? `Version ${latest.version} shared` : `Version ${latest.version} outdated`}</span>}
    </div>
    {!latest && <p className="ws-hint">Not shared yet. You can review at any point; nothing here gates care or transport.</p>}
    {latest && !sharedCurrent && <p className="ws-notice">Information was added after version {latest.version} was shared. Review again to share an amendment.</p>}
    {!open ? <button type="button" className="btn" onClick={onOpen}>{latest && !sharedCurrent ? 'Review amendment' : latest ? 'View current draft' : 'Review full handoff draft'}</button> : <>
      {draftError && <p role="alert" className="text-error">Draft not available: {draftError}</p>}
      {!draft && !draftError && <p className="text-quiet">Loading draft…</p>}
      {draft && <>
        {!draftCurrent && <p className="ws-notice" role="status">The record changed — refreshing the draft…</p>}
        {approve.error && <p role="alert" className="text-error">Not shared: {approve.error.message}{approve.error.kind === 'conflict' ? ' The draft below has been refreshed — review it, then confirm again.' : ''}</p>}
        <div className="ws-doc"><HandoffDocument draft={draft} incident={incident} meta={{ title: 'Handoff draft — not yet reviewed', status: `Draft at revision ${draft.revision}` }} /></div>
        <div className="ws-approve no-print">
          {sharedCurrent && latest?.revision === draft.revision ? <p><span className="tag tag-ok">Shared</span> Revision {draft.revision} is shared as version {latest.version}. <a href={`${location.search}#er`}>Open receiving view</a></p> : <>
            <label className="app-switch"><input type="checkbox" checked={confirmed === draft.revision} disabled={!draftCurrent} onChange={e => setConfirmed(e.target.checked ? draft.revision : null)} /> I reviewed this draft (revision {draft.revision}), including the uncertain items.</label>
            <p className="ws-hint">Approval confirms review. It does not clinically verify reported information.</p>
            <div className="ws-actions">
              <button type="button" className="btn" disabled={approve.pending || !draftCurrent || confirmed !== draft.revision} onClick={() => void submit()}>{approve.pending ? 'Sharing…' : `Approve and share revision ${draft.revision}`}</button>
              <button type="button" className="btn btn-secondary" onClick={() => downloadHandoff({ draft, incident, meta: { title: 'Handoff draft — not yet reviewed', status: `Draft at revision ${draft.revision}` } }, `scenebrief-draft-r${draft.revision}.html`)}>Download draft (HTML)</button>
            </div>
          </>}
          {approve.state === 'done' && <p role="status"><span className="tag tag-ok">Shared</span> The receiving view now shows this version.</p>}
        </div>
      </>}
    </>}
  </section>;
}
