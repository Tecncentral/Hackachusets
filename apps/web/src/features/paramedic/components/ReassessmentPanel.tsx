import { useState } from 'react';
import type { CareEvent, Measurement, WorkspaceIncident } from '../../../platform';
import { formatValue, type PhaseLabel } from '../../../platform/draft';
import { clock } from '../../../platform/time';
import { initialMentalStatus, latestMentalStatus, readings, undocumentedKinds, type ReadingRow } from '../model';
import { MeasurementForm } from './MeasurementForm';
import { CareForm, TimeForm } from './CareForm';
import './care.css';

type FormKind = 'measurement' | 'care' | 'time';

/** Short, human-readable source id (first segment), e.g. "a1b2c3d4". */
function shortId(id: string): string {
  return id.slice(0, 8);
}

/** Column caption: for before/after readings use the cooling phase; otherwise the Initial/Latest role. */
function caption(role: 'Initial' | 'Latest', phase: PhaseLabel | null): string {
  if (phase?.phase === 'before') return 'Before cooling';
  if (phase?.phase === 'after') return 'After cooling';
  return role;
}

function ReadingCell({ m, phase }: { m: Measurement; phase: PhaseLabel | null }) {
  const method = m.kind === 'temperature'
    ? (m.method
        ? <span className="ws-care-meta">{m.method}</span>
        : <span className="chip chip-notdoc">Method not documented</span>)
    : null;
  return <div className="ws-care-cell">
    <div className="mono ws-care-val">{formatValue(m)}</div>
    {method && <div>{method}</div>}
    <div className="ws-care-meta">{m.eventTime ? <span className="mono">{clock(m.eventTime)}</span> : 'Time not documented'}</div>
    {phase && <div className="ws-care-phase">{phase.label}</div>}
    <div className="ws-care-src">[{shortId(m.sourceId)}]</div>
  </div>;
}

function ReadingBlock({ row }: { row: ReadingRow }) {
  const initialCap = caption('Initial', row.initialPhase);
  const latestCap = caption('Latest', row.latestPhase);
  return <div className="ws-care-reading">
    <div className="ws-care-reading-label">{row.label}</div>
    <div className="ws-care-cols">
      <div className="ws-care-col">
        <div className="caps ws-care-colcap">{initialCap}</div>
        <ReadingCell m={row.initial} phase={row.initialPhase} />
      </div>
      <div className="ws-care-col">
        <div className="caps ws-care-colcap">{latestCap}</div>
        {row.latest ? <ReadingCell m={row.latest} phase={row.latestPhase} /> : <p className="ws-care-meta">No repeat measurement yet.</p>}
      </div>
    </div>
  </div>;
}

function MentalStatusPair({ incident }: { incident: WorkspaceIncident }) {
  const initial = initialMentalStatus(incident);
  const latest = latestMentalStatus(incident);
  if (!initial && !latest) return null;
  return <div className="ws-care-reading">
    <div className="ws-care-reading-label">Mental status</div>
    <div className="ws-care-cols">
      <div className="ws-care-col">
        <div className="caps ws-care-colcap">Initial</div>
        <div className="ws-care-cell">{initial ? initial.text : <span className="ws-care-meta">Not documented</span>}</div>
      </div>
      <div className="ws-care-col">
        <div className="caps ws-care-colcap">Latest</div>
        <div className="ws-care-cell">{latest ? latest.text : <span className="ws-care-meta">Not documented</span>}</div>
      </div>
    </div>
  </div>;
}

function CarePerformed({ events }: { events: CareEvent[] }) {
  const sorted = [...events].sort((a, b) => (a.startedAt ?? '9999').localeCompare(b.startedAt ?? '9999'));
  return <div className="ws-care-performed">
    <p className="caps">Care performed</p>
    <ol className="ws-care-list">
      {sorted.map(c => {
        const span = c.startedAt ? `${clock(c.startedAt)}–${c.endedAt ? clock(c.endedAt) : 'ongoing / stop not documented'}` : 'start not documented';
        return <li key={c.id} className="ws-care-item">
          <span className="mono ws-care-item-time">{c.startedAt ? clock(c.startedAt) : '—'}</span>
          <span>
            <strong>{c.action}</strong> <span className="ws-care-meta">({span})</span>
            {c.note ? <span className="ws-care-meta"> · {c.note}</span> : null}
          </span>
        </li>;
      })}
    </ol>
  </div>;
}

/** Right-column care and reassessment card: readings, mental status, care performed, and inline entry forms. */
export function ReassessmentPanel({ incident }: { incident: WorkspaceIncident }) {
  const [open, setOpen] = useState<FormKind | null>(null);
  const rows = readings(incident);
  const undocumented = undocumentedKinds(incident);
  const hasMentalStatus = !!(initialMentalStatus(incident) || latestMentalStatus(incident));
  const isEmpty = rows.length === 0 && !hasMentalStatus && incident.careEvents.length === 0;
  const toggle = (k: FormKind) => setOpen(prev => (prev === k ? null : k));

  return <section className="card ws-care" aria-labelledby="ws-care-h">
    <div className="ws-care-head">
      <h2 id="ws-care-h">Care &amp; reassessment</h2>
      <span className="chip">Manual entry · no monitor</span>
    </div>

    {isEmpty
      ? <p className="text-quiet">No measurements or care documented yet.</p>
      : <>
          <div className="ws-care-readings">
            {rows.map(row => <ReadingBlock key={row.kind} row={row} />)}
            <MentalStatusPair incident={incident} />
          </div>
          {undocumented.length > 0 && <p className="ws-care-meta">Not documented: {undocumented.join(', ')}.</p>}
          {incident.careEvents.length > 0 && <CarePerformed events={incident.careEvents} />}
        </>}

    <div className="ws-care-actions">
      <button type="button" className="btn btn-secondary" aria-expanded={open === 'measurement'} onClick={() => toggle('measurement')}>+ Add measurement</button>
      <button type="button" className="btn btn-secondary" aria-expanded={open === 'care'} onClick={() => toggle('care')}>+ Add care event</button>
      <button type="button" className="btn btn-secondary" aria-expanded={open === 'time'} onClick={() => toggle('time')}>+ Add key time</button>
    </div>

    {open === 'measurement' && <MeasurementForm incident={incident} onSaved={() => undefined} />}
    {open === 'care' && <CareForm incident={incident} onSaved={() => undefined} />}
    {open === 'time' && <TimeForm incident={incident} onSaved={() => undefined} />}

    <p className="ws-care-note">Phase labels come from the crew entry, or from documented cooling times when marked “from cooling times”.</p>
  </section>;
}
