import type { Dispatch } from 'react';
import type { WorkspaceIncident as Incident } from '../../platform';
import { ACTIVITY, DEVICES, FIELD_LABEL, HEART_RATE, PROFILE_SOURCE, READINGS, TILES, type FieldKey } from './data';
import { HeartRateChart, ReadingsTable } from './HeartRateChart';
import { DeviceIcon, Disclosure, NotProvided } from './parts';
import { PlatformSharing } from './PlatformSharing';
import { display, type Action, type CompanionState, type ShareKey } from './state';

const SUMMARY: FieldKey[] = ['contact', 'allergies', 'history', 'medications', 'age'];

export function Home({ s, dispatch, toast, incident, onReviewSharing, onReconnect }: {
  s: CompanionState; dispatch: Dispatch<Action>; toast: (m: string) => void; incident: Incident; onReviewSharing: () => void; onReconnect: () => void;
}) {
  const dev = s.device ? DEVICES[s.device] : null;
  const hasReadings = !!dev && s.synced;
  const shareRows: Array<[string, string, boolean]> = [['Name', 'shared', true], ...SUMMARY.map(k => {
    const v = display(s.profile.fields[k]);
    return [FIELD_LABEL[k], !v ? 'not provided' : s.share[k as ShareKey] ? 'shared' : 'not shared', !!v && s.share[k as ShareKey]] as [string, string, boolean];
  })];
  if (hasReadings) shareRows.push(['Wearable background', s.share.wearable ? 'shared as consumer-device background' : 'not shared', s.share.wearable]);

  return <div className="pt-home">
    <div className="pt-home-title">
      <div className="pt-home-name">
        <h1 className="pt-h1" id="pt-h-home" tabIndex={-1}>{s.profile.name}</h1>
        <span className="chip chip-ok">Emergency profile ready</span>
        <span className="pt-hint">{s.edited ? 'Edited in this browser' : `Profile last reviewed ${PROFILE_SOURCE.lastReviewed ?? 'not recorded'}`} · synthetic demo</span>
      </div>
      <button type="button" className="btn" onClick={onReviewSharing}>Review emergency sharing</button>
    </div>

    <div className="pt-home-cols">
      <div className="pt-col-left">
        <section className="pt-card" aria-labelledby="pt-h-sum">
          <div className="pt-card-body">
            <div className="pt-card-row"><h2 id="pt-h-sum">Profile</h2><button type="button" className="btn btn-quiet" onClick={() => dispatch({ type: 'go', step: 'profile' })}>Edit</button></div>
            <dl className="pt-dl">
              {SUMMARY.map(k => { const v = display(s.profile.fields[k]); return <div key={k}><dt>{FIELD_LABEL[k]}</dt><dd>{v ?? <NotProvided />}</dd></div>; })}
            </dl>
            {PROFILE_SOURCE.limitation && <p className="pt-hint">Crews see this with the note: “{PROFILE_SOURCE.limitation}”</p>}
          </div>
        </section>
        <section className="pt-card" aria-labelledby="pt-h-shr">
          <div className="pt-card-body">
            <h2 id="pt-h-shr">Emergency sharing <span className="pt-hint">(your choices, this browser)</span></h2>
            <ul className="pt-share-list">
              {shareRows.map(([label, state, on]) => <li key={label}><span className="pt-mark" data-on={on} aria-hidden="true">{on ? '✓' : '–'}</span><span><span className="pt-strong">{label}</span> — {state}</span></li>)}
            </ul>
            <button type="button" className="btn btn-secondary" onClick={onReviewSharing}>Review emergency sharing</button>
          </div>
        </section>
        <PlatformSharing incident={incident} />
      </div>

      <div className="pt-col-right">
        <section className="pt-card" aria-labelledby="pt-h-dev">
          <div className="pt-card-body">
            <h2 id="pt-h-dev">Wearable</h2>
            {!dev ? <div className="pt-empty">
              <p>No wearable connected</p>
              <button type="button" className="btn btn-secondary" onClick={() => dispatch({ type: 'go', step: 'wearable' })}>Add a wearable</button>
            </div> : <>
              <div className="pt-dev-row">
                <span className="pt-sheet-tile"><DeviceIcon icon={dev.icon} size={28} /></span>
                <div className="pt-dev-text"><span className="pt-strong">{dev.name}</span><span className="pt-hint">{dev.kind}</span></div>
                <span className={`chip ${s.disconnected ? 'chip-notdoc' : s.synced ? 'chip-ok' : 'chip-unknown'}`}>{s.disconnected ? 'Disconnected' : s.synced ? 'Connected (demo)' : 'Not synced'}</span>
              </div>
              <p className="pt-hint">{s.synced ? 'Synced once in this demo. Not continuous monitoring.' : 'Not synced yet.'}</p>
              <Disclosure label="Source details">
                <dl className="pt-dl">
                  <div><dt>Source</dt><dd>Scripted demo readings from the synthetic record — no {dev.name} account was contacted</dd></div>
                  <div><dt>Readings from</dt><dd>{READINGS.date ?? '—'} · device times {READINGS.firstTime}–{READINGS.lastTime}</dd></div>
                  <div><dt>Included</dt><dd>{[s.options.activity && `${ACTIVITY.length} activity items and device events`, s.options.heartRate && `${HEART_RATE.samples.length} heart-rate samples`].filter(Boolean).join(', ') || 'Nothing selected'}</dd></div>
                  {READINGS.capturedIntoRecord && <div><dt>In the incident record</dt><dd>Captured at {READINGS.capturedIntoRecord} EDT in the synthetic incident (capture time, not a sync time)</dd></div>}
                  <div><dt>Status</dt><dd>{READINGS.status}</dd></div>
                </dl>
              </Disclosure>
              {s.disconnected && <p className="alert alert-info" role="status">Readings already added stay in your profile until you remove them. Nothing new is added.</p>}
              <div className="pt-actions">
                {s.disconnected
                  ? <><button type="button" className="btn btn-secondary" onClick={onReconnect}>Reconnect</button><button type="button" className="btn btn-quiet" onClick={() => { dispatch({ type: 'removeReadings' }); toast('Wearable readings removed from your profile'); }}>Remove synced readings</button></>
                  : <button type="button" className="btn btn-secondary" onClick={() => { dispatch({ type: 'disconnect' }); toast(`${dev.name} disconnected`); }}>Disconnect</button>}
              </div>
            </>}
          </div>
        </section>

        {hasReadings && s.options.activity && <section className="pt-card" aria-labelledby="pt-h-act">
          <div className="pt-card-body">
            <h2 id="pt-h-act">Recent activity <span className="pt-hint">· {READINGS.date}</span></h2>
            <div className="pt-tiles">
              {TILES.map(t => <div key={t.id} className="pt-tile"><span className="pt-hint">{t.title}</span><span className="pt-tile-val mono">{t.value}</span><span className="pt-hint">{t.sub}</span></div>)}
            </div>
            <ul className="pt-acts">
              {ACTIVITY.map(a => <li key={a.id} className="pt-act" data-ready="true">
                <span className="mono pt-act-time">{a.time}</span>
                <span className="pt-act-text"><span className="pt-strong">{a.title}</span><span className="pt-hint">{a.deviceEvent ? 'Device event · ' : ''}{a.detail} {a.limitation}</span></span>
              </li>)}
            </ul>
            <p className="pt-hint">Device times are what the device recorded. They do not show when symptoms started or when anyone collapsed or was found.</p>
          </div>
        </section>}

        {hasReadings && s.options.heartRate && <section className="pt-card" aria-labelledby="pt-h-hr">
          <div className="pt-card-body">
            <h2 id="pt-h-hr">Heart rate history</h2>
            <div className="pt-chart-box"><HeartRateChart samples={HEART_RATE.samples} interactive /></div>
            <p className="pt-hint">Beats per minute ({HEART_RATE.unit}) · {HEART_RATE.samples.length} samples · device time · consumer wearable, not a medical measurement.{HEART_RATE.gaps ? ` ${HEART_RATE.gaps}` : ''}</p>
            <Disclosure label="Show readings as a table"><ReadingsTable samples={HEART_RATE.samples} /></Disclosure>
          </div>
        </section>}
      </div>
    </div>
    <p className="pt-hint pt-home-foot">Wearable information is shown to a crew as background from a consumer device, with its device times. It isn’t a medical measurement.</p>
  </div>;
}

/** "What a crew would see": mirrors the EMT summary styling; updates live from local choices. */
export function CrewPreview({ s }: { s: CompanionState }) {
  const dev = s.device ? DEVICES[s.device] : null;
  const row = (label: string, value: string | null, shared: boolean, note?: string) => <div key={label}>
    <dt>{label}</dt>
    <dd>{!value ? <span className="chip chip-notdoc">Not provided</span> : shared ? <>{value}{note ? <span className="pt-hint"> · {note}</span> : null}</> : <span className="pt-notshared">Not shared by patient</span>}</dd>
  </div>;
  return <aside className="pt-preview-card" aria-labelledby="pt-h-prev">
    <p className="caps" id="pt-h-prev">What a crew would see</p>
    <dl className="pt-dl">
      {row('Name', s.profile.name, true)}
      {SUMMARY.map(k => row(FIELD_LABEL[k], display(s.profile.fields[k]), s.share[k as ShareKey], 'self-reported, not verified'))}
      {dev ? row('Wearable background', `${dev.name} · ${s.synced ? 'readings added (demo)' : 'not synced yet'}`, s.share.wearable, s.synced ? 'consumer-device background, device times' : undefined)
        : <div><dt>Wearable background</dt><dd className="pt-hint">Not connected</dd></div>}
    </dl>
    <p className="pt-hint">Preview of your choices in this browser. The platform does not enforce per-field sharing yet.</p>
  </aside>;
}
