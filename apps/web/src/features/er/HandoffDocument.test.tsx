// Tests the receiving-view document and export helpers against a draft built from a realistic
// capture flow (suspected exertional heat stroke). Uses the development adapter with in-memory
// storage so the full mutation path runs, then renders with renderToStaticMarkup (no DOM needed).
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createDevPlatform, type DevStorage } from '../../platform/dev';
import { buildDraft } from '../../platform/draft';
import { normalizeIncident } from '../../platform/legacy';
import type { WorkspaceIncident } from '../../platform';
// Prefer the package import; fall back to the relative path if the workspace alias is unavailable.
import { createDemoIncident } from '../../../../../packages/fixtures/src/index';
import { HandoffDocument, handoffHtml, type HandoffMeta } from './HandoffDocument';
import { ErPage } from './ErPage';

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

/** Run the suspected-EHS capture flow and return the resulting incident. */
async function captureFlow(): Promise<{ platform: ReturnType<typeof makePlatform>; incident: WorkspaceIncident }> {
  const platform = makePlatform();
  await platform.setSharing(true);
  let incident = await platform.match('patient-demo-01');

  const obs = await platform.addObservation({
    requestId: 'r-obs-1', baseRevision: incident.revision,
    text: 'Friend says he went down about ten minutes ago on the trail.',
    observedAt: null, category: 'account', inputMode: 'typed'
  });
  incident = obs.incident;

  incident = await platform.addMeasurement({
    requestId: 'r-temp-1', baseRevision: incident.revision,
    kind: 'temperature', status: 'obtained', value: 40.6, value2: null, unit: '°C',
    method: 'rectal', eventTime: '2026-10-24T14:50:00Z', coolingPhase: 'before',
    sourceKind: 'manual', device: null, recordedBy: 'medic-1', note: null
  });

  incident = await platform.addCareEvent({
    requestId: 'r-care-1', baseRevision: incident.revision,
    category: 'cooling', action: 'Cold-water immersion started',
    startedAt: '2026-10-24T14:52:00Z', endedAt: null, note: null, recordedBy: 'medic-1'
  });

  incident = await platform.addMeasurement({
    requestId: 'r-temp-2', baseRevision: incident.revision,
    kind: 'temperature', status: 'obtained', value: 39.0, value2: null, unit: '°C',
    method: 'rectal', eventTime: '2026-10-24T15:05:00Z', coolingPhase: 'after',
    sourceKind: 'manual', device: null, recordedBy: 'medic-1', note: null
  });

  incident = await platform.addTimelineEvent({
    requestId: 'r-time-1', baseRevision: incident.revision,
    kind: 'collapse', time: null, certainty: 'unknown', note: 'Collapse not witnessed.'
  });

  return { platform, incident };
}

const DRAFT_META: HandoffMeta = { title: 'ER handoff — Trauma Llama', status: 'Draft — not crew approved' };

describe('HandoffDocument', () => {
  it('renders both temperature phases in chronological order with method and the collapse unknown', async () => {
    const { incident } = await captureFlow();
    const draft = buildDraft(incident);
    const html = renderToStaticMarkup(<HandoffDocument draft={draft} incident={incident} meta={DRAFT_META} />);

    expect(html).toContain('SYNTHETIC DEMO — NOT A REAL PATIENT');
    expect(html).toContain('ER handoff — Trauma Llama');
    expect(html).toContain('before cooling');
    expect(html).toContain('after cooling');
    // chronological: the 40.6 (before) reading must appear before the 39.0 (after) reading.
    expect(html.indexOf('before cooling')).toBeLessThan(html.indexOf('after cooling'));
    expect(html).toContain('rectal');
    // Collapse recorded with null time -> Unknown (timeline section item text).
    expect(html).toContain('Collapse: Unknown');
  });

  it('shows the DRAFT banner when not approved and CREW APPROVED when approved for this revision', async () => {
    const { incident } = await captureFlow();
    const draft = buildDraft(incident);

    const draftHtml = renderToStaticMarkup(<HandoffDocument draft={draft} incident={incident} meta={DRAFT_META} />);
    expect(draftHtml).toContain('DRAFT — NOT CREW APPROVED');
    expect(draftHtml).not.toContain('CREW APPROVED · revision');

    const approvedMeta: HandoffMeta = {
      title: 'ER handoff — Trauma Llama', status: 'Crew approved',
      approval: { approved: true, revision: draft.revision, at: '2026-10-24T15:10:00Z' }
    };
    const approvedHtml = renderToStaticMarkup(<HandoffDocument draft={draft} incident={incident} meta={approvedMeta} />);
    expect(approvedHtml).toContain(`CREW APPROVED · revision ${draft.revision}`);
    expect(approvedHtml).not.toContain('DRAFT — NOT CREW APPROVED');
  });

  it('renders an Unresolved box using "Not performed" for a not_obtained temperature', async () => {
    const platform = makePlatform();
    await platform.setSharing(true);
    let incident = await platform.match('patient-demo-01');
    // Record a temperature explicitly as not performed (status not_obtained).
    incident = await platform.addMeasurement({
      requestId: 'r-temp-np', baseRevision: incident.revision,
      kind: 'temperature', status: 'not_obtained', value: null, value2: null, unit: '°C',
      method: null, eventTime: null, coolingPhase: 'unknown',
      sourceKind: 'manual', device: null, recordedBy: 'medic-1', note: null
    });
    const draft = buildDraft(incident);
    // Sanity: the draft carries a not_obtained uncertainty for the clinical temperature.
    expect(draft.uncertainties.some(u => u.state === 'not_obtained')).toBe(true);

    const html = renderToStaticMarkup(<HandoffDocument draft={draft} incident={incident} meta={DRAFT_META} />);
    expect(html).toContain('Unresolved (');
    expect(html).toContain('Clinical temperature');
    expect(html).toContain('Not performed');
  });

  it('lists the attached sources in the legend and marks empty sections "Not documented"', async () => {
    const { incident } = await captureFlow();
    const draft = buildDraft(incident);
    const html = renderToStaticMarkup(<HandoffDocument draft={draft} incident={incident} meta={DRAFT_META} />);

    // Sources legend exists and contains at least one captured source entry.
    expect(html).toContain('<h2>Sources</h2>');
    expect(html).toContain('captured');
    expect(html).toContain('event time');
    // At least one source anchor is rendered for the legend.
    expect(html).toContain('id="hd-src-');
    // Empty sections render the "Not documented" marker.
    expect(html).toContain('Not documented');
    // The grouped-by-website notice (dev adapter produces website-grouped drafts).
    expect(html).toContain('Grouped by the website because the platform draft endpoint is unavailable.');
  });

  it('renders the signature lines and the non-clinical footer', async () => {
    const { incident } = await captureFlow();
    const draft = buildDraft(incident);
    const html = renderToStaticMarkup(<HandoffDocument draft={draft} incident={incident} meta={DRAFT_META} />);
    expect(html).toContain('Reviewed by ______');
    expect(html).toContain('Time ______');
    expect(html).toContain('Generated from a synthetic demonstration incident. Not for clinical use.');
  });

  it('produces a complete standalone HTML file', async () => {
    const { incident } = await captureFlow();
    const draft = buildDraft(incident);
    const file = handoffHtml({ draft, incident, meta: DRAFT_META });
    expect(file.startsWith('<!doctype html>')).toBe(true);
    expect(file).toContain('<meta charset="utf-8">');
    expect(file).toContain('<title>');
    expect(file).toContain('SYNTHETIC DEMO — NOT A REAL PATIENT');
  });
});

describe('ErPage', () => {
  it('shows the amendment notice once the incident revision moves past the reviewed handoff', async () => {
    const { platform, incident } = await captureFlow();
    const approved = await platform.approveHandoff({ revision: incident.revision, reviewedBy: 'medic-1' });

    // Immediately after approval, no amendment notice (revisions match).
    const beforeChange = renderToStaticMarkup(<ErPage incident={approved} />);
    expect(beforeChange).not.toContain('an amendment has not been shared yet');

    // New information recorded after the review bumps the revision.
    const after = (await platform.addObservation({
      requestId: 'r-obs-2', baseRevision: approved.revision,
      text: 'Still confused and not following commands.',
      observedAt: null, category: 'mental_status', inputMode: 'typed'
    })).incident;

    const afterHtml = renderToStaticMarkup(<ErPage incident={after} />);
    expect(after.handoffs.at(-1)!.revision).not.toBe(after.revision);
    expect(afterHtml).toContain('New information has been recorded since this version was reviewed; an amendment has not been shared yet.');
  });

  it('shows the calm empty state when no handoff has been shared', async () => {
    const { incident } = await captureFlow();
    const html = renderToStaticMarkup(<ErPage incident={incident} />);
    expect(html).toContain('No reviewed handoff has been shared yet.');
  });
});
