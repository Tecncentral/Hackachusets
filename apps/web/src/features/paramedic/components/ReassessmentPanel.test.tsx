import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createDemoIncident } from '@scenebrief/fixtures';
import { createDevPlatform, type DevStorage } from '../../../platform/dev';
import { normalizeIncident } from '../../../platform/legacy';
import { zoneTimeToIso } from '../../../platform/time';
import type { CareEventInput, HandoffDraft, MeasurementInput, WorkspaceIncident } from '../../../platform';
import { ReassessmentPanel } from './ReassessmentPanel';
import { HandoffCard } from './HandoffCard';

/** In-memory storage so the development adapter keeps records without touching localStorage. */
function memoryStorage(): DevStorage {
  const map = new Map<string, string>();
  return { get: k => map.get(k) ?? null, set: (k, v) => void map.set(k, v), remove: k => void map.delete(k) };
}

function makePlatform() {
  return createDevPlatform({ storage: memoryStorage(), seed: async () => normalizeIncident(createDemoIncident()), evaluationDelayMs: 0 });
}

async function matched(platform = makePlatform()) {
  await platform.setSharing(true);
  const incident = await platform.match('patient-demo-01');
  return { platform, incident };
}

const DATE = '2026-10-24';

function rectalTemp(hhmm: string | null, value: number, coolingPhase: MeasurementInput['coolingPhase'], baseRevision: number): MeasurementInput {
  return {
    requestId: `temp-${hhmm ?? 'none'}-${value}`,
    baseRevision,
    kind: 'temperature',
    status: 'obtained',
    value,
    value2: null,
    unit: '°C',
    method: 'rectal',
    eventTime: hhmm ? zoneTimeToIso(DATE, hhmm) : null,
    coolingPhase,
    sourceKind: 'manual',
    device: null,
    recordedBy: 'crew',
    note: null
  };
}

function heartRate(hhmm: string | null, value: number, baseRevision: number): MeasurementInput {
  return {
    requestId: `hr-${hhmm ?? 'none'}-${value}`,
    baseRevision,
    kind: 'heartRate',
    status: 'obtained',
    value,
    value2: null,
    unit: 'bpm',
    method: null,
    eventTime: hhmm ? zoneTimeToIso(DATE, hhmm) : null,
    coolingPhase: 'unknown',
    sourceKind: 'manual',
    device: null,
    recordedBy: 'crew',
    note: null
  };
}

const coolingEvent = (baseRevision: number): CareEventInput => ({
  requestId: 'care-cooling',
  baseRevision,
  category: 'cooling',
  action: 'Cold-water immersion',
  startedAt: zoneTimeToIso(DATE, '11:05'),
  endedAt: zoneTimeToIso(DATE, '11:15'),
  note: null,
  recordedBy: 'crew'
});

const panel = (incident: WorkspaceIncident) => renderToStaticMarkup(<ReassessmentPanel incident={incident} />);
const card = (incident: WorkspaceIncident, draft: HandoffDraft | null) =>
  renderToStaticMarkup(<HandoffCard incident={incident} draft={draft} draftError={null} onReview={() => undefined} />);

describe('ReassessmentPanel', () => {
  it('shows before/after cooling columns with method and time for two rectal temperatures', async () => {
    const { platform } = await matched();
    let incident = await platform.addMeasurement(rectalTemp('11:01', 41.2, 'before', 0));
    incident = await platform.addMeasurement(rectalTemp('11:20', 39.1, 'after', incident.revision));

    const html = panel(incident);
    expect(html).toContain('Before cooling');
    expect(html).toContain('After cooling');
    expect(html).toContain('rectal');
    expect(html).toContain('11:01');
    expect(html).toContain('11:20');
    expect(html).toContain('41.2 °C');
    expect(html).toContain('39.1 °C');
  });

  it('shows Time not documented for an undated reading', async () => {
    const { platform } = await matched();
    const incident = await platform.addMeasurement(heartRate(null, 120, 0));
    const html = panel(incident);
    expect(html).toContain('Heart rate');
    expect(html).toContain('Time not documented');
  });

  it('derives phase from documented cooling times when the reading is not marked', async () => {
    const { platform } = await matched();
    let incident = await platform.addCareEvent(coolingEvent(0));
    incident = await platform.addMeasurement(rectalTemp('11:01', 41.2, 'unknown', incident.revision));
    incident = await platform.addMeasurement(rectalTemp('11:20', 39.1, 'unknown', incident.revision));
    const html = panel(incident);
    expect(html).toContain('Before cooling');
    expect(html).toContain('After cooling');
    expect(html).toContain('from cooling times');
  });
});

describe('HandoffCard', () => {
  it('lists uncertainties from the draft', async () => {
    const { platform, incident } = await matched();
    const draft = await platform.getHandoffDraft(incident);
    const html = card(incident, draft);
    expect(html).toContain('Unresolved (');
    // The seeded record has no clinical temperature, so this uncertainty is always listed.
    expect(html).toContain('Clinical temperature');
    expect(html).toContain('Not documented');
    expect(html).toContain('Not yet approved');
  });

  it('shows Fresh review required after approve + a new observation', async () => {
    const { platform, incident } = await matched();
    const approved = await platform.approveHandoff({ revision: incident.revision, reviewedBy: 'Crew (demo)' });
    // A new observation advances the revision past the approved one.
    const added = await platform.addObservation({
      requestId: 'obs-after-approve',
      baseRevision: approved.revision,
      text: 'He is answering questions now.',
      observedAt: null,
      category: 'mental_status',
      inputMode: 'typed'
    });
    const incidentAfter = added.incident;
    const draft = await platform.getHandoffDraft(incidentAfter);
    const html = card(incidentAfter, draft);
    expect(html).toContain('Fresh review required');
    expect(html).toContain(`approved revision ${approved.revision}`);
    expect(html).toContain(`now ${incidentAfter.revision}`);
  });
});
