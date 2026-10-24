// Tests the crew review view. Rendered with renderToStaticMarkup inside the real IncidentProvider
// (pollMs set very high so no polling fires during the static render). The draft is built from the
// same capture flow used elsewhere so the uncertainty count is realistic.
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createDevPlatform, type DevStorage } from '../../../platform/dev';
import { buildDraft } from '../../../platform/draft';
import { normalizeIncident } from '../../../platform/legacy';
import { IncidentProvider, type HandoffDraft, type WorkspaceIncident } from '../../../platform';
import { createDemoIncident } from '../../../../../../packages/fixtures/src/index';
import { HandoffReview } from './HandoffReview';

function memoryStorage(): DevStorage {
  const map = new Map<string, string>();
  return {
    get: k => (map.has(k) ? map.get(k)! : null),
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

async function captureFlow(): Promise<{ platform: ReturnType<typeof makePlatform>; incident: WorkspaceIncident }> {
  const platform = makePlatform();
  await platform.setSharing(true);
  let incident = await platform.match('patient-demo-01');

  incident = (await platform.addObservation({
    requestId: 'r-obs-1', baseRevision: incident.revision,
    text: 'Friend says he went down about ten minutes ago on the trail.',
    observedAt: null, category: 'account', inputMode: 'typed'
  })).incident;

  incident = await platform.addMeasurement({
    requestId: 'r-temp-1', baseRevision: incident.revision,
    kind: 'temperature', status: 'obtained', value: 40.6, value2: null, unit: '°C',
    method: 'rectal', eventTime: '2026-10-24T14:50:00Z', coolingPhase: 'before',
    sourceKind: 'manual', device: null, recordedBy: 'medic-1', note: null
  });

  incident = await platform.addTimelineEvent({
    requestId: 'r-time-1', baseRevision: incident.revision,
    kind: 'collapse', time: null, certainty: 'unknown', note: 'Collapse not witnessed.'
  });

  return { platform, incident };
}

function render(platform: ReturnType<typeof makePlatform>, incident: WorkspaceIncident, draft: HandoffDraft | null) {
  return renderToStaticMarkup(
    <IncidentProvider platform={platform} pollMs={1e9}>
      <HandoffReview incident={incident} draft={draft} draftError={null} onBack={() => {}} />
    </IncidentProvider>
  );
}

describe('HandoffReview', () => {
  it('renders the review checkbox with the unresolved count and a disabled approve button', async () => {
    const { platform, incident } = await captureFlow();
    const draft = buildDraft(incident);
    const n = draft.uncertainties.length;
    expect(n).toBeGreaterThan(0);

    const html = render(platform, incident, draft);
    expect(html).toContain(`I reviewed the complete draft, including ${n} unresolved items.`);
    expect(html).toContain(`Approve reviewed handoff (rev ${draft.revision})`);
    // The approve button starts disabled (checkbox unchecked on a fresh render).
    expect(html).toMatch(/Approve reviewed handoff \(rev \d+\)<\/button>/);
    const approveIdx = html.indexOf('Approve reviewed handoff');
    const buttonStart = html.lastIndexOf('<button', approveIdx);
    expect(html.slice(buttonStart, approveIdx)).toContain('disabled');
    // Review-only disclaimer.
    expect(html).toContain('Approval confirms review. It does not clinically verify reported information.');
  });

  it('shows "Fresh review required" after approval when a new observation changes the incident', async () => {
    const { platform, incident } = await captureFlow();
    const draft = buildDraft(incident);

    // Crew approves the current revision (shares the handoff).
    const approved = await platform.approveHandoff({ revision: incident.revision, reviewedBy: 'Crew (demo)' });

    // A new observation is recorded after approval, moving the incident ahead of the shared handoff.
    const after = (await platform.addObservation({
      requestId: 'r-obs-2', baseRevision: approved.revision,
      text: 'Still confused and not following commands.',
      observedAt: null, category: 'mental_status', inputMode: 'typed'
    })).incident;

    // The stale draft (at the approved revision) is still what the view was showing.
    expect(after.handoffs.at(-1)!.revision).toBeLessThan(after.revision);
    const html = render(platform, after, draft);
    expect(html).toContain('Fresh review required. The incident changed after approval');
    expect(html).toContain(`approved revision ${after.handoffs.at(-1)!.revision}, now ${after.revision}`);
  });

  it('renders the document column and the draft-loading state', async () => {
    const { platform, incident } = await captureFlow();
    const loading = render(platform, incident, null);
    expect(loading).toContain('Loading draft…');

    const draft = buildDraft(incident);
    const withDoc = render(platform, incident, draft);
    expect(withDoc).toContain('ER handoff — Trauma Llama');
    expect(withDoc).toContain('Crew review');
    expect(withDoc).toContain('Print handoff');
    expect(withDoc).toContain('Back to workspace');
  });
});
