import type { SourceRecord } from '../../../platform';
import { SOURCE_TYPE_LABEL } from '../../../platform/labels';
import { clock } from '../../../platform/time';

/** Source evidence with event time and capture time shown separately, plus type, origin and limitation. */
export function SourceList({ sources, id }: { sources: SourceRecord[]; id?: string }) {
  if (sources.length === 0) return <p className="text-quiet" id={id}>No sources recorded.</p>;
  return <ul className="ws-record-sources" id={id}>
    {sources.map(s => <li key={s.id} className="ws-record-source">
      <div className="ws-record-source-head">
        <span className="tag">{SOURCE_TYPE_LABEL[s.type]}{s.origin === 'synthetic_fixture' ? ' · synthetic' : ''}</span>
        <strong>{s.label}</strong>
      </div>
      <p>{s.text}</p>
      {s.limitation && <p className="ws-hint">Limitation: {s.limitation}</p>}
      <dl className="ws-record-source-times">
        <div><dt>Event time</dt><dd>{s.eventTime === null ? 'unknown' : `${clock(s.eventTime)} EDT`}</dd></div>
        <div><dt>Captured</dt><dd>{clock(s.capturedAt)} EDT</dd></div>
        <div><dt>Source ID</dt><dd><code>{s.id}</code></dd></div>
      </dl>
    </li>)}
  </ul>;
}
