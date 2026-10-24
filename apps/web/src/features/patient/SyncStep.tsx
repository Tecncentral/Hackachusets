import { ACTIVITY, DEVICES, HEART_RATE, READINGS, type DeviceId } from './data';
import { HeartRateChart } from './HeartRateChart';
import type { Options } from './state';
import { PROFILE_STEPS, type SyncProgress, type SyncResult } from './wearableSource';

export type SyncStatus = 'running' | SyncResult['status'];
type Kind = 'done' | 'active' | 'fail' | 'stop' | 'wait' | 'skip';
const PILL: Record<Kind, string> = { done: 'Ready', active: 'In progress', fail: 'Failed', stop: 'Cancelled', wait: 'Pending', skip: 'Skipped' };

export function stageView(device: DeviceId | null, options: Options, p: SyncProgress, status: SyncStatus) {
  const name = device ? DEVICES[device].name : 'your device';
  const nAct = ACTIVITY.length, nHr = HEART_RATE.samples.length;
  const enabled = [!!device, !!device && options.activity, !!device && options.heartRate, true];
  const defs = [
    { title: 'Connecting your device', active: `Connecting to ${name}…`, done: `${name} connected` },
    { title: 'Loading recent activity', active: `${p.actsReady} of ${nAct} items`, done: `${nAct} items · ${ACTIVITY[0]?.time ?? ''}–${ACTIVITY.at(-1)?.time ?? ''} device time` },
    { title: 'Organizing readings by time', active: `${p.pts} of ${nHr} heart-rate samples`, done: `${nHr} samples · ${HEART_RATE.samples[0]?.time ?? ''}–${HEART_RATE.samples.at(-1)?.time ?? ''} device time` },
    { title: 'Preparing your profile', active: `${p.prof} of ${PROFILE_STEPS} · contact, allergies, sharing`, done: 'Contact, allergies and sharing choices ready' }
  ];
  const complete = status === 'complete';
  const stages = defs.map((d, i) => {
    const n = i + 1;
    const kind: Kind = !enabled[i] ? 'skip' : complete || p.stage > n ? 'done' : p.stage === n ? (status === 'running' ? 'active' : status === 'failed' ? 'fail' : 'stop') : 'wait';
    const detail = kind === 'done' ? d.done : kind === 'active' ? d.active : kind === 'skip' ? (device ? 'Not selected' : 'No wearable — skipped') : kind === 'fail' ? `Stopped at ${d.active}` : kind === 'stop' ? 'Cancelled' : 'Waiting';
    return { ...d, n, kind, detail, pill: kind === 'skip' && device ? 'Not selected · Skipped' : PILL[kind] };
  });
  const parts = [p.stage > 1 ? 1 : 0, p.stage > 2 ? 1 : p.stage === 2 ? p.actsReady / Math.max(nAct, 1) : 0, p.stage > 3 ? 1 : p.stage === 3 ? p.pts / Math.max(nHr, 1) : 0, p.stage > 4 ? 1 : p.stage === 4 ? (p.prof / PROFILE_STEPS) * 0.9 : 0];
  let num = 0, den = 0; parts.forEach((v, i) => { if (enabled[i]) { num += complete ? 1 : v; den++; } });
  const count = enabled.filter(Boolean).length;
  const at = Math.min(p.stage, 4);
  const position = Math.max(1, enabled.slice(0, at).filter(Boolean).length);
  const line = complete ? 'Done · demo sync complete' : status === 'failed' ? 'Stopped · couldn’t load activity' : status === 'cancelled' ? 'Cancelled' : `Stage ${position} of ${count} · ${defs[at - 1].title}`;
  return { stages, fraction: num / Math.max(den, 1), line };
}

export function SyncStep({ device, options, progress, status, onCancel, onRetry, onNoDevice, onDone }: {
  device: DeviceId | null; options: Options; progress: SyncProgress; status: SyncStatus;
  onCancel: () => void; onRetry: () => void; onNoDevice: () => void; onDone: () => void;
}) {
  const v = stageView(device, options, progress, status);
  const dev = device ? DEVICES[device] : null;
  const acts = ACTIVITY.slice(0, progress.acts);
  const pts = HEART_RATE.samples.slice(0, progress.pts);
  return <section className="pt-card" aria-labelledby="pt-h-sync">
    <div className="pt-card-body pt-sync">
      <div className="pt-sync-title">
        <h1 id="pt-h-sync" className="pt-h1" tabIndex={-1}>{dev ? `Syncing your ${dev.name}` : 'Preparing your profile'}</h1>
        {dev && READINGS.date && <span className="pt-hint">Recent readings · <span className="mono">{READINGS.date}</span></span>}
      </div>
      <div>
        <div className="pt-bar-track" aria-hidden="true"><div className="pt-bar" data-status={status} style={{ width: `${Math.round(v.fraction * 100)}%` }} /></div>
        <p role="status" aria-live="polite" className="pt-sync-line">{v.line}</p>
      </div>
      <ol className="pt-stages">
        {v.stages.map(g => <li key={g.n} data-kind={g.kind}>
          <span className={`pt-stage-dot${g.kind === 'active' ? ' pt-active-dot' : ''}`} aria-hidden="true">{g.kind === 'done' ? '✓' : g.kind === 'fail' ? '!' : g.kind === 'skip' ? '–' : g.n}</span>
          <span className="pt-stage-text"><span className="pt-stage-title">{g.title}</span><span className="pt-hint">{g.detail}</span></span>
          <span className={`pt-pill pt-pill-${g.kind}`}>{g.pill}</span>
        </li>)}
      </ol>
      {status === 'complete' && <div className="alert alert-ok pt-banner" role="status">
        <p><strong>Your profile is ready.</strong> {dev ? `Readings from ${dev.name} were added in this demo (synthetic record; no device was contacted).` : 'No wearable connected. You can add one later.'}</p>
        <button type="button" className="btn" onClick={onDone}>View your profile</button>
      </div>}
      {status === 'failed' && <div className="alert alert-crit pt-banner" role="alert">
        <p>Couldn’t load your activity. Check that your device is nearby and synced, then try again. Nothing was added to your profile.</p>
        <div className="pt-actions"><button type="button" className="btn" onClick={onRetry}>Retry sync</button><button type="button" className="btn btn-secondary" onClick={onNoDevice}>Continue without a wearable</button></div>
      </div>}
      {status === 'cancelled' && <div className="alert alert-attn pt-banner" role="status">
        <p>Sync cancelled. Nothing from your device was added. Your profile and sharing choices are kept.</p>
        <div className="pt-actions"><button type="button" className="btn" onClick={onRetry}>Retry sync</button><button type="button" className="btn btn-secondary" onClick={onNoDevice}>Continue without a wearable</button></div>
      </div>}
      {status === 'running' && <div className="pt-actions"><button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel sync</button></div>}
    </div>
    {dev && <div className="pt-data">
      <div className="pt-data-col">
        <p className="caps">Activity and device events</p>
        <ul className="pt-acts">
          {!options.activity && <li className="pt-hint">Activity not selected for this device.</li>}
          {options.activity && acts.length === 0 && status === 'running' && <li className="pt-acts-wait">Waiting for recent activity…</li>}
          {acts.map((a, i) => { const ready = i < progress.actsReady; return <li key={a.id} className="pt-act pt-in" data-ready={ready}>
            <span className="mono pt-act-time">{a.time}</span>
            <span className="pt-act-text"><span className="pt-strong">{a.title}</span><span className="pt-hint">{a.deviceEvent ? 'Device event · ' : ''}{a.detail}</span></span>
            <span className={`pt-pill pt-pill-${ready ? 'done' : 'wait'}`}>{ready ? 'Ready' : 'Pending'}</span>
          </li>; })}
        </ul>
      </div>
      <div className="pt-data-col">
        <div className="pt-data-head"><p className="caps">Heart rate</p><span className="mono pt-hint">{pts.length ? `${pts.length} samples · ${pts[0].time}–${pts.at(-1)!.time}` : '0 samples'}</span></div>
        {options.heartRate ? <div className="pt-chart-box"><HeartRateChart samples={pts} /></div> : <p className="pt-hint">Heart rate not selected.</p>}
        <p className="pt-hint">Beats per minute ({HEART_RATE.unit}) · device time · consumer wearable</p>
      </div>
    </div>}
  </section>;
}
