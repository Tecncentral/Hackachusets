// Patient companion (#patient) — a simulated demo surface for setting up an emergency profile before
// an emergency: profile, optional wearable, sharing choices, a scripted sync and the connected home.
// Profile edits, sharing choices and the sync animation are browser-local and synthetic. There is no
// wearable integration, provider login or profile endpoint. The platform's real emergency-sharing
// setting is a separate, explicit control (PlatformSharing).
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { WorkspaceIncident as Incident } from '../../platform';
import { CrewPreview, Home } from './Home';
import { StepTracker } from './parts';
import { ProfileStep, SharingStep, WearableStep } from './Steps';
import { SyncStep, type SyncStatus } from './SyncStep';
import { PlatformSharing } from './PlatformSharing';
import { clear, initialState, load, reducer, save, type CompanionState, type ShareKey, type Step } from './state';
import { createScriptedSource, type SyncProgress, type WearableSource } from './wearableSource';
import './patient.css';

const IDLE: SyncProgress = { stage: 1, acts: 0, actsReady: 0, pts: 0, prof: 0 };

function useSystemReducedMotion() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const m = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!m) return;
    setOn(m.matches);
    const f = (e: MediaQueryListEvent) => setOn(e.matches);
    m.addEventListener('change', f);
    return () => m.removeEventListener('change', f);
  }, []);
  return on;
}

export function PatientPage({ incident, initial, source: injected }: { incident: Incident; initial?: Partial<CompanionState>; source?: WearableSource }) {
  const [s, dispatch] = useReducer(reducer, undefined, () => ({ ...(initial ? initialState() : load()), ...initial }));
  useEffect(() => { if (!initial) save(s); }, [s, initial]);

  const [toastMsg, setToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const toast = useCallback((m: string) => { setToast(m); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(''), 3200); }, []);

  // Demo controls
  const [demoOpen, setDemoOpen] = useState(false);
  const failNext = useRef(false);
  const [failArmed, setFailArmed] = useState(false);
  const [forceReduce, setForceReduce] = useState(false);
  const systemReduce = useSystemReducedMotion();
  const reduced = forceReduce || systemReduce;
  const source = useMemo(() => injected ?? createScriptedSource({ failNext: () => { const f = failNext.current; failNext.current = false; setFailArmed(false); return f; } }), [injected]);

  // Sync run (the scripted source drives progress; the UI only renders it)
  const [progress, setProgress] = useState<SyncProgress>(IDLE);
  const [status, setStatus] = useState<SyncStatus>('running');
  const run = useRef<AbortController | null>(null);
  const runSync = useCallback((device = s.device) => {
    run.current?.abort();
    const c = new AbortController(); run.current = c;
    dispatch({ type: 'go', step: 'sync' });
    setStatus('running'); setProgress({ ...IDLE, stage: device ? 1 : 4 });
    void source.sync({ device, activity: s.options.activity, heartRate: s.options.heartRate, reducedMotion: reduced }, p => { if (run.current === c) setProgress(p); }, c.signal).then(r => {
      if (run.current !== c) return; // superseded by a newer run
      setStatus(r.status);
      if (r.status === 'complete') dispatch({ type: 'syncComplete' });
    });
  }, [s.device, s.options, reduced, source]);
  useEffect(() => () => run.current?.abort(), []);

  // Sharing opened from Home: Cancel restores the earlier choices.
  const shareSnapshot = useRef<Record<ShareKey, boolean> | null>(null);
  const reviewSharing = () => { shareSnapshot.current = s.share; dispatch({ type: 'go', step: 'sharing', returnHome: true }); };

  // Move focus to the new screen's heading.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0 });
      // Only when the control that changed the screen has gone (focus fell to <body>); never steal focus from a dialog or a control.
      const active = document.activeElement;
      if (active && active !== document.body) return;
      const h = document.querySelector<HTMLElement>('.pt h1'); if (h) { h.tabIndex = -1; h.focus(); }
    });
  }, [s.step]);

  const go = (step: Step) => { run.current?.abort(); dispatch({ type: 'go', step }); };
  const [previewOpen, setPreviewOpen] = useState(false);
  const inFlow = s.step !== 'home';

  return <div className={`pt${reduced ? ' pt-reduce' : ''}`}>
    <div className="pt-demo" role="note">
      <button type="button" className="btn btn-quiet pt-demo-toggle" aria-expanded={demoOpen} onClick={() => setDemoOpen(o => !o)}>{demoOpen ? '▾' : '▸'} Prototype controls</button>
      <span className="pt-demo-note">Simulated patient companion · synthetic data · choices kept in this browser</span>
      {demoOpen && <div className="pt-demo-row">
        {(['profile', 'wearable', 'sharing'] as Step[]).map(k => <button key={k} type="button" className="btn btn-demo" onClick={() => go(k)}>{k[0].toUpperCase() + k.slice(1)}</button>)}
        <button type="button" className="btn btn-demo" onClick={() => { const d = s.device ?? 'whoop'; if (!s.device) dispatch({ type: 'connected', device: d, options: s.options }); runSync(d); }}>Sync</button>
        <button type="button" className="btn btn-demo" onClick={() => { const d = s.device ?? 'whoop'; if (!s.device) dispatch({ type: 'connected', device: d, options: s.options }); dispatch({ type: 'syncComplete' }); go('home'); }}>Home</button>
        <button type="button" className="btn btn-demo" aria-pressed={failArmed} onClick={() => { failNext.current = !failArmed; setFailArmed(!failArmed); }}>Next sync fails</button>
        <button type="button" className="btn btn-demo" aria-pressed={reduced} disabled={systemReduce} onClick={() => setForceReduce(r => !r)}>Reduce motion{systemReduce ? ' (system)' : ''}</button>
        <button type="button" className="btn btn-demo" onClick={() => { run.current?.abort(); clear(); dispatch({ type: 'reset' }); }}>Reset demo profile</button>
      </div>}
    </div>

    <div className="pt-main">
      {inFlow && <StepTracker step={s.step} />}
      {toastMsg && <div role="status" className="pt-toast pt-in">{toastMsg}</div>}

      {!inFlow ? <Home s={s} dispatch={dispatch} toast={toast} incident={incident} onReviewSharing={reviewSharing} onReconnect={() => runSync()} />
        : <div className="pt-flow">
          <div className="pt-flow-main">
            {s.step === 'profile' && <ProfileStep s={s} dispatch={dispatch} toast={toast} />}
            {s.step === 'wearable' && <WearableStep s={s} dispatch={dispatch} toast={toast} source={source} />}
            {s.step === 'sharing' && <>
              <SharingStep s={s} dispatch={dispatch} toast={toast}
                onSave={() => { if (s.returnHome) { shareSnapshot.current = null; dispatch({ type: 'go', step: 'home' }); toast('Sharing choices saved'); } else runSync(); }}
                onBack={() => { if (s.returnHome) { if (shareSnapshot.current) dispatch({ type: 'setShare', share: shareSnapshot.current }); dispatch({ type: 'go', step: 'home' }); } else dispatch({ type: 'go', step: s.device ? 'wearable' : 'profile' }); }} />
              <PlatformSharing incident={incident} />
            </>}
            {s.step === 'sync' && <SyncStep device={s.device} options={s.options} progress={progress} status={status}
              onCancel={() => run.current?.abort()} onRetry={() => runSync()}
              onNoDevice={() => { dispatch({ type: 'removeReadings' }); runSync(null); }} onDone={() => dispatch({ type: 'go', step: 'home' })} />}
          </div>
          <div className="pt-flow-aside">
            <button type="button" className="btn btn-secondary pt-preview-toggle" aria-expanded={previewOpen} aria-controls="pt-preview" onClick={() => setPreviewOpen(o => !o)}>
              What a crew would see · {previewOpen ? 'Hide' : 'Show'}
            </button>
            <div id="pt-preview" className="pt-preview" data-open={previewOpen}><CrewPreview s={s} /></div>
          </div>
        </div>}
    </div>
  </div>;
}
