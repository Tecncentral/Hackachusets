import { useState } from 'react';
import { useAction, useIncidentState, type EnvironmentReading, type Incident, type Measurement } from '../../../platform';
import { COOLING_LABEL, MEASUREMENT_LABEL, SITE_LABEL, UNITS } from '../../../platform/labels';
import { zoneTimeToIso } from '../../../platform/time';
import { incidentDate } from '../model';
import { SaveStatus, TimeField, useRequestId } from './fields';

type EnvKind = EnvironmentReading['kind'];
type Kind = Measurement['kind'] | EnvKind;
const MEASUREMENT_KINDS: Measurement['kind'][] = ['body_temperature', 'heart_rate', 'blood_pressure', 'respiratory_rate', 'spo2', 'glucose', 'skin_temperature'];
const ENV_KINDS: EnvKind[] = ['ambient_temperature', 'relative_humidity', 'wbgt'];
const ENV_LABEL: Record<EnvKind, string> = { ambient_temperature: 'Air temperature', relative_humidity: 'Relative humidity', wbgt: 'Wet-bulb globe temperature' };
const ENV_UNITS: Record<EnvKind, EnvironmentReading['unit'][]> = { ambient_temperature: ['°F', '°C'], relative_humidity: ['%'], wbgt: ['°F', '°C'] };
const ENV_METHOD: Record<EnvironmentReading['method'], string> = { onsite_meter: 'On-site meter', reported: 'Reported', weather_service: 'Weather service', unknown: 'Unknown' };
const DEVICE_CLASS: Record<Measurement['deviceClass'], string> = { clinical: 'Clinical device', consumer: 'Consumer device', unknown: 'Not recorded' };
const isEnv = (k: Kind): k is EnvKind => (ENV_KINDS as string[]).includes(k);
const unitsFor = (k: Kind): string[] => (isEnv(k) ? ENV_UNITS[k] : UNITS[k]);

/**
 * Manual entry of a measurement (POST /measurements) or an environmental reading
 * (POST /environment-readings — never body temperature). The platform validates units, plausibility,
 * site and diastolic rules; its message is shown as-is if a value is rejected.
 */
export function MeasurementForm({ incident, initialKind = 'body_temperature', onSaved }: { incident: Incident; initialKind?: Kind; onSaved?: () => void }) {
  const { platform } = useIncidentState();
  const save = useAction();
  const req = useRequestId();
  const [kind, setKind] = useState<Kind>(initialKind);
  const [unit, setUnit] = useState(unitsFor(initialKind)[0]);
  const [value, setValue] = useState('');
  const [diastolic, setDiastolic] = useState('');
  const [site, setSite] = useState<NonNullable<Measurement['site']>>('unknown');
  const [time, setTime] = useState('');
  const [phase, setPhase] = useState<Measurement['coolingPhase']>('unknown');
  const [device, setDevice] = useState('');
  const [deviceClass, setDeviceClass] = useState<Measurement['deviceClass']>('unknown');
  const [envMethod, setEnvMethod] = useState<EnvironmentReading['method']>('onsite_meter');
  const [note, setNote] = useState('');
  const [revision, setRevision] = useState<number | null>(null);

  const env = isEnv(kind), isTemp = kind === 'body_temperature', isBp = kind === 'blood_pressure';
  const num = (s: string) => (s.trim() === '' || Number.isNaN(Number(s)) ? null : Number(s));
  const valid = num(value) !== null && (!isBp || num(diastolic) !== null);

  const submit = async () => {
    const measuredAt = time ? zoneTimeToIso(incidentDate(incident), time) : null;
    const result = env
      ? await (async () => {
          const body = { kind: kind as EnvKind, value: num(value)!, unit: unit as EnvironmentReading['unit'], measuredAt, location: device.trim() || null, method: envMethod };
          return save.run(() => platform.addEnvironmentReading({ ...body, requestId: req.forContent(JSON.stringify(body)), baseRevision: incident.revision }));
        })()
      : await (async () => {
          const body = {
            kind: kind as Measurement['kind'], value: num(value)!, diastolic: isBp ? num(diastolic) : null, unit: unit as Measurement['unit'], site: isTemp ? site : null,
            measuredAt, coolingPhase: phase, device: device.trim() || null, deviceClass, note: note.trim() || null
          };
          return save.run(() => platform.addMeasurement({ ...body, requestId: req.forContent(JSON.stringify(body)), baseRevision: incident.revision }));
        })();
    if (result) { setRevision(result.revision); req.done(); setValue(''); setDiastolic(''); setNote(''); setTime(''); setPhase('unknown'); onSaved?.(); }
  };

  return <form className="ws-form" aria-label="Add measurement" onSubmit={e => { e.preventDefault(); void submit(); }}>
    <p className="ws-hint">Entered manually by crew — no monitor connected.</p>
    <div className="ws-row">
      <div className="ws-field">
        <label htmlFor="ws-m-kind">Measurement</label>
        <select id="ws-m-kind" className="field" value={kind} onChange={e => { const k = e.target.value as Kind; setKind(k); setUnit(unitsFor(k)[0]); }}>
          <optgroup label="Patient">{MEASUREMENT_KINDS.map(k => <option key={k} value={k}>{MEASUREMENT_LABEL[k]}</option>)}</optgroup>
          <optgroup label="Environment (not body temperature)">{ENV_KINDS.map(k => <option key={k} value={k}>{ENV_LABEL[k]}</option>)}</optgroup>
        </select>
      </div>
      <TimeField id="ws-m-time" label={env ? 'Measured at' : 'Collected at'} value={time} onChange={setTime} hint={time ? 'EDT, incident date.' : 'Empty = time unknown.'} />
    </div>

    <div className="ws-row">
      <div className="ws-field">
        <label htmlFor="ws-m-value">{isBp ? 'Systolic' : 'Value'}</label>
        <input id="ws-m-value" className="field" inputMode="decimal" value={value} onChange={e => setValue(e.target.value)} autoComplete="off" />
      </div>
      {isBp && <div className="ws-field">
        <label htmlFor="ws-m-value2">Diastolic</label>
        <input id="ws-m-value2" className="field" inputMode="decimal" value={diastolic} onChange={e => setDiastolic(e.target.value)} autoComplete="off" />
      </div>}
      <div className="ws-field ws-field-narrow">
        <label htmlFor="ws-m-unit">Unit</label>
        <select id="ws-m-unit" className="field" value={unit} onChange={e => setUnit(e.target.value)}>{unitsFor(kind).map(u => <option key={u}>{u}</option>)}</select>
      </div>
    </div>

    {isTemp && <div className="ws-field">
      <label htmlFor="ws-m-method">Method / site</label>
      <select id="ws-m-method" className="field" value={site} onChange={e => setSite(e.target.value as NonNullable<Measurement['site']>)}>
        {(Object.keys(SITE_LABEL) as Array<keyof typeof SITE_LABEL>).map(k => <option key={k} value={k}>{k === 'unknown' ? 'Not recorded / unknown' : SITE_LABEL[k]}</option>)}
      </select>
    </div>}
    {kind === 'skin_temperature' && <p className="ws-hint">Skin temperature is recorded separately and is never a core temperature.</p>}

    {!env && <fieldset className="ws-fieldset">
      <legend>Relative to cooling</legend>
      {(['before_cooling', 'during_cooling', 'after_cooling', 'unknown'] as const).map(p => <label key={p} className="ws-radio">
        <input type="radio" name="ws-m-phase" value={p} checked={phase === p} onChange={() => setPhase(p)} /> {p === 'unknown' ? 'Not recorded' : COOLING_LABEL[p].replace(/^./, c => c.toUpperCase())}
      </label>)}
    </fieldset>}

    <div className="ws-row">
      <div className="ws-field">
        <label htmlFor="ws-m-device">{env ? 'Location (optional)' : 'Device (optional)'}</label>
        <input id="ws-m-device" className="field" value={device} onChange={e => setDevice(e.target.value)} autoComplete="off" />
      </div>
      {env
        ? <div className="ws-field">
            <label htmlFor="ws-m-envm">Method</label>
            <select id="ws-m-envm" className="field" value={envMethod} onChange={e => setEnvMethod(e.target.value as EnvironmentReading['method'])}>
              {Object.entries(ENV_METHOD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        : <div className="ws-field">
            <label htmlFor="ws-m-class">Device type</label>
            <select id="ws-m-class" className="field" value={deviceClass} onChange={e => setDeviceClass(e.target.value as Measurement['deviceClass'])}>
              {Object.entries(DEVICE_CLASS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>}
    </div>
    {!env && <div className="ws-field">
      <label htmlFor="ws-m-note">Note (optional)</label>
      <input id="ws-m-note" className="field" value={note} onChange={e => setNote(e.target.value)} autoComplete="off" />
    </div>}
    <div className="ws-actions">
      <button type="submit" className="btn" disabled={save.pending || !valid}>{save.state === 'error' ? 'Retry save' : env ? 'Save environment reading' : 'Save measurement'}</button>
    </div>
    <p className="ws-hint">A measurement that was not obtained has no structured field on the platform yet — note it as an observation.</p>
    <SaveStatus state={save.state} error={save.error} saved="Measurement added." revision={revision} thing="measurements" />
  </form>;
}
