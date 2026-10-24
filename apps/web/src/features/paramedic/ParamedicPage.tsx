import { useState } from 'react';
import { DemoInitial, DemoClarification } from '@scenebrief/contracts';
import type { ScreenProps } from '../../types';
export function ParamedicPage({ incident, busy, act }: ScreenProps) {
 const [text, setText] = useState(DemoInitial);
 const [patientId, setPatientId] = useState('patient-demo-01');
 if (!incident.patient.matched) return <section><h2>Confirm patient association</h2><p>Dispatch: person found down near running trail. Do not assign the caller’s history automatically.</p>
 <label>Demo patient identifier<input value={patientId} onChange={e => setPatientId(e.target.value)}/></label>
 <button disabled={busy || !incident.patient.sharing} onClick={() => void act('match', { patientId, confirmed: true })}>Confirm this is the patient</button>
 {!incident.patient.sharing && <p>Enable sharing in the patient view first.</p>}</section>;
 const initial = incident.claims.find(c => c.value === DemoInitial && c.status === 'reported');
 return <section><h2>Capture → clarify → hand off</h2><p>{incident.patient.name} · Revision {incident.revision}</p>
 <article><h3>Capture account</h3><p>Text-only adapter. Voice transcription and camera capture are assigned workstreams, not connected features.</p>
 <label>Transcript<textarea value={text} onChange={e => setText(e.target.value)} rows={4}/></label>
 <div className="row"><button disabled={busy || !text.trim()} onClick={() => void act('transcripts', { requestId: crypto.randomUUID(), text })}>Record account</button>
 <button className="secondary" onClick={() => setText(DemoInitial)}>Load initial account</button>
 <button className="secondary" onClick={() => setText(DemoClarification)}>Load clarification</button></div></article>
 {initial && <article className="notice"><h3>Timing needs clarification</h3><p>Workout record starts at 09:05; dispatch call is recorded at 10:44. The account says “five minutes.”</p><strong>Did the friend witness the collapse or find the patient afterward?</strong><p>Inspect the evidence below. Keep the timing unresolved if it cannot be clarified.</p></article>}
 <article><h3>Incident claims</h3>{incident.claims.map(c => <div className="entry" key={c.id}><strong>{c.field}: {c.value ?? 'Unknown'}</strong><p>{c.status} · Sources: {c.sourceIds.join(', ') || 'none'}</p></div>)}</article>
 <article><h3>Source evidence</h3>{incident.sources.map(s => <details key={s.id}><summary>{s.label}</summary><p>{s.text}</p><small>Event: {s.eventTime ?? 'unknown'} · Captured: {s.capturedAt} · ID: {s.id}</small></details>)}</article>
 <article><h3>Assessment reference</h3><p>Reserved for agency-approved, versioned content matched to certification. No clinical instructions are implemented in this scaffold.</p></article>
 <article><h3>Handoff review</h3><p>Review the claims and sources above. Unknown collapse time stays unknown; device events do not establish downtime.</p>
 <button disabled={busy} onClick={() => void act('handoffs', { revision: incident.revision, reviewedBy: 'Demo paramedic' })}>Mark reviewed and share demo handoff</button></article></section>;
}
