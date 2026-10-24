import type { CareEvent, Measurement, Observation, TimelineEvent, WorkspaceIncident } from '../../../platform';
import { MEASUREMENT_LABEL, OBS_LABEL, formatValue } from '../../../platform/draft';
import { clock } from '../../../platform/time';
import { careChronology, changes, hasWearableData, keyTimes } from '../model';
import { SourceList } from './SourceList';
import '../record.css';

const COOLING_TAG: Record<Measurement['coolingPhase'], string> = {
  before: 'Before cooling', during: 'During cooling', after: 'After cooling', unknown: 'Cooling phase not documented'
};

const INPUT_MODE_LABEL: Record<Observation['inputMode'], string> = {
  typed: 'Typed',
  'voice-reviewed': 'Voice — reviewed transcript',
  example: 'Example transcript',
  legacy: 'Recorded via platform transcript route'
};

function MeasurementRow({ m }: { m: Measurement }) {
  return <li className="ws-record-row ws-record-measurement">
    <span className="ws-record-time">{m.eventTime ? clock(m.eventTime) : 'time not documented'}</span>
    <span className="ws-record-main">
      <strong>{MEASUREMENT_LABEL[m.kind]}</strong> {formatValue(m)}
      {m.kind === 'temperature' && <span className="text-quiet"> · {m.method ? `method: ${m.method}` : 'method not documented'}</span>}
    </span>
    <span className="ws-record-tags">
      <span className="tag">{COOLING_TAG[m.coolingPhase]}</span>
      <span className="tag">{m.sourceKind === 'wearable' ? 'Wearable (synthetic)' : 'Manual entry'}</span>
    </span>
  </li>;
}

function CareRow({ c }: { c: CareEvent }) {
  const span = c.startedAt ? `${clock(c.startedAt)}–${c.endedAt ? clock(c.endedAt) : 'ongoing / stop not documented'}` : 'start not documented';
  return <li className="ws-record-row ws-record-care">
    <span className="ws-record-time">{c.startedAt ? clock(c.startedAt) : 'time not documented'}</span>
    <span className="ws-record-main">
      <strong>{c.action}</strong> <span className="text-quiet">({span})</span>
      {c.note ? <span className="text-quiet"> · {c.note}</span> : null}
      <span className="text-quiet"> · recorded by {c.recordedBy}</span>
    </span>
  </li>;
}

function CareReassessment({ incident }: { incident: WorkspaceIncident }) {
  const items = careChronology(incident);
  return <details className="ws-record-section" open>
    <summary className="ws-record-summary">Care &amp; reassessment</summary>
    <div className="ws-record-body">
      {items.length === 0
        ? <p className="text-quiet">No measurements or care documented yet.</p>
        : <ol className="ws-record-list">
            {items.map(item => item.kind === 'measurement'
              ? <MeasurementRow key={item.m.id} m={item.m} />
              : <CareRow key={item.c.id} c={item.c} />)}
          </ol>}
    </div>
  </details>;
}

function Observations({ incident }: { incident: WorkspaceIncident }) {
  const active = incident.observations.filter(o => o.status === 'active').slice().reverse();
  const clarified = incident.observations.filter(o => o.status === 'clarified').slice().reverse();
  const changeRows = changes(incident);
  const replacementFor = (originalId: string) => changeRows.find(r => r.original.id === originalId)?.replacement;

  return <details className="ws-record-section" open>
    <summary className="ws-record-summary">Observations</summary>
    <div className="ws-record-body">
      {changeRows.length > 0 && <div className="ws-record-changed">
        <strong>What changed</strong>
        <ul className="ws-record-list">
          {changeRows.map(r => <li key={r.id} className="ws-record-row">
            <span className="ws-record-main">
              Earlier: “{r.original.text}” → Clarification: “{r.replacement.text}”
              <span className="text-quiet"> · {clock(r.recordedAt)}{r.feedback ? ' · in response to assistant question' : ''}</span>
            </span>
          </li>)}
        </ul>
      </div>}

      {active.length === 0 && clarified.length === 0 && <p className="text-quiet">No observations documented yet.</p>}

      <ul className="ws-record-list">
        {active.map(o => <ObservationItem key={o.id} o={o} />)}
        {clarified.map(o => <ObservationItem key={o.id} o={o} clarifiedBy={replacementFor(o.id)?.text ?? null} />)}
      </ul>
    </div>
  </details>;
}

function ObservationItem({ o, clarifiedBy }: { o: Observation; clarifiedBy?: string | null }) {
  const isClarified = o.status === 'clarified';
  return <li className={`ws-record-row ws-record-obs${isClarified ? ' ws-record-obs-clarified' : ''}`}>
    <span className="ws-record-tags">
      <span className="tag">{OBS_LABEL[o.category]}</span>
      <span className="tag">{INPUT_MODE_LABEL[o.inputMode]}</span>
      {isClarified && <span className="tag tag-warn">Clarified — kept for the record</span>}
    </span>
    <span className="ws-record-main">{o.text}</span>
    <span className="text-quiet">
      {o.observedAt ? `observed ${clock(o.observedAt)}` : 'observed time not documented'} · captured {clock(o.capturedAt)}
    </span>
    {isClarified && clarifiedBy && <span className="ws-record-clarifiedby">Clarified by: “{clarifiedBy}”</span>}
  </li>;
}

function KeyTimes({ incident }: { incident: WorkspaceIncident }) {
  const rows = keyTimes(incident);
  const timeText = (event: TimelineEvent | undefined) => {
    if (!event || event.time === null) return 'Unknown';
    return `${event.certainty === 'recorded' ? '' : '≈'}${clock(event.time)}`;
  };
  return <details className="ws-record-section" open>
    <summary className="ws-record-summary">Key times</summary>
    <div className="ws-record-body">
      <ul className="ws-record-list">
        {rows.map(row => <li key={row.kind} className="ws-record-row ws-record-time-row">
          <span className="ws-record-main"><strong>{row.label}</strong></span>
          <span>{timeText(row.event)}</span>
          {row.event && row.event.time !== null && <span className="text-quiet">{row.event.certainty}</span>}
          {row.event?.note && <span className="text-quiet">{row.event.note}</span>}
        </li>)}
      </ul>
      <p className="text-quiet ws-record-caption">Discovery time and device fall events do not establish collapse time.</p>
    </div>
  </details>;
}

function EvidenceSources({ incident }: { incident: WorkspaceIncident }) {
  return <details className="ws-record-section">
    <summary className="ws-record-summary">Evidence and sources</summary>
    <div className="ws-record-body">
      <SourceList sources={incident.sources} id="ws-record-all-sources" />
    </div>
  </details>;
}

function WearableBackground({ incident }: { incident: WorkspaceIncident }) {
  const wearableSources = incident.sources.filter(s => s.type === 'wearable');
  const wearableMeasurements = incident.measurements.filter(m => m.sourceKind === 'wearable');
  const hasData = hasWearableData(incident);
  return <details className="ws-record-section">
    <summary className="ws-record-summary">Wearable background</summary>
    <div className="ws-record-body">
      {hasData
        ? <>
            <p className="text-quiet ws-record-caption">Consumer device records. Skin-temperature deviation is not core temperature; fall and pace events do not establish onset or unconsciousness.</p>
            <SourceList sources={wearableSources} id="ws-record-wearable-sources" />
            {wearableMeasurements.length > 0 && <ul className="ws-record-list">
              {wearableMeasurements.map(m => <MeasurementRow key={m.id} m={m} />)}
            </ul>}
          </>
        : <p className="text-quiet">No wearable data available for this patient. All other functions work without it.</p>}
    </div>
  </details>;
}

/** The record, shown with progressive disclosure. Each section copies stored records; it adds no interpretation. */
export function RecordPanel({ incident }: { incident: WorkspaceIncident }) {
  return <section className="ws-record" aria-labelledby="ws-record-h">
    <h2 id="ws-record-h" tabIndex={-1}>Record</h2>
    <CareReassessment incident={incident} />
    <Observations incident={incident} />
    <KeyTimes incident={incident} />
    <EvidenceSources incident={incident} />
    <WearableBackground incident={incident} />
  </section>;
}
