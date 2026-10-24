import { useRef, useState } from 'react';
import type { WorkspaceIncident } from '../../platform';
import { nextStep } from './model';
import { IncidentHeader } from './components/IncidentHeader';
import { NoteForm } from './components/NoteForm';
import { MeasurementForm } from './components/MeasurementForm';
import { CareForm, TimeForm } from './components/CareForm';
import { FeedbackPanel } from './components/FeedbackPanel';
import { StatusSummary } from './components/StatusSummary';
import { RecordPanel } from './components/RecordPanel';
import { HandoffPanel } from './components/HandoffPanel';
import './paramedic.css';

type CaptureMode = 'note' | 'measurement' | 'care' | 'time';
const MODES: Array<{ id: CaptureMode; label: string }> = [{ id: 'note', label: 'Observation' }, { id: 'measurement', label: 'Measurement' }, { id: 'care', label: 'Care event' }, { id: 'time', label: 'Key time' }];

const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
function goTo(el: HTMLElement | null) {
  if (!el) return;
  el.scrollIntoView({ block: 'start', behavior: reduceMotion() ? 'auto' : 'smooth' });
  el.focus({ preventScroll: true });
}

/** EMT incident workspace: capture → assistant feedback → care/reassessment → handoff, on one page. */
export function Workspace({ incident }: { incident: WorkspaceIncident; assistantSwitch?: boolean }) {
  const [mode, setMode] = useState<CaptureMode>('note');
  const [captureKey, setCaptureKey] = useState(0);
  const [handoffOpen, setHandoffOpen] = useState(false);
  const capture = useRef<HTMLHeadingElement>(null), feedback = useRef<HTMLHeadingElement>(null), handoff = useRef<HTMLHeadingElement>(null);
  const step = nextStep(incident);

  const openCapture = (m: CaptureMode) => { setMode(m); setCaptureKey(k => k + 1); requestAnimationFrame(() => goTo(capture.current)); };
  const openHandoff = () => { setHandoffOpen(true); requestAnimationFrame(() => goTo(handoff.current)); };
  const primary = () => {
    switch (step.id) {
      case 'associate': goTo(document.getElementById('ws-code')); break;
      case 'capture': openCapture('note'); break;
      case 'feedback': goTo(feedback.current); break;
      case 'temperature': openCapture('measurement'); break;
      case 'care': openCapture('care'); break;
      case 'review': openHandoff(); break;
      case 'shared': location.hash = 'er'; break;
    }
  };

  return <div className="ws">
    <IncidentHeader incident={incident} />
    {incident.patient.matched && <>
      <div className="ws-next no-print" role="region" aria-label="Next step">
        <div className="ws-next-text"><p className="ws-label">Next step · optional</p><p className="ws-next-title">{step.title}</p><p className="ws-hint">{step.detail}</p></div>
        <div className="ws-next-actions">
          <button type="button" className="btn" onClick={primary}>{step.action}</button>
          {step.id !== 'capture' && <button type="button" className="btn btn-secondary" onClick={() => openCapture('note')}>Add observation</button>}
          {step.id !== 'review' && step.id !== 'shared' && <button type="button" className="btn btn-secondary" onClick={openHandoff}>Handoff</button>}
        </div>
      </div>

      <div className="ws-grid">
        <div className="ws-col">
          <section className="card ws-capture" aria-labelledby="ws-cap-h">
            <h2 id="ws-cap-h" ref={capture} tabIndex={-1}>Capture</h2>
            <div className="ws-seg" role="group" aria-label="Entry type">
              {MODES.map(m => <button key={m.id} type="button" className="ws-seg-btn" aria-pressed={mode === m.id} onClick={() => setMode(m.id)}>{m.label}</button>)}
            </div>
            <div key={`${mode}-${captureKey}`}>
              {mode === 'note' && <NoteForm incident={incident} />}
              {mode === 'measurement' && <MeasurementForm incident={incident} />}
              {mode === 'care' && <CareForm incident={incident} />}
              {mode === 'time' && <TimeForm incident={incident} />}
            </div>
          </section>
          <FeedbackPanel incident={incident} headingRef={feedback} />
        </div>
        <div className="ws-col">
          <StatusSummary incident={incident} />
          <RecordPanel incident={incident} />
        </div>
      </div>
      <HandoffPanel incident={incident} open={handoffOpen} onOpen={() => setHandoffOpen(true)} headingRef={handoff} />
    </>}
  </div>;
}
