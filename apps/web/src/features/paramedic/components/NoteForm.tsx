import { useState } from 'react';
import { DemoInitial } from '@scenebrief/contracts';
import { errorMessage, useAction, useIncidentState, type Observation, type WorkspaceIncident } from '../../../platform';
import { OBS_LABEL } from '../../../platform/draft';
import { zoneTimeToIso } from '../../../platform/time';
import { incidentDate } from '../model';
import { MAX_SECONDS, recorderSupport, useRecorder } from '../recorder';
import { SaveStatus, TimeField, useRequestId } from './fields';

/** Scenario examples. Loading one is labeled as an example, never as a recording. */
export const EXAMPLES: Array<{ label: string; text: string; category: Observation['category'] }> = [
  { label: 'Witness account', text: DemoInitial, category: 'account' },
  { label: 'Skin-temperature inference', text: 'The wearable skin temperature is elevated, so core temperature is confirmed high.', category: 'general' },
  { label: 'Sweating inference', text: 'He is sweating, so this cannot be heat stroke.', category: 'skin' }
];

type Origin = { mode: Observation['inputMode']; detail: string | null };

export function NoteForm({ incident, onSaved }: { incident: WorkspaceIncident; onSaved?: () => void }) {
  const { platform } = useIncidentState();
  const save = useAction();
  const req = useRequestId();
  const audioReq = useRequestId();
  const rec = useRecorder();
  const [text, setText] = useState('');
  const [category, setCategory] = useState<Observation['category']>('general');
  const [observed, setObserved] = useState('');
  const [origin, setOrigin] = useState<Origin>({ mode: 'typed', detail: null });
  const [compat, setCompat] = useState<string | null>(null);
  const [tx, setTx] = useState<{ state: 'idle' | 'pending' | 'error'; message?: string }>({ state: 'idle' });
  const support = recorderSupport();

  const transcribe = async (blob: Blob) => {
    setTx({ state: 'pending' });
    try {
      const result = await platform.transcribe(blob, audioReq.forContent(`${blob.size}-${blob.type}`));
      audioReq.done(); rec.clear(); setTx({ state: 'idle' });
      if (!result.transcript.trim()) { setTx({ state: 'error', message: 'Transcription returned no text. Type the observation or record again.' }); return; }
      setText(t => (t.trim() ? `${t.trim()} ${result.transcript.trim()}` : result.transcript.trim()));
      setOrigin({ mode: 'voice-reviewed', detail: `Transcribed from your recording (${result.mode})${result.warnings.length ? ` · ${result.warnings.join('; ')}` : ''}. Review and edit before saving.` });
    } catch (e) {
      setTx({ state: 'error', message: `Transcription failed: ${errorMessage(e)} Your text is unchanged.` });
    }
  };

  const submit = async () => {
    const body = { text: text.trim(), category, observedAt: observed ? zoneTimeToIso(incidentDate(incident), observed) : null, inputMode: origin.mode };
    const result = await save.run(() => platform.addObservation({ ...body, requestId: req.forContent(JSON.stringify(body)), baseRevision: incident.revision }), r => r.incident);
    if (result) { req.done(); setCompat(result.compatibility); setText(''); setObserved(''); setOrigin({ mode: 'typed', detail: null }); onSaved?.(); }
  };

  const recording = rec.state.phase === 'recording';
  return <form className="ws-form" onSubmit={e => { e.preventDefault(); void submit(); }} aria-label="Add observation">
    <div className="ws-voice">
      {!recording && rec.state.phase !== 'requesting' && <button type="button" className="btn ws-mic" disabled={!support.ok || tx.state === 'pending'} onClick={() => void rec.start()} aria-describedby="ws-voice-help">
        <span aria-hidden="true">●</span> Record voice note
      </button>}
      {rec.state.phase === 'requesting' && <p className="ws-hint" role="status">Waiting for microphone permission…</p>}
      {recording && <div className="ws-recording" role="status">
        <span className="ws-rec-dot" aria-hidden="true" /> <strong>Recording</strong> {rec.elapsed}s of {MAX_SECONDS}s
        <button type="button" className="btn" onClick={rec.stop}>Stop</button>
        <button type="button" className="btn btn-secondary" onClick={rec.cancel}>Cancel</button>
      </div>}
      {rec.state.phase === 'stopped' && tx.state !== 'pending' && <div className="ws-recorded">
        <p>Recorded {rec.state.seconds}s. Audio is sent for transcription and not stored by this website.</p>
        <button type="button" className="btn" onClick={() => rec.state.phase === 'stopped' && void transcribe(rec.state.blob)}>{tx.state === 'error' ? 'Retry transcription' : 'Transcribe'}</button>
        <button type="button" className="btn btn-secondary" onClick={() => { rec.clear(); audioReq.done(); setTx({ state: 'idle' }); }}>Discard recording</button>
      </div>}
      {tx.state === 'pending' && <p role="status" className="text-quiet">Uploading and transcribing…</p>}
      {tx.state === 'error' && <p role="alert" className="text-error">{tx.message}</p>}
      {rec.state.phase === 'error' && <p role="alert" className="text-error">{rec.state.message}</p>}
      <p id="ws-voice-help" className="ws-hint">{support.ok ? 'Voice becomes an editable transcript. Nothing is saved until you choose Save observation.' : support.message}</p>
    </div>

    <div className="ws-field">
      <label htmlFor="ws-note">Observation</label>
      <textarea id="ws-note" rows={3} value={text} maxLength={5000} aria-describedby="ws-note-origin"
        onChange={e => { setText(e.target.value); if (!e.target.value) setOrigin({ mode: 'typed', detail: null }); }} />
      <p id="ws-note-origin" className="ws-hint" aria-live="polite">
        {origin.mode === 'example' ? <><span className="tag tag-warn">Example transcript</span> Loaded text, not a recording.</> : origin.detail ?? (text ? 'Typed note.' : '')}
      </p>
    </div>
    <div className="ws-row">
      <div className="ws-field">
        <label htmlFor="ws-note-cat">Category</label>
        <select id="ws-note-cat" value={category} onChange={e => setCategory(e.target.value as Observation['category'])}>
          {Object.entries(OBS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <TimeField id="ws-note-time" label="Observed at (optional)" value={observed} onChange={setObserved} />
    </div>
    <div className="ws-actions">
      <button type="submit" className="btn" disabled={save.pending || !text.trim() || recording}>{save.state === 'error' ? 'Retry save' : 'Save observation'}</button>
    </div>
    <SaveStatus state={save.state} error={save.error} saved="Observation added to the incident." compat={compat} />

    <details className="ws-examples">
      <summary>Example transcripts (for testing — not recordings)</summary>
      <div className="ws-actions">
        {EXAMPLES.map(x => <button key={x.label} type="button" className="btn btn-secondary" onClick={() => { setText(x.text); setCategory(x.category); setOrigin({ mode: 'example', detail: null }); save.clear(); }}>{x.label}</button>)}
      </div>
    </details>
  </form>;
}
