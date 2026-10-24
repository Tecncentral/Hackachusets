import type { WorkspaceSource } from '../../../platform';
import { clock } from '../../../platform/time';

const TYPE_LABEL: Record<WorkspaceSource['type'], string> = {
  wearable: 'Device record · synthetic',
  dispatch: 'Dispatch · simulated',
  voice: 'Crew entry',
  patient_profile: 'Patient profile · self-reported',
  weather: 'Weather record · synthetic',
  crew: 'Crew entry',
  reference: 'Reference'
};

/** Source evidence with event time and capture time shown separately, plus type label and text. */
export function SourceList({ sources, id }: { sources: WorkspaceSource[]; id?: string }) {
  if (sources.length === 0) return <p className="text-quiet" id={id}>No sources recorded.</p>;
  return <ul className="ws-record-sources" id={id}>
    {sources.map(s => <li key={s.id} className="ws-record-source">
      <div className="ws-record-source-head">
        <span className="tag">{TYPE_LABEL[s.type]}</span>
        <strong>{s.label}</strong>
      </div>
      <p>{s.text}</p>
      <dl className="ws-record-source-times">
        <div><dt>Event time</dt><dd>{s.eventTime === null ? 'unknown' : `${clock(s.eventTime)} EDT`}</dd></div>
        <div><dt>Captured</dt><dd>{clock(s.capturedAt)} EDT</dd></div>
        <div><dt>Source ID</dt><dd><code>{s.id.slice(0, 8)}</code></dd></div>
      </dl>
    </li>)}
  </ul>;
}
