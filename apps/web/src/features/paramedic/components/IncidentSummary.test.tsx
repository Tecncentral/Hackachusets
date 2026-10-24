import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createDemoIncident } from '@scenebrief/fixtures';
import { createDevPlatform, type DevStorage } from '../../../platform/dev';
import { normalizeIncident } from '../../../platform/legacy';
import { zoneTimeToIso } from '../../../platform/time';
import { patientScoped, type MeasurementInput, type WorkspaceIncident } from '../../../platform';
import { IncidentProvider } from '../../../platform';
import type { Platform } from '../../../platform';
import { IncidentSummary } from './IncidentSummary';

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

/** Seed the adapter (match requires sharing first) and return a matched incident. */
async function matched(platform = makePlatform()) {
  await platform.setSharing(true);
  const incident = await platform.match('patient-demo-01');
  return { platform, incident };
}

const DATE = '2026-10-24';

function tempInput(overrides: Partial<MeasurementInput> = {}): MeasurementInput {
  return {
    requestId: `temp-${Math.random()}`,
    baseRevision: 0,
    kind: 'temperature',
    status: 'obtained',
    value: 41.2,
    value2: null,
    unit: '°C',
    method: 'rectal',
    eventTime: zoneTimeToIso(DATE, '14:20'),
    coolingPhase: 'before',
    sourceKind: 'manual',
    device: null,
    recordedBy: 'crew',
    note: null,
    ...overrides
  };
}

// IncidentSummary uses hooks (PatientMatch's useAction/useIncidentState) that require a provider.
function render(platform: Platform, incident: WorkspaceIncident) {
  return renderToStaticMarkup(
    <IncidentProvider platform={platform}>
      <IncidentSummary incident={incident} />
    </IncidentProvider>
  );
}

describe('IncidentSummary', () => {
  it('shows “Unidentified patient” and hides wearable background when unmatched', async () => {
    const platform = makePlatform();
    const incident = await platform.getIncident();
    const html = render(platform, patientScoped(incident));
    expect(html).toContain('Unidentified patient');
    expect(html).toContain('Identify patient (optional)');
    // No wearable sources are visible to an unmatched patient, so the toggle is not rendered.
    expect(html).not.toContain('Wearable background (optional)');
    expect(html).toContain('No wearable data — not needed for documentation.');
  });

  it('shows the wearable background toggle once the patient is matched', async () => {
    const { platform, incident } = await matched();
    const html = render(platform, patientScoped(incident));
    expect(html).toContain('Wearable background (optional)');
    expect(html).not.toContain('No wearable data — not needed for documentation.');
  });

  it('renders the Collapse row as Unknown with the fixed caption', async () => {
    const { platform, incident } = await matched();
    const html = render(platform, incident);
    expect(html).toContain('Collapse');
    expect(html).toContain('Unknown');
    expect(html).toContain('Discovery time and device fall events do not establish collapse time.');
  });

  it('states “Not yet measured” when no clinical temperature exists', async () => {
    const { platform, incident } = await matched();
    const html = render(platform, incident);
    expect(html).toContain('Not yet measured');
    expect(html).toContain('A wearable skin reading is not a core temperature.');
  });

  it('flags a clinical temperature whose method is not documented', async () => {
    const { platform } = await matched();
    const incident = await platform.addMeasurement(tempInput({ method: null }));
    const html = render(platform, incident);
    expect(html).toContain('41.2');
    expect(html).toContain('Method not documented');
  });

  it('shows “Not performed” for a temperature recorded as not obtained', async () => {
    const { platform } = await matched();
    const incident = await platform.addMeasurement(tempInput({ status: 'not_obtained', value: null }));
    const html = render(platform, incident);
    expect(html).toContain('Not performed');
    expect(html).not.toContain('Not yet measured');
  });
});
