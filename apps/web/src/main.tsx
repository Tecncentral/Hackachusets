import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { IncidentProvider, errorMessage, selectPlatform, useAction, useIncidentState, type AssistantStatus } from './platform';
import { Workspace } from './features/paramedic/Workspace';
import { ErPage } from './features/er/ErPage';
import { PatientPage } from './features/patient/PatientPage';
import './style.css';

const VIEWS = [{ id: 'paramedic', label: 'EMT workspace' }, { id: 'er', label: 'Receiving view' }, { id: 'patient', label: 'Patient sharing (demo)' }] as const;
type View = typeof VIEWS[number]['id'];
const viewFromHash = (): View => (VIEWS.find(v => v.id === location.hash.slice(1))?.id ?? 'paramedic');

function SaveStatus() {
  const { save, incident } = useIncidentState();
  const text = save.state === 'saving' ? 'Saving…' : save.state === 'error' ? '⚠ Not saved — see highlighted item' : incident ? `✓ Saved · revision ${incident.revision}` : '';
  return <span className="save-status" data-state={save.state === 'error' ? 'error' : save.state === 'saving' ? 'saving' : 'saved'} role="status" aria-live="polite">{text}</span>;
}

function Shell() {
  const { platform, incident, loadError } = useIncidentState();
  const [view, setView] = useState<View>(viewFromHash);
  const reset = useAction({ reportsSave: false });
  useEffect(() => { const on = () => setView(viewFromHash()); window.addEventListener('hashchange', on); return () => window.removeEventListener('hashchange', on); }, []);
  // Demo control for "assistant unavailable" (POST /api/demo/assistant). Available on both adapters.
  const [assistant, setAssistant] = useState<AssistantStatus | null>(null);
  const [assistantError, setAssistantError] = useState<string | null>(null);
  useEffect(() => { platform.assistantStatus().then(setAssistant, e => setAssistantError(errorMessage(e))); }, [platform]);
  const toggleAssistant = (enabled: boolean) => platform.setAssistantEnabled(enabled).then(a => { setAssistant(a); setAssistantError(null); }, e => setAssistantError(errorMessage(e)));
  const href = (id: string) => `${location.search}#${id}`;

  return <div className="app">
    <header className="app-header no-print">
      <div className="app-header-inner">
        <a className="app-wordmark" href={href('paramedic')}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: 'var(--primary)' }}><path d="M4 12h3l2-5 4 10 2-5h5" /></svg>
          Trauma Llama
        </a>
        <span className="demo-label">SYNTHETIC DEMO — NOT A REAL PATIENT</span>
        {platform.info.kind === 'dev' && <span className="chip chip-demo" title={platform.info.description}>Development adapter</span>}
        <span className="app-spacer" />
        <SaveStatus />
      </div>
      <nav aria-label="Views" className="app-nav">
        {VIEWS.map(v => <a key={v.id} href={href(v.id)} aria-current={view === v.id ? 'page' : undefined}>{v.label}</a>)}
      </nav>
    </header>
    <div className="app-devbar no-print" role="note">
      <p>{platform.info.kind === 'dev' ? <><strong>Development adapter.</strong> {platform.info.description}</> : <>Demo controls{assistant ? <> · assistant mode <code>{assistant.effectiveMode}</code></> : null}</>}</p>
      <label className="app-switch"><input type="checkbox" checked={assistant?.enabled ?? false} disabled={!assistant} onChange={e => void toggleAssistant(e.target.checked)} /> Assistant available</label>
      {assistantError && <span className="text-error" role="alert">Assistant status unavailable: {assistantError}</span>}
    </div>
    {loadError && <p role="alert" className="app-alert no-print">{loadError.message}</p>}
    <main className="app-main">
      {!incident ? <p className="app-loading">{loadError ? 'Waiting for the platform…' : 'Loading incident…'}</p>
        : view === 'er' ? <ErPage incident={incident} />
        : view === 'patient' ? <PatientPage incident={incident} />
        : <Workspace incident={incident} />}
    </main>
    <footer className="app-footer no-print">
      <p>Local demo with synthetic data. No authentication, real patient data, clinical decision support, or production integrations. The assistant proposes; the crew decides and records.</p>
      <button type="button" className="btn btn-quiet" disabled={reset.pending} onClick={() => { if (window.confirm('Reset the synthetic incident for every view?')) void reset.run(() => platform.reset()); }}>Reset demo incident</button>
      {reset.error && <span role="alert" className="text-error"> {reset.error.message}</span>}
    </footer>
  </div>;
}

function App() {
  const platform = useMemo(() => selectPlatform(), []);
  useEffect(() => { document.title = 'Trauma Llama — EMT incident workspace (synthetic demo)'; }, []);
  return <IncidentProvider platform={platform}><Shell /></IncidentProvider>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
