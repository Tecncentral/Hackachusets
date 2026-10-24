import { useState } from 'react';
import { useAction, useIncidentState, type Feedback, type Incident, type Observation, type PlatformError } from '../../../platform';
import { OBS_LABEL, REPORTED_BY_LABEL } from '../../../platform/labels';
import { clock } from '../../../platform/time';
import { changes, feedbackFor, isBehind, isStale, partitionObservations, recordFeedback, resolutionOf } from '../model';
import { setMuted, speak, stopSpeech, useSpeechState } from '../speech';
import { SourceList } from './SourceList';
import { useRequestId } from './fields';

export interface EvaluationState { status: 'idle' | 'checking' | 'done' | 'error'; revision: number | null; error: PlatformError | null }

const KIND_LABEL: Record<Feedback['kind'], string> = { conflict: 'Records differ', missing_context: 'Missing context', unsupported_inference: 'Finding does not support the conclusion' };
const MODE_LABEL: Record<Observation['inputMode'], string> = { typed: 'Typed', transcribed: 'Transcribed, crew-reviewed' };
const MODE_CHIP: Record<Feedback['mode'], string> = { mock: 'Mock assistant · fixture replay', deterministic: 'Rule check', model: 'Model', hybrid: 'Rules + model' };

interface ListProps { incident: Incident; evaluation: EvaluationState; onRecheck: () => void; headingRef?: React.Ref<HTMLHeadingElement> }

/** Observations needing attention, each with its attached assistant panel; everything else one tap away. */
export function ObservationList({ incident, evaluation, onRecheck, headingRef }: ListProps) {
  const { attention, earlier } = partitionObservations(incident);
  const general = recordFeedback(incident).filter(f => f.status !== 'dismissed' && f.status !== 'clarified');
  const [earlierOpen, setEarlierOpen] = useState(false);
  const speech = useSpeechState();
  const resolvedCount = incident.feedback.filter(f => f.status === 'dismissed' || f.status === 'clarified').length;

  return <section className="ws-obs" aria-labelledby="ws-obs-h">
    <div className="ws-section-head">
      <h2 id="ws-obs-h" ref={headingRef} tabIndex={-1}>Observations needing attention</h2>
      {speech.supported && <div className="ws-speech-controls">
        {speech.speakingId && <button type="button" className="btn btn-secondary" onClick={stopSpeech}>Stop</button>}
        <button type="button" className="btn btn-quiet" aria-pressed={speech.muted} onClick={() => setMuted(!speech.muted)}>{speech.muted ? 'Unmute' : 'Mute'} feedback audio</button>
      </div>}
    </div>
    <EvaluationNotice incident={incident} evaluation={evaluation} onRecheck={onRecheck} />
    {attention.length === 0 && general.length === 0 && <p className="text-quiet ws-empty">No observations yet. Record or type the first one above.</p>}
    <ul className="ws-obs-list">
      {attention.map(o => <li key={o.id}><ObservationCard incident={incident} o={o} evaluation={evaluation} onRecheck={onRecheck} /></li>)}
      {general.map(f => <li key={f.id}><article className="card ws-obs-card" aria-label="Assistant feedback about the record">
        <p className="caps">About the record</p>
        <FeedbackBlock incident={incident} f={f} onRecheck={onRecheck} checking={evaluation.status === 'checking'} />
      </article></li>)}
    </ul>
    {earlier.length + resolvedCount > 0 && <div className="ws-earlier">
      <button type="button" className="btn btn-quiet ws-disclosure" aria-expanded={earlierOpen} aria-controls="ws-earlier-list" onClick={() => setEarlierOpen(x => !x)}>
        {earlierOpen ? '▾' : '▸'} Earlier observations &amp; resolved feedback ({earlier.length})
      </button>
      {earlierOpen && <ul id="ws-earlier-list" className="ws-obs-list">
        {earlier.map(o => <li key={o.id}><ObservationCard incident={incident} o={o} evaluation={evaluation} onRecheck={onRecheck} compact /></li>)}
      </ul>}
    </div>}
  </section>;
}

function EvaluationNotice({ incident, evaluation, onRecheck }: { incident: Incident; evaluation: EvaluationState; onRecheck: () => void }) {
  if (evaluation.status === 'checking') return <p role="status" aria-live="polite" className="alert alert-info">Checking the latest observation against the incident record (revision <span className="mono">{evaluation.revision}</span>)…</p>;
  if (evaluation.status === 'error' && evaluation.error) {
    const unavailable = evaluation.error.kind === 'unavailable';
    return <div role="alert" className="alert alert-attn">
      <strong>{unavailable ? 'Assistant feedback unavailable.' : evaluation.error.kind === 'conflict' ? 'Feedback was not applied.' : 'Assistant check did not complete.'}</strong>{' '}
      {incident.observations.length ? 'Your observation is saved. ' : ''}You can keep working; feedback can be requested again later. <span className="ws-hint">({evaluation.error.message})</span>
      <div className="ws-actions"><button type="button" className="btn btn-secondary" onClick={onRecheck}>Try again</button></div>
    </div>;
  }
  if (incident.observations.length > 0 && evaluation.status !== 'done') return <div className="ws-actions"><button type="button" className="btn btn-secondary" onClick={onRecheck}>Check record (revision {incident.revision})</button></div>;
  return null;
}

function ObservationCard({ incident, o, evaluation, onRecheck, compact }: { incident: Incident; o: Observation; evaluation: EvaluationState; onRecheck: () => void; compact?: boolean }) {
  const fb = feedbackFor(incident, o.id);
  const clarification = changes(incident).find(c => c.original.id === o.id);
  const clarifies = changes(incident).find(c => c.replacement.id === o.id);
  const checkedThis = evaluation.status === 'done' && evaluation.revision !== null && evaluation.revision >= o.addedAtRevision;
  return <article className={`card ws-obs-card${compact ? ' ws-obs-compact' : ''}`} aria-labelledby={`obs-${o.id}`}>
    <p className="ws-obs-meta">
      <span className="chip">{OBS_LABEL[o.category]}</span>
      <span className="mono">{o.observedAt ? `observed ${clock(o.observedAt)}` : `recorded ${clock(o.recordedAt)}`}</span>
      <span>· {REPORTED_BY_LABEL[o.reportedBy]} · {MODE_LABEL[o.inputMode]}</span>
      {o.status === 'superseded' && <span className="chip">Superseded — kept in record</span>}
      <span className="mono ws-hint">[{(o.sourceIds[0] ?? '').replace(/^src-/, '').slice(0, 8)}]</span>
    </p>
    {clarification && <p className="caps">Original statement — kept in record</p>}
    <blockquote id={`obs-${o.id}`} className="ws-statement">“{o.text}”</blockquote>
    {clarifies && <p className="ws-hint">Clarifies an earlier statement: “{clarifies.original.text}”</p>}
    {clarification && <div className="alert alert-ok ws-clar">
      <p><strong>Clarification added by {clarification.correction.author} · <span className="mono">{clock(clarification.correction.recordedAt)}</span> · saved</strong></p>
      <p>“{clarification.replacement.text}”</p>
    </div>}
    {fb.filter(f => f.status !== 'clarified').map(f => <FeedbackBlock key={f.id} incident={incident} f={f} onRecheck={onRecheck} checking={evaluation.status === 'checking'} />)}
    {fb.length === 0 && !compact && checkedThis && <p className="ws-hint">No clarification suggested for this observation.</p>}
  </article>;
}

function FeedbackBlock({ incident, f, onRecheck, checking }: { incident: Incident; f: Feedback; onRecheck: () => void; checking: boolean }) {
  const { platform } = useIncidentState();
  const act = useAction();
  const req = useRequestId();
  const speech = useSpeechState();
  const [mode, setMode] = useState<'none' | 'clarify' | 'dismiss'>('none');
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [text, setText] = useState('');
  const [evOpen, setEvOpen] = useState(false);
  const [refOpen, setRefOpen] = useState(false);
  const stale = isStale(f);
  const behind = isBehind(f, incident);
  const resolution = resolutionOf(incident, f);
  const evidence = incident.sources.filter(s => f.evidenceSourceIds.includes(s.id));
  const refs = incident.knowledgeReferences.filter(r => f.knowledgeReferenceIds.includes(r.id));
  const missingRefs = f.knowledgeReferenceIds.filter(id => !refs.some(r => r.id === id));
  const spoken = f.spokenSummary ?? f.message;
  const actionLabel = { clarify: 'Clarification', dismiss: 'Dismiss', defer: 'Defer' } as const;

  const resolve = async (action: 'clarify' | 'dismiss' | 'defer') => {
    // Contract: clarificationText only with clarify; a dismissal reason goes in note.
    const t = text.trim();
    const body = { feedbackId: f.id, action, ...(action === 'clarify' && t ? { clarificationText: t } : {}), ...(action === 'dismiss' && t ? { note: t.slice(0, 500) } : {}) };
    setPendingAction(action);
    const r = await act.run(() => platform.resolveFeedback({ ...body, requestId: req.forContent(JSON.stringify(body)), baseRevision: incident.revision }));
    if (r) { req.done(); setMode('none'); setText(''); setReviewing(false); }
  };

  if (f.status === 'dismissed') return <div className="ws-fb ws-fb-done">
    <p><span className="chip">Feedback dismissed</span> Statement kept as recorded.</p>
    <p className="ws-hint">Dismissed by {resolution?.resolvedBy ?? 'crew'} at <span className="mono">{clock(resolution?.resolvedAt)}</span>{resolution?.note ? ` — “${resolution.note}”` : ''}. Dismissal is final on the platform.</p>
  </div>;

  const deferredView = f.status === 'deferred' && !reviewing;
  const showActions = !stale && !deferredView && mode === 'none';

  return <div className={`ws-fb${stale ? ' ws-fb-stale' : ''}`} role="group" aria-label="Assistant feedback">
    <p className="caps">Assistant · about this observation</p>
    <p className="ws-fb-tags">
      {f.status === 'open' && <span className="chip chip-attn">Clarification needed</span>}
      {f.status === 'deferred' && <span className="chip chip-attn">◷ Deferred · <span className="mono">{clock(resolution?.resolvedAt)}</span></span>}
      {f.status === 'stale' && <span className="chip chip-notdoc">Not applied — out of date</span>}
      <span className="chip">{KIND_LABEL[f.kind]}</span>
      <span className={`chip${f.mode === 'mock' ? ' chip-demo' : ''}`}>{MODE_CHIP[f.mode]}</span>
    </p>
    {stale && <div className="alert alert-attn" role="status">
      <strong>Feedback is out of date and was not applied.</strong> It was generated for revision <span className="mono">{f.revision}</span>, but the record changed while the check ran (now revision <span className="mono">{incident.revision}</span>). It cannot be resolved; re-check the current revision.
      <div className="ws-actions"><button type="button" className="btn btn-secondary" disabled={checking} onClick={onRecheck}>{checking ? 'Checking…' : 'Re-check current revision'}</button></div>
    </div>}
    {behind && <p className="alert alert-info" role="status">Generated for revision <span className="mono">{f.revision}</span>; the record is now at revision <span className="mono">{incident.revision}</span>. Read it against the current record before acting.</p>}
    <p className="ws-fb-msg">{f.message}</p>
    {f.suggestedQuestion && <div className="ws-fb-question"><p className="caps">Suggested question</p><p className="ws-question">{f.suggestedQuestion}</p></div>}
    {deferredView && <div className="ws-hint">Listed as unresolved in the ER handoff until reviewed. <button type="button" className="btn btn-quiet" onClick={() => setReviewing(true)}>Review now</button></div>}

    {showActions && <div className="ws-fb-actions">
      <button type="button" className="btn" onClick={() => { setMode('clarify'); act.clear(); }}>Clarify</button>
      {f.status !== 'deferred' && <button type="button" className="btn btn-secondary" disabled={act.pending} onClick={() => void resolve('defer')}>{act.pending && pendingAction === 'defer' ? 'Saving “Defer”…' : 'Defer'}</button>}
      <button type="button" className="btn btn-secondary" onClick={() => { setMode('dismiss'); act.clear(); }}>Dismiss</button>
    </div>}
    {mode !== 'none' && <form className="ws-fb-form" onSubmit={e => { e.preventDefault(); void resolve(mode); }}>
      <label htmlFor={`fb-text-${f.id}`}>{mode === 'clarify' ? 'Your clarification — added beside the original; the original is not changed' : 'Reason for dismissing (optional) — the statement is kept as recorded'}</label>
      <textarea id={`fb-text-${f.id}`} className="field" rows={2} value={text} disabled={act.pending} onChange={e => setText(e.target.value)} />
      <div className="ws-actions">
        <button type="submit" className="btn" disabled={act.pending || (mode === 'clarify' && !text.trim())}>
          {act.pending ? (mode === 'clarify' ? 'Saving clarification…' : 'Saving “Dismiss”…') : mode === 'clarify' ? 'Save clarification' : 'Dismiss feedback'}
        </button>
        <button type="button" className="btn btn-secondary" disabled={act.pending} onClick={() => { setMode('none'); act.clear(); }}>Cancel</button>
      </div>
    </form>}
    <div aria-live="polite">
      {act.error && <p role="alert" className="alert alert-crit">
        {mode === 'clarify' ? 'Clarification not saved. Your text is kept. Retry when ready.' : `“${actionLabel[(pendingAction ?? 'defer') as 'clarify' | 'dismiss' | 'defer']}” not saved. The feedback is still open.`} <span className="ws-hint">({act.error.message})</span>
        {mode === 'none' && <button type="button" className="btn btn-quiet" onClick={() => act.clear()}>Back to feedback</button>}
      </p>}
    </div>

    <div className="ws-fb-disclosures">
      <button type="button" className="btn btn-quiet" aria-expanded={evOpen} onClick={() => setEvOpen(x => !x)}>{evOpen ? '▾' : '▸'} Patient evidence ({evidence.length})</button>
      <button type="button" className="btn btn-quiet" aria-expanded={refOpen} onClick={() => setRefOpen(x => !x)}>{refOpen ? '▾' : '▸'} Clinical reference{refs.length ? ` (${refs.length})` : ''}</button>
    </div>
    {evOpen && (evidence.length ? <SourceList sources={evidence} /> : <p className="ws-hint">No patient record sources are linked to this feedback.</p>)}
    {refOpen && <div className="ws-refs">
      {refs.map(r => <div key={r.id} className="ws-ref">
        <p><a href={r.url} target="_blank" rel="noreferrer">{r.title}</a> <span className="ws-hint">({[r.versionDate, r.section].filter(Boolean).join(' · ') || 'version not stated'})</span></p>
        {r.passage && <blockquote className="ws-quote">{r.passage}</blockquote>}
        <p className="ws-hint">{r.applicability} · <strong>{r.reviewStatus === 'clinician_reviewed' ? 'Clinician reviewed' : 'Not clinically reviewed'}</strong></p>
      </div>)}
      {refs.length === 0 && missingRefs.length === 0 && <p className="alert alert-info chip-demo-box">No verified clinical reference is attached to this feedback.</p>}
      {missingRefs.length > 0 && <p className="text-error">Reference not found in the record: {missingRefs.join(', ')}.</p>}
    </div>}

    {speech.supported && <div className="ws-actions">
      {speech.speakingId === f.id
        ? <><span role="status" className="ws-hint">Playing</span><button type="button" className="btn btn-secondary" onClick={stopSpeech}>Stop</button></>
        : <button type="button" className="btn btn-secondary" disabled={speech.muted} onClick={() => speak(f.id, spoken)}><span aria-hidden="true">▶</span> Play feedback</button>}
      {speech.muted && <span className="ws-hint">Muted.</span>}
    </div>}
    <p className="ws-hint">Spoken summary text: “{spoken}”</p>
    <p className="ws-hint ws-fb-foot">Generated for revision <span className="mono">{f.revision}</span>. The assistant proposes; nothing in the record changes until you save.</p>
  </div>;
}
