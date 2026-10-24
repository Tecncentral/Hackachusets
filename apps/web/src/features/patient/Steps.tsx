import { useEffect, useRef, useState, type Dispatch } from 'react';
import { DEVICES, DEVICE_ORDER, FIELD_LABEL, FIELD_PLACEHOLDER, PROFILE_SOURCE, type DeviceId, type FieldKey, type FieldValue } from './data';
import { display, type Action, type CompanionState, type Options, type ShareKey } from './state';
import { DeviceIcon, Disclosure, NotProvided, Switch } from './parts';
import type { WearableSource } from './wearableSource';

export interface StepProps { s: CompanionState; dispatch: Dispatch<Action>; toast: (m: string) => void }

// ---------------------------------------------------------------- Profile
type RowKey = 'name' | FieldKey;
const ROWS: RowKey[] = ['name', 'age', 'contact', 'history', 'medications', 'allergies'];

export function ProfileStep({ s, dispatch, toast }: StepProps) {
  const [editing, setEditing] = useState<RowKey | null>(null);
  const [val, setVal] = useState('');
  const [none, setNone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valueOf = (k: RowKey): FieldValue => (k === 'name' ? { state: 'provided', text: s.profile.name } : s.profile.fields[k]);
  const focusRow = (k: RowKey) => requestAnimationFrame(() => document.getElementById(`pt-edit-${k}`)?.focus());

  const open = (k: RowKey) => { const v = valueOf(k); setEditing(k); setVal(v.state === 'provided' ? v.text : ''); setNone(v.state === 'none'); setError(null); requestAnimationFrame(() => document.getElementById(`pt-in-${k}`)?.focus()); };
  const cancel = () => { const k = editing; setEditing(null); if (k) focusRow(k); };
  const commit = () => {
    if (!editing || busy) return;
    const k = editing, text = val.trim();
    if (k === 'name' && !text) { setError('Enter your name. It is the only required field.'); return; }
    setBusy(true);
    // Local save (this browser). The short delay mirrors the design's "Saving…" state.
    setTimeout(() => {
      if (k === 'name') dispatch({ type: 'setName', name: text });
      else dispatch({ type: 'setField', key: k, value: k === 'medications' && none ? { state: 'none' } : text ? { state: 'provided', text } : { state: 'not_provided' } });
      setBusy(false); setEditing(null); toast('Saved'); focusRow(k);
    }, 450);
  };

  return <section className="pt-card" aria-labelledby="pt-h-prof">
    <div className="pt-card-head">
      <h1 id="pt-h-prof" className="pt-h1">Your emergency profile</h1>
      <p className="pt-lede">What a crew may need if you can’t answer. Only your name is needed; everything else is optional.</p>
      <p className="pt-hint">Filled in from the synthetic demo profile ({PROFILE_SOURCE.label.toLowerCase()}{PROFILE_SOURCE.lastReviewed ? `, last reviewed ${PROFILE_SOURCE.lastReviewed}` : ''}). Edits stay in this browser.</p>
    </div>
    <ul className="pt-rows">
      {ROWS.map(k => {
        const label = k === 'name' ? 'Name' : FIELD_LABEL[k];
        const shown = display(valueOf(k));
        return <li key={k} className="pt-row">
          {editing !== k ? <div className="pt-row-view">
            <div className="pt-row-text">
              <div className="pt-row-label">{label}{k !== 'name' && <span className="pt-hint"> (optional)</span>}</div>
              {shown ? <div className="pt-row-value">{shown}</div> : <NotProvided />}
            </div>
            <button type="button" id={`pt-edit-${k}`} className="btn btn-quiet" aria-label={`${shown ? 'Edit' : 'Add'} ${label.toLowerCase()}`} disabled={editing !== null} onClick={() => open(k)}>{shown ? 'Edit' : 'Add'}</button>
          </div> : <form className="pt-row-edit" onSubmit={e => { e.preventDefault(); commit(); }} onKeyDown={e => { if (e.key === 'Escape') cancel(); }}>
            <label htmlFor={`pt-in-${k}`} className="pt-row-label">{label}{k === 'name' ? ' (required)' : ''}</label>
            <input id={`pt-in-${k}`} className="field" value={val} readOnly={busy} disabled={none} placeholder={k === 'name' ? 'Your name' : FIELD_PLACEHOLDER[k]}
              autoComplete={k === 'name' ? 'name' : 'off'} aria-invalid={!!error} aria-describedby={error ? `pt-err-${k}` : undefined} onChange={e => { setVal(e.target.value); setError(null); }} />
            {k === 'medications' && <label className="pt-check"><input type="checkbox" checked={none} disabled={busy} onChange={e => setNone(e.target.checked)} /> I don’t take any regular medications</label>}
            {k === 'medications' && <p className="pt-hint">Left blank, a crew sees <NotProvided />. Ticking the box shows “None”.</p>}
            {error && <p id={`pt-err-${k}`} role="alert" className="text-error">{error}</p>}
            <div className="pt-actions">
              <button type="submit" className="btn" aria-disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={cancel}>Cancel</button>
              {k !== 'name' && <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => { setVal(''); setNone(false); }}>Leave blank</button>}
            </div>
          </form>}
        </li>;
      })}
    </ul>
    <div className="pt-foot">
      <button type="button" className="btn" disabled={editing !== null} onClick={() => dispatch({ type: 'go', step: 'wearable' })}>Add a wearable</button>
      <button type="button" className="btn btn-secondary" disabled={editing !== null} onClick={() => dispatch({ type: 'skipWearable' })}>Continue without a wearable</button>
      <span className="pt-hint pt-foot-note">No account needed. You can change this any time.</span>
    </div>
  </section>;
}

// ---------------------------------------------------------------- Wearable + connection sheet
export function WearableStep({ s, dispatch, toast, source }: StepProps & { source: WearableSource }) {
  const [sheet, setSheet] = useState<DeviceId | null>(null);
  const [returnTo, setReturnTo] = useState<DeviceId | null>(null);
  const close = () => { setSheet(null); };
  useEffect(() => { if (!sheet && returnTo) { document.getElementById(`pt-dev-${returnTo}`)?.focus(); setReturnTo(null); } }, [sheet, returnTo]);

  return <section className="pt-card" aria-labelledby="pt-h-wear">
    <div className="pt-card-head">
      <h1 id="pt-h-wear" className="pt-h1">Add a wearable <span className="pt-h1-sub">(optional)</span></h1>
      <p className="pt-lede">One device is enough. It adds recent activity and heart rate as background. Crews see it as consumer-device data, not as medical measurements.</p>
    </div>
    <div className="pt-card-body">
      <div className="pt-devices">
        {DEVICE_ORDER.map(id => {
          const d = DEVICES[id], selected = s.device === id;
          return <button key={id} id={`pt-dev-${id}`} type="button" className="pt-device" aria-pressed={selected} onClick={() => { setSheet(id); setReturnTo(id); }}>
            <DeviceIcon icon={d.icon} />
            <span className="pt-device-name">{d.name}</span>
            <span className="pt-hint">{d.kind}</span>
            <span className="pt-device-cta">{selected ? '✓ Selected' : 'Connect ›'}</span>
          </button>;
        })}
      </div>
      <p className="pt-hint">You can disconnect at any time from your profile. Demo only: no device account is contacted; the readings come from a synthetic record.</p>
    </div>
    <div className="pt-foot">
      <button type="button" className="btn btn-secondary" onClick={() => dispatch({ type: 'skipWearable' })}>Continue without a wearable</button>
      <button type="button" className="btn btn-quiet" onClick={() => dispatch({ type: 'go', step: 'profile' })}>‹ Back to profile</button>
    </div>
    {sheet && <ConnectSheet device={sheet} initial={s.options} source={source} onClose={close}
      onConnected={options => { dispatch({ type: 'connected', device: sheet, options }); toast(`${DEVICES[sheet].name} added. Recent readings sync after you review sharing.`); setReturnTo(null); setSheet(null); }} />}
  </section>;
}

function ConnectSheet({ device, initial, source, onClose, onConnected }: { device: DeviceId; initial: Options; source: WearableSource; onClose: () => void; onConnected: (o: Options) => void }) {
  const d = DEVICES[device];
  const [opts, setOpts] = useState<Options>(initial);
  const [connecting, setConnecting] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const abort = useRef<AbortController | null>(null);
  const none = !opts.activity && !opts.heartRate;

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('h2')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); abort.current?.abort(); onClose(); return; }
      if (e.key !== 'Tab' || !ref.current) return;
      // Keep focus inside the dialog.
      const items = [...ref.current.querySelectorAll<HTMLElement>('button:not([disabled]), [tabindex="0"]')];
      if (!items.length) return;
      const first = items[0], last = items.at(-1)!;
      if (e.shiftKey && (document.activeElement === first || document.activeElement === ref.current.querySelector('h2'))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); abort.current?.abort(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const connect = async () => {
    setConnecting(true);
    abort.current = new AbortController();
    try { await source.connect(device, abort.current.signal); onConnected(opts); } catch { setConnecting(false); }
  };

  return <div className="pt-sheet-layer">
    <div className="pt-scrim" onClick={() => { if (!connecting) onClose(); }} />
    <div ref={ref} className="pt-sheet" role="dialog" aria-modal="true" aria-labelledby="pt-sheet-h">
      <div className="pt-sheet-top">
        <button type="button" className="btn btn-quiet" onClick={onClose} disabled={connecting}>‹ Devices</button>
        <button type="button" className="btn btn-quiet" aria-label="Close" onClick={onClose} disabled={connecting}>×</button>
      </div>
      <div className="pt-sheet-id">
        <span className="pt-sheet-tile"><DeviceIcon icon={d.icon} size={28} /></span>
        <div><h2 id="pt-sheet-h" tabIndex={-1}>Connect {d.name}</h2><p className="pt-hint">{d.kind} · demo connection, no account login</p></div>
      </div>
      <p className="caps">What Trauma Llama will read</p>
      <ul className="pt-list">
        <li>Activity sessions and overnight summaries</li>
        <li>Heart-rate samples in bpm, with device time</li>
        <li>Device events such as “Fall detected”</li>
      </ul>
      <p className="pt-hint">Your recent readings are synced once now. Trauma Llama doesn’t monitor you continuously.</p>
      <div className="pt-opt-rows">
        <div className="pt-opt"><span>Activity history</span><Switch on={opts.activity} label="Include activity history" onText="Included" offText="Off" disabled={connecting} onToggle={() => setOpts(o => ({ ...o, activity: !o.activity }))} /></div>
        <div className="pt-opt"><span>Heart-rate background</span><Switch on={opts.heartRate} label="Include heart-rate background" onText="Included" offText="Off" disabled={connecting} onToggle={() => setOpts(o => ({ ...o, heartRate: !o.heartRate }))} /></div>
      </div>
      {none && <p className="alert alert-attn" role="status">Choose at least one kind of reading, or continue without a wearable.</p>}
      <div className="pt-actions">
        <button type="button" className="btn" disabled={connecting || none} onClick={() => void connect()}>{connecting ? 'Connecting…' : `Connect ${d.name}`}</button>
        <button type="button" className="btn btn-secondary" onClick={() => { abort.current?.abort(); onClose(); }}>Cancel</button>
      </div>
    </div>
  </div>;
}

// ---------------------------------------------------------------- Sharing
const SHARE_ROWS: Array<{ key: Exclude<ShareKey, 'wearable'>; label: string }> = [
  { key: 'age', label: 'Age' }, { key: 'contact', label: 'Emergency contact' }, { key: 'allergies', label: 'Allergies' }, { key: 'history', label: 'Medical history' }, { key: 'medications', label: 'Medications' }
];

export function SharingStep({ s, dispatch, onSave, onBack }: StepProps & { onSave: () => void; onBack: () => void }) {
  const [busy, setBusy] = useState(false);
  const dev = s.device ? DEVICES[s.device] : null;
  const label = busy ? 'Saving…' : s.returnHome ? 'Save sharing' : dev ? 'Save and sync' : 'Save and finish';
  const reads = [s.options.activity && 'activity', s.options.heartRate && 'heart rate'].filter(Boolean).join(' and ');
  return <section className="pt-card" aria-labelledby="pt-h-share">
    <div className="pt-card-head">
      <h1 id="pt-h-share" className="pt-h1">Review emergency sharing</h1>
      <p className="pt-lede">Choose what an EMS crew can see if they open your profile during an emergency. You can change this any time.</p>
    </div>
    <ul className="pt-rows">
      <li className="pt-row pt-row-view">
        <div className="pt-row-text"><div className="pt-row-label pt-strong">Name</div><div className="pt-hint">{s.profile.name} · always shared so a crew can find the right profile</div></div>
        <span className="pt-always">Always</span>
      </li>
      {SHARE_ROWS.map(r => {
        const v = display(s.profile.fields[r.key]);
        return <li key={r.key} className="pt-row pt-row-view">
          <div className="pt-row-text"><div className="pt-row-label pt-strong">{r.label}</div><div className="pt-hint">{v ?? 'Not provided — nothing to share'}</div></div>
          <Switch on={!!v && s.share[r.key]} label={`Share ${r.label.toLowerCase()}`} onText="Shared" offText="Not shared" disabled={!v} disabledText="Not provided" onToggle={() => dispatch({ type: 'toggleShare', key: r.key })} />
        </li>;
      })}
      {dev && <li className="pt-row pt-row-view">
        <div className="pt-row-text"><div className="pt-row-label pt-strong">Wearable background</div><div className="pt-hint">{dev.name} · {reads}, labelled as consumer-device data with device times</div></div>
        <Switch on={s.share.wearable} label="Share wearable background" onText="Shared" offText="Not shared" onToggle={() => dispatch({ type: 'toggleShare', key: 'wearable' })} />
      </li>}
    </ul>
    <div className="pt-card-body">
      <Disclosure label="How emergency sharing works">
        <ul className="pt-list">
          <li>A crew sees only what you turn on here.</li>
          <li>Your choices update the “What a crew would see” preview straight away.</li>
          <li>Wearable readings are labelled as consumer-device background with their device times. They are never shown as a clinical measurement.</li>
          <li>Demo limit: these choices are kept in this browser. The platform does not enforce per-field sharing yet; its own emergency-sharing setting is separate.</li>
        </ul>
      </Disclosure>
    </div>
    <div className="pt-foot">
      <button type="button" className="btn" disabled={busy} onClick={() => { setBusy(true); setTimeout(() => { setBusy(false); onSave(); }, 500); }}>{label}</button>
      <button type="button" className="btn btn-secondary" disabled={busy} onClick={onBack}>{s.returnHome ? 'Cancel' : 'Back'}</button>
    </div>
  </section>;
}
