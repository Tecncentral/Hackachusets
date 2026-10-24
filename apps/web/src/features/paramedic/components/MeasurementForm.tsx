import { useState } from 'react';
import { useAction, useIncidentState, type Measurement, type WorkspaceIncident } from '../../../platform';
import { COOLING_LABEL, MEASUREMENT_LABEL } from '../../../platform/draft';
import { zoneTimeToIso } from '../../../platform/time';
import { incidentDate } from '../model';
import { SaveStatus, TimeField, useRequestId } from './fields';

type Kind = Measurement['kind'];
const FORM_KINDS: Kind[] = ['temperature', 'heartRate', 'bloodPressure', 'respiratoryRate', 'spo2', 'glucose', 'ambientTemperature', 'humidity'];
export const UNITS: Record<Kind, string[]> = {
  temperature: ['°C', '°F'], heartRate: ['bpm'], bloodPressure: ['mmHg'], respiratoryRate: ['breaths/min'], spo2: ['%'],
  glucose: ['mg/dL', 'mmol/L'], ambientTemperature: ['°F', '°C'], humidity: ['%'], skinTemperatureDeviation: ['°C']
};
const METHODS = ['rectal', 'esophageal', 'oral', 'tympanic', 'temporal artery', 'axillary', 'other'];

export function MeasurementForm({ incident, initialKind = 'temperature', onSaved }: { incident: WorkspaceIncident; initialKind?: Kind; onSaved?: () => void }) {
  const { platform } = useIncidentState();
  const save = useAction();
  const req = useRequestId();
  const [kind, setKind] = useState<Kind>(initialKind);
  const [unit, setUnit] = useState(UNITS[initialKind][0]);
  const [value, setValue] = useState('');
  const [value2, setValue2] = useState('');
  const [method, setMethod] = useState('');
  const [time, setTime] = useState('');
  const [phase, setPhase] = useState<Measurement['coolingPhase']>('unknown');
  const [device, setDevice] = useState('');
  const [notObtained, setNotObtained] = useState(false);
  const [note, setNote] = useState('');
  const [revision, setRevision] = useState<number | null>(null);

  const isTemp = kind === 'temperature', isBp = kind === 'bloodPressure', context = kind === 'ambientTemperature' || kind === 'humidity';
  const num = (s: string) => (s.trim() === '' || Number.isNaN(Number(s)) ? null : Number(s));
  const valid = notObtained ? true : num(value) !== null && (!isBp || num(value2) !== null);

  const submit = async () => {
    const body = {
      kind, unit, status: notObtained ? 'not_obtained' as const : 'obtained' as const,
      value: notObtained ? null : num(value), value2: notObtained || !isBp ? null : num(value2),
      method: isTemp && method ? method : null, eventTime: time ? zoneTimeToIso(incidentDate(incident), time) : null,
      coolingPhase: context ? 'unknown' as const : phase, sourceKind: 'manual' as const, device: device.trim() || null, recordedBy: 'crew', note: note.trim() || null
    };
    const result = await save.run(() => platform.addMeasurement({ ...body, requestId: req.forContent(JSON.stringify(body)), baseRevision: incident.revision }));
    if (result) { setRevision(result.revision); req.done(); setValue(''); setValue2(''); setNote(''); setNotObtained(false); setTime(''); setPhase('unknown'); onSaved?.(); }
  };

  return <form className="ws-form" aria-label="Add measurement" onSubmit={e => { e.preventDefault(); void submit(); }}>
    <p className="ws-hint">Entered manually by crew — no monitor connected.</p>
    <div className="ws-row">
      <div className="ws-field">
        <label htmlFor="ws-m-kind">Measurement</label>
        <select id="ws-m-kind" className="field" value={kind} onChange={e => { const k = e.target.value as Kind; setKind(k); setUnit(UNITS[k][0]); }}>
          {FORM_KINDS.map(k => <option key={k} value={k}>{MEASUREMENT_LABEL[k]}{k === 'ambientTemperature' || k === 'humidity' ? ' (environment)' : ''}</option>)}
        </select>
      </div>
      <TimeField id="ws-m-time" label="Collected at" value={time} onChange={setTime} />
    </div>

    <label className="app-switch"><input type="checkbox" checked={notObtained} onChange={e => setNotObtained(e.target.checked)} /> Not performed (crew recorded it was not done)</label>

    {!notObtained && <div className="ws-row">
      <div className="ws-field">
        <label htmlFor="ws-m-value">{isBp ? 'Systolic' : 'Value'}</label>
        <input id="ws-m-value" className="field" inputMode="decimal" value={value} onChange={e => setValue(e.target.value)} autoComplete="off" />
      </div>
      {isBp && <div className="ws-field">
        <label htmlFor="ws-m-value2">Diastolic</label>
        <input id="ws-m-value2" className="field" inputMode="decimal" value={value2} onChange={e => setValue2(e.target.value)} autoComplete="off" />
      </div>}
      <div className="ws-field ws-field-narrow">
        <label htmlFor="ws-m-unit">Unit</label>
        <select id="ws-m-unit" className="field" value={unit} onChange={e => setUnit(e.target.value)}>{UNITS[kind].map(u => <option key={u}>{u}</option>)}</select>
      </div>
    </div>}

    {isTemp && !notObtained && <div className="ws-field">
      <label htmlFor="ws-m-method">Method / site</label>
      <select id="ws-m-method" className="field" value={method} onChange={e => setMethod(e.target.value)}>
        <option value="">Not documented</option>
        {METHODS.map(m => <option key={m} value={m}>{m}</option>)}
      </select>
    </div>}

    {!context && <fieldset className="ws-fieldset">
      <legend>Relative to cooling</legend>
      {(['before', 'during', 'after', 'unknown'] as const).map(p => <label key={p} className="ws-radio">
        <input type="radio" name="ws-m-phase" value={p} checked={phase === p} onChange={() => setPhase(p)} /> {p === 'unknown' ? 'Not documented' : COOLING_LABEL[p].replace(/^./, c => c.toUpperCase())}
      </label>)}
    </fieldset>}

    <div className="ws-row">
      <div className="ws-field">
        <label htmlFor="ws-m-device">Device or observer (optional)</label>
        <input id="ws-m-device" className="field" value={device} onChange={e => setDevice(e.target.value)} autoComplete="off" />
      </div>
      <div className="ws-field">
        <label htmlFor="ws-m-note">{notObtained ? 'Reason (optional)' : 'Note (optional)'}</label>
        <input id="ws-m-note" className="field" value={note} onChange={e => setNote(e.target.value)} autoComplete="off" />
      </div>
    </div>
    <div className="ws-actions">
      <button type="submit" className="btn" disabled={save.pending || !valid}>{save.state === 'error' ? 'Retry save' : 'Save measurement'}</button>
    </div>
    <SaveStatus state={save.state} error={save.error} saved="Measurement added." revision={revision} thing="measurements" />
  </form>;
}
