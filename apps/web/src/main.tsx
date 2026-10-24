import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Incident } from '@scenebrief/contracts';
import { fetchIncident, mutate } from './api';
import { PatientPage } from './features/patient/PatientPage';
import { ParamedicPage } from './features/paramedic/ParamedicPage';
import { ErPage } from './features/er/ErPage';
import './style.css';
function App() {
 const [incident, setIncident] = useState<Incident>();
 const [error, setError] = useState(''), [busy, setBusy] = useState(false);
 const [view, setView] = useState(location.hash.slice(1) || 'paramedic');
 useEffect(() => { const onHash = () => setView(location.hash.slice(1) || 'paramedic'); window.addEventListener('hashchange', onHash); return () => window.removeEventListener('hashchange', onHash); }, []);
 // Bumped on every mutation; a poll that started before a mutation must not overwrite its newer result.
 const mutationSeq = useRef(0);
 useEffect(() => { let active = true; const load = async () => { const seq = mutationSeq.current; try { const data = await fetchIncident(); if (active && seq === mutationSeq.current) setIncident(data); } catch (e) { if (active) setError(String(e)); } }; void load(); const timer = setInterval(() => void load(), 2000); return () => { active = false; clearInterval(timer); }; }, []);
 const act = async (path: string, body?: unknown) => { mutationSeq.current++; setBusy(true); setError(''); try { const data = await mutate(path, body); mutationSeq.current++; setIncident(data); } catch(e) { setError(String(e)); } finally { setBusy(false); } };
 const props = incident ? { incident, busy, act } : null;
 return <main><header><span className="eyebrow">SYNTHETIC DATA · DEVELOPMENT SCAFFOLD</span><h1>SceneBrief</h1><p>Capture the account. Preserve the evidence.</p></header>
 <nav aria-label="Demo views">{['patient','paramedic','er'].map(v => <a key={v} aria-current={view === v ? 'page' : undefined} href={`#${v}`}>{v === 'er' ? 'ER handoff' : v}</a>)}<button className="secondary" disabled={busy} onClick={() => { if(window.confirm('Reset the shared synthetic incident for every demo view?')) void act('reset'); }}>Reset demo</button></nav>
 {error && <p role="alert" className="notice">{error}</p>}
 {!props ? <p>Loading incident…</p> : view === 'patient' ? <PatientPage {...props}/> : view === 'er' ? <ErPage {...props}/> : <ParamedicPage {...props}/>}
 <footer>Local, in-memory demo. No authentication, real patient data, clinical guidance, or production integrations. Restarting the API resets all records.</footer></main>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
