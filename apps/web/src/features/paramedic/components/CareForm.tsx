import { useState } from 'react';
import { useAction, useIncidentState, type CareEvent, type Incident, type TimelineEvent } from '../../../platform';
import { CARE_LABEL, CERTAINTY_LABEL, COOLING_METHOD_LABEL, REPORTED_BY_LABEL, TIME_LABEL } from '../../../platform/labels';
import { zoneTimeToIso } from '../../../platform/time';
import { CREW_TIME_KINDS, incidentDate } from '../model';
import { SaveStatus, TimeField, useRequestId } from './fields';

const PERFORMANCE: Record<CareEvent['performance'], string> = { performed: 'Performed', not_performed: 'Not performed', unknown: 'Unknown whether performed' };

/** Records care that was actually performed (or explicitly not performed). It offers no suggestions about what to perform. */
export function CareForm({ incident, onSaved }: { incident: Incident; onSaved?: () => void }) {
  const { platform } = useIncidentState();
  const save = useAction();
  const req = useRequestId();
  const [kind, setKind] = useState<CareEvent['kind']>('cooling');
  const [description, setDescription] = useState('');
  const [method, setMethod] = useState<NonNullable<CareEvent['coolingMethod']> | ''>('');
  const [performance, setPerformance] = useState<CareEvent['performance']>('performed');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [response, setResponse] = useState('');
  const [revision, setRevision] = useState<number | null>(null);
  const date = incidentDate(incident);
  const timed = performance !== 'not_performed';

  const submit = async () => {
    const body = {
      kind, description: description.trim(), performance, coolingMethod: kind === 'cooling' && method ? method : null,
      startedAt: timed && start ? zoneTimeToIso(date, start) : null, endedAt: timed && end ? zoneTimeToIso(date, end) : null,
      response: response.trim() || null
    };
    const result = await save.run(() => platform.addCareEvent({ ...body, requestId: req.forContent(JSON.stringify(body)), baseRevision: incident.revision }));
    if (result) { setRevision(result.revision); req.done(); setDescription(''); setStart(''); setEnd(''); setResponse(''); onSaved?.(); }
  };

  return <form className="ws-form" aria-label="Add care event" onSubmit={e => { e.preventDefault(); void submit(); }}>
    <div className="ws-row">
      <div className="ws-field">
        <label htmlFor="ws-c-cat">Type</label>
        <select id="ws-c-cat" className="field" value={kind} onChange={e => setKind(e.target.value as CareEvent['kind'])}>
          {Object.entries(CARE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <div className="ws-field">
        <label htmlFor="ws-c-action">Action</label>
        <input id="ws-c-action" className="field" value={description} maxLength={200} onChange={e => setDescription(e.target.value)} autoComplete="off" aria-describedby="ws-c-action-hint" />
        <p id="ws-c-action-hint" className="ws-hint">Describe what was done.</p>
      </div>
    </div>
    {kind === 'cooling' && <div className="ws-field">
      <label htmlFor="ws-c-method">Cooling method</label>
      <select id="ws-c-method" className="field" value={method} onChange={e => setMethod(e.target.value as NonNullable<CareEvent['coolingMethod']> | '')}>
        <option value="">Not recorded</option>
        {Object.entries(COOLING_METHOD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
    </div>}
    <fieldset className="ws-fieldset"><legend>Status</legend>
      {(Object.keys(PERFORMANCE) as CareEvent['performance'][]).map(p => <label key={p} className="ws-radio"><input type="radio" name="ws-c-perf" checked={performance === p} onChange={() => setPerformance(p)} /> {PERFORMANCE[p]}</label>)}
    </fieldset>
    {timed && <div className="ws-row">
      <TimeField id="ws-c-start" label="Started" value={start} onChange={setStart} hint={start ? 'EDT.' : 'Empty = start time unknown.'} />
      <TimeField id="ws-c-end" label="Stopped" value={end} onChange={setEnd} hint={end ? 'EDT.' : 'Empty = ongoing or not recorded.'} />
    </div>}
    <div className="ws-field">
      <label htmlFor="ws-c-note">Observed response (optional)</label>
      <input id="ws-c-note" className="field" value={response} maxLength={1000} onChange={e => setResponse(e.target.value)} autoComplete="off" />
    </div>
    <div className="ws-actions"><button type="submit" className="btn" disabled={save.pending || !description.trim()}>{save.state === 'error' ? 'Retry save' : 'Save care event'}</button></div>
    <SaveStatus state={save.state} error={save.error} saved="Care event added. Add a repeat measurement to document the reassessment." revision={revision} thing="care events" />
  </form>;
}

/** Key times stay separate facts: discovery is never collapse. Empty time records an explicit unknown. */
export function TimeForm({ incident, onSaved }: { incident: Incident; onSaved?: () => void }) {
  const { platform } = useIncidentState();
  const save = useAction();
  const req = useRequestId();
  const [kind, setKind] = useState<TimelineEvent['kind']>('discovery');
  const [time, setTime] = useState('');
  const [certainty, setCertainty] = useState<'recorded' | 'approximate'>('approximate');
  const [reportedBy, setReportedBy] = useState<TimelineEvent['reportedBy']>('witness');
  const [note, setNote] = useState('');
  const [revision, setRevision] = useState<number | null>(null);

  const submit = async () => {
    const iso = time ? zoneTimeToIso(incidentDate(incident), time) : null;
    // Contract: certainty "unknown" exactly when time is null.
    const body = { kind, time: iso, certainty: iso ? certainty : 'unknown' as const, reportedBy, note: note.trim() || null };
    const result = await save.run(() => platform.addTimelineEvent({ ...body, requestId: req.forContent(JSON.stringify(body)), baseRevision: incident.revision }));
    if (result) { setRevision(result.revision); req.done(); setTime(''); setNote(''); onSaved?.(); }
  };

  return <form className="ws-form" aria-label="Add key time" onSubmit={e => { e.preventDefault(); void submit(); }}>
    <div className="ws-row">
      <div className="ws-field">
        <label htmlFor="ws-t-kind">Event</label>
        <select id="ws-t-kind" className="field" value={kind} onChange={e => setKind(e.target.value as TimelineEvent['kind'])}>
          {CREW_TIME_KINDS.map(k => <option key={k} value={k}>{TIME_LABEL[k]}</option>)}
        </select>
      </div>
      <TimeField id="ws-t-time" label="Time" value={time} onChange={setTime} hint={time ? 'EDT.' : 'Empty = record as unknown.'} />
    </div>
    {time && <fieldset className="ws-fieldset"><legend>How known</legend>
      {(['approximate', 'recorded'] as const).map(c => <label key={c} className="ws-radio"><input type="radio" name="ws-t-cert" checked={certainty === c} onChange={() => setCertainty(c)} /> {CERTAINTY_LABEL[c]}</label>)}
    </fieldset>}
    <div className="ws-row">
      <div className="ws-field">
        <label htmlFor="ws-t-by">Reported by</label>
        <select id="ws-t-by" className="field" value={reportedBy} onChange={e => setReportedBy(e.target.value as TimelineEvent['reportedBy'])}>
          {Object.entries(REPORTED_BY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <div className="ws-field">
        <label htmlFor="ws-t-note">Note</label>
        <input id="ws-t-note" className="field" value={note} maxLength={1000} onChange={e => setNote(e.target.value)} placeholder="e.g. found by friend; collapse not witnessed" autoComplete="off" />
      </div>
    </div>
    <div className="ws-actions"><button type="submit" className="btn" disabled={save.pending}>{save.state === 'error' ? 'Retry save' : time ? 'Save time' : 'Record as unknown'}</button></div>
    <SaveStatus state={save.state} error={save.error} saved="Time recorded." revision={revision} thing="key times" />
  </form>;
}
