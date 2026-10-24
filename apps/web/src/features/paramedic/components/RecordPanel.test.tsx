import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createDemoIncident } from '@scenebrief/fixtures';
import { createDevPlatform, type DevStorage } from '../../../platform/dev';
import { normalizeIncident } from '../../../platform/legacy';
import { zoneTimeToIso } from '../../../platform/time';
import type { MeasurementInput, WorkspaceIncident } from '../../../platform';
import { RecordPanel } from './RecordPanel';
import { StatusSummary } from './StatusSummary';

/** In-memory storage so the development adapter keeps records without touching localStorage. */
function memoryStorage(): DevStorage {
  const map = new Map<string, string>();
  return {
    get: k => map.get(k) ?? null,
    set: (k, v) => void map.set(k, v),
    remove: k => void map.delete(k)
  };
}

function makePlatform() {
  return createDevPlatform({
    storage: memoryStorage(),
    seed: async () => normalizeIncident(createDemoIncident()),
    evaluationDelayMs: 0
  });
}

async function matched(platform = makePlatform()) {
  await platform.setSharing(true);
  const incident = await platform.match('patient-demo-01');
  return { platform, incident };
}

const DATE = '2026-10-24';

function tempInput(hhmm: string, value: number, coolingPhase: MeasurementInput['coolingPhase'], baseRevision: number): MeasurementInput {
  return {
    requestId: `temp-${hhmm}-${value}`,
    baseRevision,
    kind: 'temperature',
    status: 'obtained',
    value,
    value2: null,
    unit: '°C',
    method: 'rectal',
    eventTime: zoneTimeToIso(DATE, hhmm),
    coolingPhase,
    sourceKind: 'manual',
    device: null,
    recordedBy: 'crew',
    note: null
  };
}

const record = (incident: WorkspaceIncident) => renderToStaticMarkup(<RecordPanel incident={incident} />);
const status = (incident: WorkspaceIncident) => renderToStaticMarkup(<StatusSummary incident={incident} />);

describe('RecordPanel / StatusSummary', () => {
  it('shows Unknown collapse and the fixed caption with no crew data', async () => {
    const { incident } = await matched();
    const html = record(incident);
    expect(html).toContain('Collapse');
    expect(html).toContain('Unknown');
    expect(html).toContain('Discovery time and device fall events do not establish collapse time.');
  });

  it('StatusSummary states Not documented for mental status and temperature with no data', async () => {
    const { incident } = await matched();
    const html = status(incident);
    expect(html).toContain('Mental status');
    expect(html).toContain('Clinical temperature');
    expect(html).toContain('Not documented');
  });

  it('shows latest after-cooling temperature with before-cooling reference and chronological order', async () => {
    const { platform } = await matched();
    let incident = await platform.addMeasurement(tempInput('11:00', 40.6, 'before', 0));
    incident = await platform.addMeasurement(tempInput('11:20', 39.0, 'after', incident.revision));

    const summaryHtml = status(incident);
    expect(summaryHtml).toContain('39');
    expect(summaryHtml).toContain('after cooling');
    expect(summaryHtml).toContain('Before cooling: 40.6');

    const recordHtml = record(incident);
    const before = recordHtml.indexOf('40.6');
    const after = recordHtml.indexOf('39 °C');
    expect(before).toBeGreaterThanOrEqual(0);
    expect(after).toBeGreaterThan(before);
  });

  it('keeps a clarified observation visible with its tag', async () => {
    const { platform } = await matched();
    const added = await platform.addObservation({
      requestId: 'obs-sweat',
      baseRevision: 0,
      text: 'He is sweating, so this cannot be heat stroke.',
      observedAt: null,
      category: 'account',
      inputMode: 'typed'
    });
    let incident = added.incident;

    incident = await platform.evaluate({ requestId: 'eval-1', baseRevision: incident.revision });
    const feedback = incident.feedback.find(f => f.id.startsWith('dev-sweat-'));
    expect(feedback).toBeDefined();

    incident = await platform.resolveFeedback({
      requestId: 'resolve-1',
      baseRevision: incident.revision,
      feedbackId: feedback!.id,
      action: 'clarify',
      clarificationText: 'His skin is hot and he is confused; temperature not yet taken.'
    });

    const html = record(incident);
    expect(html).toContain('Clarified — kept for the record');
    expect(html).toContain('He is sweating, so this cannot be heat stroke.');
    expect(html).toContain('Clarified by:');
    expect(html).toContain('What changed');
  });

  it('shows the no-wearable message when wearable sources are removed', async () => {
    const { incident } = await matched();
    const stripped: WorkspaceIncident = {
      ...incident,
      sources: incident.sources.filter(s => s.type !== 'wearable'),
      measurements: incident.measurements.filter(m => m.sourceKind !== 'wearable')
    };
    const html = record(stripped);
    expect(html).toContain('No wearable data available for this patient. All other functions work without it.');
  });
});
