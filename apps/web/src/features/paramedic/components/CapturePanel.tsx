import { useEffect, useState, type Ref } from 'react';
import { ExampleStatements } from '@scenebrief/fixtures';
import { errorMessage, useAction, useIncidentState, type Incident, type Observation } from '../../../platform';
import { OBS_LABEL, REPORTED_BY_LABEL } from '../../../platform/labels';
import { clock, zoneTimeToIso } from '../../../platform/time';
import { incidentDate } from '../model';
import { MAX_SECONDS, recorderSupport, useRecorder } from '../recorder';
import { useSpeechState } from '../speech';
import { TimeField, useRequestId } from './fields';

/**
 * Scenario examples from the shared fixture (the platform's mock assistant replays feedback for these
 * exact statements). Loading one is labeled as an example, never as a recording; once saved it is the
 * crew's typed entry.
 */
export const EXAMPLES: Array<{ label: string; text: string; category: Observation['category']; reportedBy: Observation['reportedBy'] }> = [
  { label: 'Witness account', text: ExampleStatements.witnessAccount, category: 'account', reportedBy: 'witness' },
  { label: 'Skin-temperature inference', text: ExampleStatements.skinTemperatureInference, category: 'general', reportedBy: 'crew' },
  { label: 'Sweating inference', text: ExampleStatements.sweatingInference, category: 'skin', reportedBy: 'crew' }
];

type Origin = 'typed' | 'voice' | 'example';
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/**
 * Capture state machine (design §6): idle → recording → transcribing → transcript review → saving.
 * Typed input is always available. Nothing is saved until "Save observation", and only shown as
 * saved after the platform returns it. Text is never cleared on failure.
 */
export function CapturePanel({ incident, onSaved, headingRef }: { incident: Incident; onSaved: (revision: number) => void; headingRef?: Ref<HTMLHeadingElement> }) {
  const { platform } = useIncidentState();
  const save = useAction();
  const req = useRequestId();
  const audioReq = useRequestId();
  const rec = useRecorder();
  const speech = useSpeechState();
  const [text, setText] = useState('');
  const [origin, setOrigin] = useState<Origin>('typed');
  const [category, setCategory] = useState<Observation['category']>('general');
  const [reportedBy, setReportedBy] = useState<Observation['reportedBy']>('crew');
  const [observed, setObserved] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [tx, setTx] = useState<{ state: 'idle' | 'pending' | 'error'; message?: string; warnings?: string[]; mode?: string }>({ state: 'idle' });
  const [saved, setSaved] = useState<{ at: string; revision: number } | null>(null);
  const [examplesOpen, setExamplesOpen] = useState(false);
  const support = recorderSupport();
  const recording = rec.state.phase === 'recording' || rec.state.phase === 'requesting';
  const saving = save.pending;

  // When a recording stops, transcribe it automatically ("Stop and transcribe").
  useEffect(() => {
    if (rec.state.phase !== 'stopped') return;
    const blob = rec.state.blob;
    setTx({ state: 'pending' });
    platform.transcribe(blob, audioReq.forContent(`${blob.size}-${blob.type}`)).then(result => {
      audioReq.done(); rec.clear();
      if (!result.transcript.trim()) { setTx({ state: 'error', message: 'Transcription returned no text. Recording was not saved. Type the observation instead.' }); return; }
      setText(t => (t.trim() ? `${t.trim()} ${result.transcript.trim()}` : result.transcript.trim()));
      setOrigin('voice');
      setTx({ state: 'idle', warnings: result.warnings, mode: result.mode });
    }, e => {
      audioReq.done(); rec.clear();
      setTx({ state: 'error', message: `Transcription unavailable. Recording was not saved. Type the observation instead. (${errorMessage(e)})` });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rec.state.phase]);

  const startRecording = () => {
    setNotice(speech.speakingId ? 'Feedback playback stopped so recording could start.' : null);
    setSaved(null); setTx({ state: 'idle' });
    void rec.start(); // stops speech before opening the microphone
  };
  const cancelRecording = () => { rec.cancel(); setNotice('Recording discarded. Nothing was saved.'); };
  const discard = () => { setText(''); setOrigin('typed'); setTx({ state: 'idle' }); setNotice('Draft discarded. Nothing was saved.'); save.clear(); };

  const submit = async () => {
    // inputMode "transcribed" = assistant transcript reviewed by the crew (contract). Examples are typed entries.
    const body = { text: text.trim(), category, reportedBy, observedAt: observed ? zoneTimeToIso(incidentDate(incident), observed) : null, inputMode: origin === 'voice' ? 'transcribed' as const : 'typed' as const };
    const result = await save.run(() => platform.addObservation({ ...body, requestId: req.forContent(JSON.stringify(body)), baseRevision: incident.revision }));
    if (result) {
      req.done();
      setSaved({ at: new Date().toISOString(), revision: result.revision });
      setText(''); setObserved(''); setOrigin('typed'); setReportedBy('crew'); setNotice(null); setTx({ state: 'idle' });
      onSaved(result.revision);
    }
  };

  const label = origin === 'voice' ? 'Transcript — review and edit before saving' : origin === 'example' ? 'Example transcript (demo, not recorded) — edit before saving' : 'Or type an observation';
  const micError = rec.state.phase === 'error' ? rec.state : null;

  return <section className="card ws-capture" aria-labelledby="ws-cap-h">
    <div className="ws-section-head">
      <h2 id="ws-cap-h" ref={headingRef} tabIndex={-1}>Capture observation</h2>
    </div>

    {!recording && rec.state.phase !== 'stopped' && tx.state !== 'pending' && <div className="ws-cap-start">
      <button type="button" className="btn btn-record" disabled={!support.ok || saving} onClick={startRecording}>
        <span aria-hidden="true">●</span> Record observation
      </button>
      <button type="button" className="btn btn-demo" aria-expanded={examplesOpen} onClick={() => setExamplesOpen(o => !o)} disabled={saving}>
        <span className="demo-tag">DEMO</span> Load example transcript
      </button>
    </div>}
    {examplesOpen && !recording && <div className="ws-examples" role="group" aria-label="Example transcripts (demo, not recorded)">
      {EXAMPLES.map(x => <button key={x.label} type="button" className="btn btn-demo" onClick={() => { setText(x.text); setCategory(x.category); setReportedBy(x.reportedBy); setOrigin('example'); setExamplesOpen(false); save.clear(); setSaved(null); }}>{x.label}</button>)}
    </div>}

    {recording && <div className="ws-recording">
      <p role="status" aria-live="polite" className="ws-rec-status">
        <span className="ws-rec-dot" aria-hidden="true" /> {rec.state.phase === 'requesting' ? 'Waiting for microphone permission…' : <>Recording <span className="mono">{mmss(rec.elapsed)}</span> <span className="ws-hint">(stops at {mmss(MAX_SECONDS)})</span></>}
      </p>
      <div className="ws-actions">
        <button type="button" className="btn btn-stop" disabled={rec.state.phase !== 'recording'} onClick={rec.stop}><span aria-hidden="true">■</span> Stop and transcribe</button>
        <button type="button" className="btn btn-secondary" onClick={cancelRecording}>Cancel recording</button>
      </div>
    </div>}
    {(rec.state.phase === 'stopped' || tx.state === 'pending') && <p role="status" aria-live="polite" className="alert alert-info">Transcribing… Nothing is saved until you choose Save observation.</p>}

    <div aria-live="polite">
      {notice && <p className="ws-hint">{notice}</p>}
      {micError && <div role="alert" className="alert alert-attn"><strong>Microphone not available.</strong> Type the observation below — it is saved the same way. <span className="ws-hint">({micError.message})</span></div>}
      {!support.ok && !micError && <p className="ws-hint">{support.message}</p>}
      {tx.state === 'error' && <div role="alert" className="alert alert-attn">{tx.message}</div>}
    </div>

    <form onSubmit={e => { e.preventDefault(); void submit(); }} aria-label="Observation text">
      <label htmlFor="ws-note" className="ws-field-label">{label}</label>
      <textarea id="ws-note" className="field ws-textarea" rows={3} value={text} maxLength={5000} disabled={recording || saving}
        onChange={e => { setText(e.target.value); if (!e.target.value) setOrigin('typed'); setSaved(null); }} />
      {origin === 'voice' && tx.mode && <p className="ws-hint">Transcribed ({tx.mode}){tx.warnings?.length ? ` · ${tx.warnings.join('; ')}` : ''}. Saved as a transcribed, crew-reviewed entry.</p>}
      {origin === 'example' && <p className="ws-hint"><span className="chip chip-demo">Example</span> Demo text, not a recording. Saved as your typed entry once you save it.</p>}
      {recording && <p className="ws-hint">Typing paused while recording.</p>}

      <details className="ws-cap-more">
        <summary>Category, reported by and observed time <span className="ws-hint">({OBS_LABEL[category]} · {REPORTED_BY_LABEL[reportedBy]}{observed ? ` · ${observed}` : ''})</span></summary>
        <div className="ws-row">
          <div className="ws-field">
            <label htmlFor="ws-note-cat">Category</label>
            <select id="ws-note-cat" className="field" value={category} onChange={e => setCategory(e.target.value as Observation['category'])}>
              {Object.entries(OBS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="ws-field">
            <label htmlFor="ws-note-by">Reported by</label>
            <select id="ws-note-by" className="field" value={reportedBy} onChange={e => setReportedBy(e.target.value as Observation['reportedBy'])}>
              {Object.entries(REPORTED_BY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <TimeField id="ws-note-time" label="Observed at (optional)" value={observed} onChange={setObserved} />
        </div>
      </details>

      <div className="ws-actions">
        <button type="submit" className="btn" disabled={saving || recording || !text.trim()}>{saving ? 'Saving…' : save.state === 'error' ? 'Retry save' : 'Save observation'}</button>
        {text && !saving && origin !== 'typed' && <button type="button" className="btn btn-secondary" onClick={discard}>Discard draft</button>}
      </div>
    </form>

    <div aria-live="polite">
      {save.state === 'error' && save.error && <div role="alert" className="alert alert-crit">
        <strong>Observation not saved.</strong> Your text is kept above. {save.error.kind === 'unavailable' ? 'This platform does not accept observations yet.' : save.error.kind === 'network' ? 'Check connection and retry.' : save.error.message}
      </div>}
      {saved && <p className="alert alert-ok">Observation saved at <span className="mono">{clock(saved.at)}</span> · revision <span className="mono">{saved.revision}</span>.</p>}
    </div>
  </section>;
}
