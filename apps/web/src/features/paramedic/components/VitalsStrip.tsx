import type { Incident } from '../../../platform';
import { formatValue } from '../../../platform/labels';
import { clock } from '../../../platform/time';
import { latestMentalStatus, temperatureSummary } from '../model';
import { collapseEvent } from './IncidentSummary';

/**
 * Phone-only one-line vitals strip (hidden ≥721px). Mirrors the summary's three headline facts —
 * mental status, clinical temperature, collapse time — each with a value or an explicit status chip.
 */
export function VitalsStrip({ incident }: { incident: Incident }) {
  const mental = latestMentalStatus(incident);
  const temp = temperatureSummary(incident);
  const collapse = collapseEvent(incident);

  return <div className="ws-strip no-print" aria-label="Vitals summary">
    <span className="ws-strip-item">
      <span className="ws-strip-label">Mental</span>{' '}
      {mental
        ? <strong>{mental.text}</strong>
        : <span className="chip chip-notdoc">Not documented</span>}
    </span>
    <span className="ws-strip-sep" aria-hidden="true">·</span>
    <span className="ws-strip-item">
      <span className="ws-strip-label">Clinical temp</span>{' '}
      {temp.latest
        ? <strong className="mono">{formatValue(temp.latest)}</strong>
        : <span className="chip chip-unknown">Not yet measured</span>}
    </span>
    <span className="ws-strip-sep" aria-hidden="true">·</span>
    <span className="ws-strip-item">
      <span className="ws-strip-label">Collapse</span>{' '}
      {collapse?.time
        ? <strong className="mono">{clock(collapse.time)}</strong>
        : <span className="chip chip-unknown">Unknown</span>}
    </span>
  </div>;
}
