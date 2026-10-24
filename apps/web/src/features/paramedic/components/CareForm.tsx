import { useState } from 'react';
import { useAction, useIncidentState, type CareEvent, type TimelineEvent, type WorkspaceIncident } from '../../../platform';
import { TIME_LABEL } from '../../../platform/draft';
import { zoneTimeToIso } from '../../../platform/time';
import { KEY_TIMES, incidentDate } from '../model';
import { SaveStatus, TimeField, useRequestId } from './fields';

const CARE_LABEL: Record<CareEvent['category'], string> = { cooling: 'Cooling', airway: 'Airway / breathing', iv_access: 'IV / IO access', medication: 'Medication', positioning: 'Positioning', transport: 'Transport', other: 'Other' };

/** Records care that was actually performed. It offers no suggestions about what to perform. */
export function CareForm({ incident, onSaved }: { incident: WorkspaceIncident; onSaved?: () => void }) {
  const { platform } = useIncidentState();
  const save = useAction();
  const req = useRequestId();
  const [category, setCategory] = useState<CareEvent['category']>('cooling');
  const [action, setAction] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [note, setNote] = useState('');
  const date = incidentDate(incident);

  const submit = async () => {
    const body = { category, action: action.trim(), startedAt: start ? zoneTimeToIso(date, start) : null, endedAt: end ? zoneTimeToIso(date, end) : null, note: note.trim() || null, recordedBy: 'crew' };
    const ok = await save.run(() => platform.addCareEvent({ ...body, requestId: req.forContent(JSON.stringify(body)), baseRevision: incident.revision }));
    if (ok) { req.done(); setAction(''); setStart(''); setEnd(''); setNote(''); onSaved?.(); }
  };

  return <form className="ws-form" aria-label="Add care event" onSubmit={e => { e.preventDefault(); void submit(); }}>
    <div className="ws-row">
      <div className="ws-field">
        <label htmlFor="ws-c-cat">Type</label>
        <select id="ws-c-cat" value={category} onChange={e => setCategory(e.target.value as CareEvent['category'])}>
          {Object.entries(CARE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <div className="ws-field">
        <label htmlFor="ws-c-action">Action performed</label>
        <input id="ws-c-action" value={action} onChange={e => setAction(e.target.value)} autoComplete="off" aria-describedby="ws-c-action-hint" />
        <p id="ws-c-action-hint" className="ws-hint">Describe what was done{category === 'cooling' ? ', including cooling method' : ''}.</p>
      </div>
    </div>
    <div className="ws-row">
      <TimeField id="ws-c-start" label="Started" value={start} onChange={setStart} />
      <TimeField id="ws-c-end" label="Stopped" value={end} onChange={setEnd} hint={end ? 'EDT.' : 'Empty = ongoing or not documented.'} />
    </div>
    <div className="ws-field">
      <label htmlFor="ws-c-note">Observed response (optional)</label>
      <input id="ws-c-note" value={note} onChange={e => setNote(e.target.value)} autoComplete="off" />
    </div>
    <div className="ws-actions"><button type="submit" className="btn" disabled={save.pending || !action.trim()}>{save.state === 'error' ? 'Retry save' : 'Save care event'}</button></div>
    <SaveStatus state={save.state} error={save.error} saved="Care event added. Add a repeat measurement to document the reassessment." />
  </form>;
}

const CERTAINTY: TimelineEvent['certainty'][] = ['reported', 'estimated', 'recorded'];

/** Key times stay separate facts: discovery is never collapse. Empty time records an explicit unknown. */
export function TimeForm({ incident, onSaved }: { incident: WorkspaceIncident; onSaved?: () => void }) {
  const { platform } = useIncidentState();
  const save = useAction();
  const req = useRequestId();
  const [kind, setKind] = useState<TimelineEvent['kind']>('discovery');
  const [time, setTime] = useState('');
  const [certainty, setCertainty] = useState<TimelineEvent['certainty']>('reported');
  const [note, setNote] = useState('');

  const submit = async () => {
    const iso = time ? zoneTimeToIso(incidentDate(incident), time) : null;
    const body = { kind, time: iso, certainty: iso ? certainty : 'unknown' as const, note: note.trim() || null };
    const ok = await save.run(() => platform.addTimelineEvent({ ...body, requestId: req.forContent(JSON.stringify(body)), baseRevision: incident.revision }));
    if (ok) { req.done(); setTime(''); setNote(''); onSaved?.(); }
  };

  return <form className="ws-form" aria-label="Add key time" onSubmit={e => { e.preventDefault(); void submit(); }}>
    <div className="ws-row">
      <div className="ws-field">
        <label htmlFor="ws-t-kind">Event</label>
        <select id="ws-t-kind" value={kind} onChange={e => setKind(e.target.value as TimelineEvent['kind'])}>
          {KEY_TIMES.filter(k => k !== 'deviceFall').map(k => <option key={k} value={k}>{TIME_LABEL[k]}</option>)}
        </select>
      </div>
      <TimeField id="ws-t-time" label="Time" value={time} onChange={setTime} hint={time ? 'EDT.' : 'Empty = record as unknown.'} />
    </div>
    {time && <fieldset className="ws-fieldset"><legend>How known</legend>
      {CERTAINTY.map(c => <label key={c} className="ws-radio"><input type="radio" name="ws-t-cert" checked={certainty === c} onChange={() => setCertainty(c)} /> {c[0].toUpperCase() + c.slice(1)}</label>)}
    </fieldset>}
    <div className="ws-field">
      <label htmlFor="ws-t-note">Source / note</label>
      <input id="ws-t-note" value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. per friend; did not witness collapse" autoComplete="off" />
    </div>
    <div className="ws-actions"><button type="submit" className="btn" disabled={save.pending}>{save.state === 'error' ? 'Retry save' : time ? 'Save time' : 'Record as unknown'}</button></div>
    <SaveStatus state={save.state} error={save.error} saved="Time recorded." />
  </form>;
}
