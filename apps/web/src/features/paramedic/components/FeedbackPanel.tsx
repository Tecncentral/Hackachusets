import { useState } from 'react';
import { useAction, useIncidentState, type Feedback, type WorkspaceIncident } from '../../../platform';
import { clock } from '../../../platform/time';
import { isStale } from '../model';
import { setMuted, speak, stopSpeech, useSpeechState } from '../speech';
import { SourceList } from './SourceList';
import { useRequestId } from './fields';

const KIND_LABEL: Record<Feedback['kind'], string> = { conflict: 'Records differ', missing_context: 'Missing context', unsupported_inference: 'Check this inference' };
const STATUS_LABEL: Record<Feedback['status'], string> = { open: 'Open', clarified: 'Clarified', dismissed: 'Dismissed', deferred: 'Deferred' };

export function FeedbackPanel({ incident, headingRef }: { incident: WorkspaceIncident; headingRef?: React.Ref<HTMLHeadingElement> }) {
  const { platform } = useIncidentState();
  const check = useAction();
  const req = useRequestId();
  const speech = useSpeechState();
  const active = incident.feedback.filter(f => f.status === 'open' || f.status === 'deferred');
  const resolved = incident.feedback.filter(f => f.status === 'clarified' || f.status === 'dismissed');
  const lastChecked = Math.max(-1, ...incident.feedback.map(f => f.revision));
  const canCheck = incident.patient.matched && incident.observations.length + incident.measurements.length > 0;

  return <section className="card ws-feedback" aria-labelledby="ws-fb-h">
    <div className="ws-section-head">
      <h2 id="ws-fb-h" ref={headingRef} tabIndex={-1}>Assistant feedback</h2>
      {speech.supported && <div className="ws-speech-controls">
        {speech.speakingId && <button type="button" className="btn btn-secondary" onClick={stopSpeech}>Stop audio</button>}
        <label className="app-switch"><input type="checkbox" checked={speech.muted} onChange={e => setMuted(e.target.checked)} /> Mute spoken feedback</label>
      </div>}
    </div>
    <p className="ws-hint">The assistant proposes questions from the record and cited references. It does not diagnose, and nothing changes until you choose.</p>
    <div className="ws-actions">
      <button type="button" className={active.length ? 'btn btn-secondary' : 'btn'} disabled={check.pending || !canCheck}
        onClick={() => void check.run(() => platform.evaluate({ requestId: req.forContent(String(incident.revision)), baseRevision: incident.revision })).then(r => { if (r) req.done(); })}>
        {check.pending ? 'Checking…' : `Check record (revision ${incident.revision})`}
      </button>
    </div>
    {!canCheck && <p className="ws-hint">Add an observation or measurement first.</p>}
    <div aria-live="polite">
      {check.state === 'done' && lastChecked === incident.revision && active.filter(f => f.revision === incident.revision).length === 0 && <p className="text-quiet">Checked revision {incident.revision}: no new questions.</p>}
      {check.error && <p role="alert" className={check.error.kind === 'unavailable' ? 'ws-notice' : 'text-error'}>
        {check.error.kind === 'unavailable' ? 'Assistant unavailable. ' : 'Check not completed. '}{check.error.message} Capture and the handoff do not depend on the assistant.
      </p>}
    </div>
    {active.length === 0 && check.state !== 'done' && <p className="text-quiet">No open questions.</p>}
    <ul className="ws-fb-list">{active.map(f => <li key={f.id}><FeedbackCard f={f} incident={incident} /></li>)}</ul>
    {resolved.length > 0 && <details className="ws-disclosure"><summary>Resolved ({resolved.length})</summary>
      <ul className="ws-fb-list">{resolved.map(f => <li key={f.id}><FeedbackCard f={f} incident={incident} /></li>)}</ul>
    </details>}
  </section>;
}

function FeedbackCard({ f, incident }: { f: Feedback; incident: WorkspaceIncident }) {
  const { platform } = useIncidentState();
  const act = useAction();
  const req = useRequestId();
  const speech = useSpeechState();
  const [mode, setMode] = useState<'none' | 'clarify' | 'dismiss'>('none');
  const [text, setText] = useState('');
  const [showEvidence, setShowEvidence] = useState(false);
  const stale = isStale(f, incident);
  const statements = incident.observations.filter(o => f.observationIds.includes(o.id));
  const evidence = incident.sources.filter(s => f.evidenceSourceIds.includes(s.id));
  const refs = incident.knowledgeReferences.filter(r => f.knowledgeReferenceIds.includes(r.id));
  const missingRefs = f.knowledgeReferenceIds.filter(id => !refs.some(r => r.id === id));
  const done = f.status === 'clarified' || f.status === 'dismissed';
  const spoken = f.spokenSummary ?? f.message;

  const resolve = (action: 'clarify' | 'dismiss' | 'defer') => {
    const body = { feedbackId: f.id, action, ...(action === 'clarify' ? { clarificationText: text.trim() } : action === 'dismiss' && text.trim() ? { clarificationText: text.trim() } : {}) };
    return act.run(() => platform.resolveFeedback({ ...body, requestId: req.forContent(JSON.stringify(body)), baseRevision: incident.revision })).then(r => { if (r) { req.done(); setMode('none'); setText(''); } });
  };

  return <article className={`ws-fb ${done ? 'ws-fb-done' : ''}`} aria-labelledby={`fb-${f.id}`}>
    <div className="ws-fb-tags">
      <span className="tag">{KIND_LABEL[f.kind]}</span>
      <span className={`tag ${f.status === 'open' ? 'tag-warn' : f.status === 'clarified' ? 'tag-ok' : ''}`}>{STATUS_LABEL[f.status]}</span>
      {stale && <span className="tag tag-warn">Stale — record changed since revision {f.revision}</span>}
      {f.mode !== 'unknown' && <span className="tag">{f.mode === 'development-stub' ? 'Development stub' : f.mode}</span>}
    </div>
    <p id={`fb-${f.id}`} className="ws-fb-msg">{f.message}</p>
    {statements.length > 0 && <div className="ws-fb-block"><p className="ws-label">Original statement</p>
      {statements.map(o => <blockquote key={o.id} className="ws-quote">“{o.text}”<span className="ws-hint"> · captured {clock(o.capturedAt)}</span></blockquote>)}</div>}
    {f.suggestedQuestion && <div className="ws-fb-question"><p className="ws-label">Suggested question</p><p className="ws-question">“{f.suggestedQuestion}”</p></div>}

    {speech.supported && !done && <div className="ws-actions">
      {speech.speakingId === f.id
        ? <button type="button" className="btn btn-secondary" onClick={stopSpeech}>Stop</button>
        : <button type="button" className="btn btn-secondary" disabled={speech.muted} onClick={() => speak(f.id, spoken)} aria-describedby={`fb-spoken-${f.id}`}>▶ Play</button>}
      <p id={`fb-spoken-${f.id}`} className="ws-hint">{speech.muted ? 'Muted. ' : ''}Spoken text: “{spoken}”</p>
    </div>}

    {(evidence.length > 0 || refs.length > 0 || missingRefs.length > 0) && <>
      <button type="button" className="btn btn-quiet" aria-expanded={showEvidence} onClick={() => setShowEvidence(s => !s)}>{showEvidence ? 'Hide evidence and references' : `Evidence (${evidence.length}) and references (${refs.length})`}</button>
      {showEvidence && <div className="ws-fb-evidence">
        {evidence.length > 0 && <><p className="ws-label">Patient evidence</p><SourceList sources={evidence} /></>}
        {refs.map(r => <div key={r.id} className="ws-ref">
          <p className="ws-label">Reference</p>
          <p><a href={r.url} target="_blank" rel="noreferrer">{r.title}</a> <span className="ws-hint">({r.version})</span></p>
          <blockquote className="ws-quote">{r.passage}</blockquote>
          <p className="ws-hint">{r.applicability} · <strong>{r.reviewStatus}</strong></p>
        </div>)}
        {missingRefs.length > 0 && <p className="text-error">Reference not found in the record: {missingRefs.join(', ')}.</p>}
      </div>}
    </>}

    {f.resolution && <p className="ws-hint">{STATUS_LABEL[f.status]} by {f.resolution.author} at {clock(f.resolution.recordedAt)} (revision {f.resolution.revision}){f.resolution.text ? ` — “${f.resolution.text}”` : ''}.</p>}

    {!done && <>
      {mode === 'none' && <div className="ws-actions">
        <button type="button" className="btn" onClick={() => setMode('clarify')}>Clarify</button>
        <button type="button" className="btn btn-secondary" onClick={() => setMode('dismiss')}>Dismiss</button>
        {f.status !== 'deferred' && <button type="button" className="btn btn-secondary" disabled={act.pending} onClick={() => void resolve('defer')}>Defer</button>}
      </div>}
      {mode !== 'none' && <form className="ws-form" onSubmit={e => { e.preventDefault(); void resolve(mode); }}>
        <label htmlFor={`fb-text-${f.id}`}>{mode === 'clarify' ? 'Clarification (what you found out)' : 'Reason for dismissing (optional)'}</label>
        <textarea id={`fb-text-${f.id}`} rows={2} value={text} onChange={e => setText(e.target.value)} />
        {mode === 'clarify' && <p className="ws-hint">Saved as a crew observation. The earlier statement stays in the record, marked as clarified.</p>}
        <div className="ws-actions">
          <button type="submit" className="btn" disabled={act.pending || (mode === 'clarify' && !text.trim())}>{mode === 'clarify' ? 'Save clarification' : 'Dismiss'}</button>
          <button type="button" className="btn btn-secondary" onClick={() => { setMode('none'); act.clear(); }}>Cancel</button>
        </div>
      </form>}
      <div aria-live="polite">
        {act.pending && <p className="text-quiet">Saving…</p>}
        {act.error && <p role="alert" className="text-error">Not saved: {act.error.message}</p>}
      </div>
    </>}
  </article>;
}
