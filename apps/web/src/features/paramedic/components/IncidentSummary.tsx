import { useId, useState } from 'react';
import type { ContextFact, Incident, Measurement, TimelineEvent } from '../../../platform';
import { CERTAINTY_LABEL, SITE_LABEL, TIME_LABEL, current, formatValue, latestTime } from '../../../platform/labels';
import { clock } from '../../../platform/time';
import {
  WORKING_CONCERN,
  hasWearableData,
  initialMentalStatus,
  keyUnknowns,
  latestMentalStatus,
  readings,
  temperatureSummary,
  witnessAccount,
  type Unknown
} from '../model';
import { PatientMatch } from './PatientMatch';
import { SourceList } from './SourceList';
import '../record.css';

/** Shared collapse-time lookup, also used by the phone vitals strip. */
export function collapseEvent(incident: Incident): TimelineEvent | undefined {
  return latestTime(incident.timelineEvents, 'collapse');
}

const CAPS = (text: string) => <p className="caps ws-summary-caps">{text}</p>;

/** Maps a model `Unknown.state` to the exact UI label + chip class. */
function unknownChip(state: Unknown['state']) {
  if (state === 'Unknown') return <span className="chip chip-unknown">Unknown</span>;
  return <span className="chip chip-notdoc">Not documented</span>;
}

function PatientContext({ incident }: { incident: Incident }) {
  if (!incident.patient.matched) {
    return <div className="ws-summary-field">
      {CAPS('Patient & context')}
      <p className="ws-summary-primary">Unidentified patient</p>
      <p className="ws-summary-hint">
        The caller is not assumed to be the patient. You can document and hand off without identifying anyone.
      </p>
      <PatientMatch incident={incident} />
    </div>;
  }
  const facts = current(incident.contextFacts);
  const fact = (category: ContextFact['category']) => facts.filter(f => f.category === category).at(-1);
  const rows: Array<[string, ContextFact | undefined]> = [
    ['Age', fact('age')], ['History', fact('relevant_history')], ['Allergies', fact('allergy')], ['Medications', fact('medication')], ['Contact', fact('witness_contact')]
  ];
  return <div className="ws-summary-field">
    {CAPS('Patient & context')}
    <dl className="ws-summary-context">
      <div><dt>Name</dt><dd>{incident.patient.name}</dd></div>
      {rows.map(([k, f]) => <div key={k}>
        <dt>{k}</dt>
        <dd>{!f ? <span className="chip chip-notdoc">Not documented</span>
          : f.state === 'unknown' ? <span className="chip chip-unknown">Unknown</span>
          : <>{f.value}{f.reportedBy !== 'crew' ? <span className="ws-summary-hint"> · {f.reportedBy === 'patient' ? 'self-reported, not verified' : `per ${f.reportedBy}`}</span> : null}</>}</dd>
      </div>)}
    </dl>
  </div>;
}

function MentalStatus({ incident }: { incident: Incident }) {
  const latest = latestMentalStatus(incident);
  const initial = initialMentalStatus(incident);
  return <div className="ws-summary-field">
    {CAPS('Mental status')}
    {latest
      ? <>
          <p className="ws-summary-primary">{latest.text}</p>
          <p className="ws-summary-hint">
            {latest.observedAt
              ? <>observed <span className="mono">{clock(latest.observedAt)}</span></>
              : <>recorded <span className="mono">{clock(latest.recordedAt)}</span></>}
          </p>
          {initial && initial.id !== latest.id && <p className="ws-summary-hint">
            Initial <span className="mono">{initial.observedAt ? clock(initial.observedAt) : clock(initial.recordedAt)}</span>: {initial.text}
          </p>}
        </>
      : <p><span className="chip chip-notdoc">Not documented</span></p>}
  </div>;
}

function TemperatureRow({ m, phaseLabel }: { m: Measurement; phaseLabel: string }) {
  return <div className="ws-summary-temp-row">
    <span className="mono ws-summary-temp-value">{formatValue(m)}</span>
    <span className="ws-summary-hint">
      {m.site && m.site !== 'unknown' ? `method/site: ${SITE_LABEL[m.site].toLowerCase()}` : <span className="chip chip-attn">Method/site unknown</span>}
      {' · '}
      {m.measuredAt ? <span className="mono">{clock(m.measuredAt)}</span> : 'Time unknown'}
      {' · '}{phaseLabel}
    </span>
  </div>;
}

function ClinicalTemperature({ incident }: { incident: Incident }) {
  const temp = temperatureSummary(incident);
  const tempReading = readings(incident).find(r => r.kind === 'body_temperature');

  let body: React.ReactNode;
  if (!temp.latest || !tempReading) {
    body = <>
      <p><span className="chip chip-unknown">Not yet measured</span></p>
      <p className="ws-summary-hint">A wearable skin reading is not a core temperature.</p>
    </>;
  } else {
    // Clinical temperature rows only: the initial reading and the latest if different.
    const rows: Array<{ m: Measurement; phase: string }> = [{ m: tempReading.initial, phase: tempReading.initialPhase.label }];
    if (tempReading.latest && tempReading.latest.id !== tempReading.initial.id) rows.push({ m: tempReading.latest, phase: tempReading.latestPhase?.label ?? 'Cooling phase not recorded' });
    body = rows.map(r => <TemperatureRow key={r.m.id} m={r.m} phaseLabel={r.phase} />);
  }

  return <div className="ws-summary-field">
    {CAPS('Clinical temperature')}
    {body}
  </div>;
}

function timeValue(event: TimelineEvent | undefined): React.ReactNode {
  if (!event || event.time === null) return null;
  return <span className="mono">{event.certainty === 'approximate' ? '≈' : ''}{clock(event.time)}</span>;
}

function KeyTimes({ incident }: { incident: Incident }) {
  const discovery = latestTime(incident.timelineEvents, 'discovery');
  const collapse = collapseEvent(incident);
  const call = latestTime(incident.timelineEvents, 'emergency_call');
  const arrival = latestTime(incident.timelineEvents, 'crew_arrival');

  return <div className="ws-summary-field">
    {CAPS('Key times')}
    <dl className="ws-summary-times">
      <div>
        <dt>Found (discovery)</dt>
        <dd>{discovery
          ? (timeValue(discovery) ?? <span className="chip chip-unknown">Unknown</span>)
          : <span className="chip chip-notdoc">Not documented</span>}</dd>
      </div>
      <div>
        <dt>Collapse</dt>
        <dd>{collapse?.time ? timeValue(collapse) : <span className="chip chip-unknown">Unknown</span>}</dd>
      </div>
      {call && <div>
        <dt>Emergency call</dt>
        <dd>{timeValue(call) ?? <span className="chip chip-unknown">Unknown</span>}</dd>
      </div>}
      {arrival && <div>
        <dt>Crew arrival</dt>
        <dd>{timeValue(arrival) ?? <span className="chip chip-unknown">Unknown</span>}</dd>
      </div>}
    </dl>
    <p className="ws-summary-hint">Discovery time and device fall events do not establish collapse time.</p>
  </div>;
}

function WitnessAccount({ incident }: { incident: Incident }) {
  const account = witnessAccount(incident);
  const source = account ? incident.sources.find(s => s.id === account.sourceIds[0]) : undefined;
  return <div className="ws-summary-field">
    {CAPS('Witness account')}
    {account
      ? <blockquote className="ws-summary-quote">
          “{account.text}”
          {source && <span className="ws-summary-hint"> — <code>{source.id.replace(/^src-/, '').slice(0, 8)}</code></span>}
        </blockquote>
      : <p><span className="chip chip-notdoc">Not documented</span></p>}
  </div>;
}

function KeyUnknowns({ incident }: { incident: Incident }) {
  const unknowns = keyUnknowns(incident);
  const [open, setOpen] = useState(false);
  const legendId = useId();
  if (unknowns.length === 0) return null;
  return <div className="ws-summary-field">
    {CAPS('Key unknowns')}
    <ul className="ws-summary-unknowns">
      {unknowns.map(u => <li key={u.label}>
        <strong>{u.label}</strong> — {unknownChip(u.state)}
      </li>)}
    </ul>
    <button
      type="button"
      className="btn btn-quiet ws-summary-legend-toggle"
      aria-expanded={open}
      aria-controls={legendId}
      onClick={() => setOpen(o => !o)}
    >What do Unknown / Not documented / Not performed mean?</button>
    {open && <dl id={legendId} className="ws-summary-legend">
      <dt>Unknown</dt><dd>Cannot be established yet.</dd>
      <dt>Not documented</dt><dd>May have been checked; nothing entered.</dd>
      <dt>Not performed</dt><dd>Crew recorded that it was not done.</dd>
    </dl>}
  </div>;
}

function FullTimeline({ incident }: { incident: Incident }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const events = current(incident.timelineEvents).sort((a, b) => (a.time ?? '9999').localeCompare(b.time ?? '9999'));
  return <div className="ws-summary-disclosure">
    <button
      type="button"
      className="btn btn-quiet ws-summary-disclosure-toggle"
      aria-expanded={open}
      aria-controls={panelId}
      onClick={() => setOpen(o => !o)}
    ><span>Full timeline &amp; sources</span><span aria-hidden="true">{open ? 'Hide' : 'Show'}</span></button>
    {open && <div id={panelId} className="ws-summary-disclosure-body">
      {events.length > 0
        ? <ol className="ws-summary-timeline">
            {events.map(ev => <li key={ev.id}>
              <span className="mono ws-summary-timeline-time">{ev.time ? clock(ev.time) : 'Unknown'}</span>
              <span>
                {TIME_LABEL[ev.kind]}{ev.note ? ` — ${ev.note}` : ''}
                <span className="ws-summary-hint"> · {CERTAINTY_LABEL[ev.certainty].toLowerCase()} · {ev.reportedBy}</span>
              </span>
            </li>)}
          </ol>
        : <p className="text-quiet">No timeline events recorded.</p>}
      <SourceList sources={incident.sources} id={`${panelId}-sources`} />
    </div>}
  </div>;
}

function WearableBackground({ incident }: { incident: Incident }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  if (!hasWearableData(incident)) {
    return <p className="ws-summary-hint ws-summary-no-wearable">No wearable data — not needed for documentation.</p>;
  }
  const sourceOf = (id: string) => incident.sources.find(s => s.id === id);
  return <div className="ws-summary-disclosure">
    <button
      type="button"
      className="btn btn-quiet ws-summary-disclosure-toggle"
      aria-expanded={open}
      aria-controls={panelId}
      onClick={() => setOpen(o => !o)}
    ><span>Wearable background (optional)</span><span aria-hidden="true">{open ? 'Hide' : 'Show'}</span></button>
    {open && <div id={panelId} className="ws-summary-disclosure-body">
      <p className="ws-summary-hint">
        Consumer device data. Not a clinical measurement. Device event times are not illness onset. {incident.wearableStatus.note}
      </p>
      <ul className="ws-summary-wearable">
        {incident.wearableRecords.map(w => <li key={w.id}>
          <span className="mono ws-summary-wearable-time">
            {w.startTime ? `device time ${clock(w.startTime)}${w.endTime ? `–${clock(w.endTime)}` : ''}` : 'device time not recorded'}
          </span>
          <span>{w.summary} <span className="ws-summary-hint">{w.limitation}{w.gaps ? ` ${w.gaps}` : ''}</span> <code>{w.sourceId}</code>
            {sourceOf(w.sourceId)?.origin === 'synthetic_fixture' ? <span className="ws-summary-hint"> · synthetic fixture</span> : null}</span>
        </li>)}
      </ul>
    </div>}
  </div>;
}

/**
 * Left summary column: one card of the patient and incident at a glance, then a second card with
 * the full timeline and optional wearable background. Every value states its meaning in words;
 * status is never carried by colour alone. All patient data comes from the incident record.
 */
export function IncidentSummary({ incident }: { incident: Incident }) {
  return <aside className="ws-summary" aria-label="Patient and incident summary">
    <section className="card ws-summary-card">
      <PatientContext incident={incident} />

      <div className="ws-summary-field ws-summary-concern">
        {CAPS('Working concern')}
        <p className="ws-summary-primary">
          {WORKING_CONCERN} — <span className="chip chip-notdoc">not established</span>
        </p>
      </div>

      <MentalStatus incident={incident} />
      <ClinicalTemperature incident={incident} />
      <KeyTimes incident={incident} />
      <WitnessAccount incident={incident} />
      <KeyUnknowns incident={incident} />
    </section>

    <section className="card ws-summary-disclosures">
      <FullTimeline incident={incident} />
      <WearableBackground incident={incident} />
    </section>
  </aside>;
}
