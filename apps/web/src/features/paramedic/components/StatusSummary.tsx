import type { WorkspaceIncident } from '../../../platform';
import { COOLING_LABEL, MEASUREMENT_LABEL, formatValue } from '../../../platform/draft';
import { clock } from '../../../platform/time';
import { keyUnknowns, latestMentalStatus, latestVitals, temperatureSummary } from '../model';

/**
 * Compact, always-visible 'Current status' card. Every value states its meaning in words
 * (not colour alone); unknown / not documented / not obtained stay distinct.
 */
export function StatusSummary({ incident }: { incident: WorkspaceIncident }) {
  const mental = latestMentalStatus(incident);
  const mentalTime = mental ? (mental.observedAt ? `observed ${clock(mental.observedAt)}` : `recorded ${clock(mental.capturedAt)}`) : null;
  const temp = temperatureSummary(incident);
  const vitals = latestVitals(incident);
  const unknowns = keyUnknowns(incident);

  const latest = temp.latest;
  const showBefore = temp.firstBeforeCooling && (!latest || temp.firstBeforeCooling.id !== latest.id);

  return <section className="card ws-status-summary" aria-label="Current status">
    <h2 className="ws-status-summary-h">Current status</h2>
    <dl className="ws-status-summary-grid">
      <div className="ws-status-summary-item">
        <dt>Mental status</dt>
        <dd>{mental
          ? <><span>{mental.text}</span> <span className="text-quiet">· {mentalTime}</span></>
          : <span className="text-quiet">Not documented</span>}</dd>
      </div>

      <div className="ws-status-summary-item">
        <dt>Clinical temperature</dt>
        <dd>
          {latest
            ? <>
                <span>{formatValue(latest)}</span>{' '}
                <span className="text-quiet">
                  {latest.method ? `method: ${latest.method}` : 'method not documented'}
                  {' · '}{latest.eventTime ? `at ${clock(latest.eventTime)}` : 'time not documented'}
                  {' · '}{COOLING_LABEL[latest.coolingPhase]}
                </span>
                {showBefore && temp.firstBeforeCooling && <div className="ws-status-summary-sub text-quiet">
                  Before cooling: {formatValue(temp.firstBeforeCooling)}{temp.firstBeforeCooling.eventTime ? ` at ${clock(temp.firstBeforeCooling.eventTime)}` : ''}
                </div>}
              </>
            : <span className="text-quiet">{temp.notObtained ? 'Not obtained' : 'Not documented'}</span>}
        </dd>
      </div>

      <div className="ws-status-summary-item">
        <dt>Other vitals</dt>
        <dd>
          {vitals.length > 0
            ? <ul className="ws-status-summary-vitals">
                {vitals.map(v => <li key={v.id}>
                  <span>{MEASUREMENT_LABEL[v.kind]} {formatValue(v)}</span>{' '}
                  <span className="text-quiet">{v.eventTime ? `at ${clock(v.eventTime)}` : 'time not documented'}</span>
                </li>)}
              </ul>
            : <span className="text-quiet">No other vitals documented</span>}
        </dd>
      </div>

      <div className="ws-status-summary-item">
        <dt>Key unknowns</dt>
        <dd>
          {unknowns.length > 0
            ? <ul className="ws-status-summary-tags">
                {unknowns.map(u => <li key={u.label}><span className="tag tag-warn">{u.label}: {u.state}</span></li>)}
              </ul>
            : <span className="text-quiet">None outstanding</span>}
        </dd>
      </div>
    </dl>
  </section>;
}
