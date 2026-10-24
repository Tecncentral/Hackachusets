import { useCallback, useEffect, useRef, useState } from 'react';
import { PlatformError, patientScoped, useIncidentState, type Incident } from '../../platform';
import { latestTime } from '../../platform/labels';
import { clock } from '../../platform/time';
import { openFeedback, partitionObservations } from './model';
import { useHandoffDraft } from './useHandoffDraft';
import { CapturePanel } from './components/CapturePanel';
import { ObservationList, type EvaluationState } from './components/ObservationList';
import { IncidentSummary } from './components/IncidentSummary';
import { VitalsStrip } from './components/VitalsStrip';
import { ReassessmentPanel } from './components/ReassessmentPanel';
import { HandoffCard } from './components/HandoffCard';
import { HandoffReview } from './components/HandoffReview';
import './paramedic.css';

type Tab = 'capture' | 'care' | 'handoff';

/**
 * Requests an evaluation of a specific revision. Evaluation is not a save; it never touches the
 * header save status. The platform answers with the incident and records the outcome as an
 * Evaluation (completed / unavailable / failed / stale), which is what this state reports.
 */
export function useEvaluation() {
  const { platform, apply } = useIncidentState();
  const [state, setState] = useState<EvaluationState>({ status: 'idle', revision: null, error: null });
  const n = useRef(0);
  const run = useCallback(async (revision: number) => {
    const id = ++n.current;
    const requestId = crypto.randomUUID();
    setState({ status: 'checking', revision, error: null });
    try {
      const next = await platform.evaluate({ requestId, baseRevision: revision });
      if (id !== n.current) return;
      apply(next);
      const evaluation = next.evaluations.find(e => e.requestId === requestId);
      if (!evaluation || evaluation.status === 'completed') setState({ status: 'done', revision, error: null });
      else if (evaluation.status === 'stale') setState({ status: 'error', revision, error: new PlatformError('conflict', evaluation.error ?? 'New information was added while the check ran; its feedback was not applied.', 'evaluations') });
      else setState({ status: 'error', revision, error: new PlatformError(evaluation.status === 'unavailable' ? 'unavailable' : 'server', evaluation.error ?? 'Assistant check did not complete.', 'evaluations') });
    } catch (e) {
      if (id !== n.current) return;
      setState({ status: 'error', revision, error: e instanceof PlatformError ? e : new PlatformError('server', String(e), 'evaluations') });
    }
  }, [platform, apply]);
  return { state, run };
}

const focusLater = (el: () => HTMLElement | null) => requestAnimationFrame(() => {
  const t = el(); if (!t) return;
  t.scrollIntoView({ block: 'start', behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  t.focus({ preventScroll: true });
});

/** Trauma Llama EMT incident workspace (design: Main / Phone-A·B·C / Phone-Review). */
export function Workspace({ incident: raw }: { incident: Incident }) {
  // Patient-linked context appears only after the crew confirms the match; documentation never waits for it.
  const incident = patientScoped(raw);
  const [view, setView] = useState<'workspace' | 'review'>('workspace');
  const [tab, setTab] = useState<Tab>('capture');
  const [now, setNow] = useState(() => new Date().toISOString());
  useEffect(() => { const t = setInterval(() => setNow(new Date().toISOString()), 30000); return () => clearInterval(t); }, []);
  const handoff = useHandoffDraft(incident);
  const { draft, error: draftError } = handoff;
  const evaluation = useEvaluation();
  const captureH = useRef<HTMLHeadingElement>(null), reviewH = useRef<HTMLDivElement>(null);
  const unresolved = draft?.uncertainties.length ?? null;
  const attention = partitionObservations(incident).attention.filter(o => incident.feedback.some(f => f.observationIds.includes(o.id) && (f.status === 'open' || f.status === 'deferred'))).length
    + openFeedback(incident).filter(f => f.observationIds.length === 0).length;
  const dispatch = incident.sources.find(s => s.type === 'dispatch');
  const title = dispatch ? capitalize(dispatch.text.replace(/^Emergency call at [^:]+:\d\d [A-Z]+: /, '').replace(/\.$/, '')) : 'Incident';
  const arrival = latestTime(incident.timelineEvents, 'crew_arrival');

  const openReview = () => { setView('review'); focusLater(() => reviewH.current); };
  const back = () => { setView('workspace'); focusLater(() => document.getElementById('ws-hcard-h')); };
  const goTab = (t: Tab) => { setTab(t); window.scrollTo({ top: 0 }); };

  return <div className="ws" data-tab={tab} data-view={view}>
    <div className="ws-incident no-print">
      <div className="ws-incident-text">
        <p className="ws-incident-title"><span className="ws-hint">Incident <span className="mono">{incident.id}</span> ·</span> {title}</p>
        <p className="ws-hint">{arrival?.time ? <>Crew arrival <span className="mono">{clock(arrival.time)}</span> · </> : null}Now <span className="mono">{clock(now)}</span> · Revision <span className="mono">{incident.revision}</span></p>
      </div>
      {view === 'workspace'
        ? <button type="button" className="btn btn-secondary ws-incident-ho" onClick={openReview}>ER handoff · {unresolved ?? '…'} unresolved</button>
        : <button type="button" className="btn btn-secondary" onClick={back}>Back to workspace</button>}
    </div>

    {view === 'review' ? <div ref={reviewH} tabIndex={-1} aria-label="Handoff review">
      <HandoffReview incident={incident} draft={draft} draftError={draftError} onDraft={handoff.setDraft} onBack={back} />
    </div> : <>
      <VitalsStrip incident={incident} />
      <div className="ws-body">
        <div className="ws-col ws-col-summary" data-tabs="capture"><IncidentSummary incident={incident} /></div>
        <div className="ws-col ws-col-centre" data-tabs="capture">
          <CapturePanel incident={incident} headingRef={captureH} onSaved={revision => void evaluation.run(revision)} />
          <ObservationList incident={incident} evaluation={evaluation.state} onRecheck={() => void evaluation.run(incident.revision)} />
        </div>
        <div className="ws-col ws-col-right">
          <div data-tabs="care"><ReassessmentPanel incident={incident} /></div>
          <div data-tabs="handoff"><HandoffCard incident={incident} draft={draft} draftError={draftError} onReview={openReview} /></div>
        </div>
      </div>
      <nav className="ws-tabbar no-print" aria-label="Workspace sections">
        <button type="button" aria-current={tab === 'capture' ? 'page' : undefined} onClick={() => goTab('capture')}>Capture{attention ? ` · ${attention}` : ''}</button>
        <button type="button" aria-current={tab === 'care' ? 'page' : undefined} onClick={() => goTab('care')}>Care &amp; vitals</button>
        <button type="button" aria-current={tab === 'handoff' ? 'page' : undefined} onClick={() => goTab('handoff')}>Handoff{unresolved !== null ? ` · ${unresolved}` : ''}</button>
      </nav>
    </>}
  </div>;
}

const capitalize = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
