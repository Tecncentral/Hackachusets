// HandoffDocument renders the platform's canonical handoff (draft or reviewed version); ErPage shows
// only crew-reviewed versions. Records come from the platform store via the development adapter.
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { cooling, makePlatform, matched, obs, temp, time } from '../../test-helpers';
import { HandoffDocument, handoffHtml, type HandoffMeta } from './HandoffDocument';
import { ErPage } from './ErPage';

async function captureFlow() {
  const { platform } = await matched();
  let inc = await platform.getIncident();
  inc = await platform.addObservation(obs(inc, 'Friend says he went down about ten minutes ago on the trail.', { category: 'account', reportedBy: 'witness' }));
  inc = await platform.addMeasurement(temp(inc, 40.6, '2026-10-24T14:58:00Z', 'before_cooling'));
  inc = await platform.addCareEvent(cooling(inc, '2026-10-24T15:00:00Z', '2026-10-24T15:15:00Z'));
  inc = await platform.addMeasurement(temp(inc, 39.0, '2026-10-24T15:20:00Z', 'after_cooling'));
  inc = await platform.addTimelineEvent(time(inc, 'collapse', null, { note: 'Collapse not witnessed.' }));
  return { platform, incident: inc, draft: await platform.getHandoffDraft() };
}

const DRAFT_META: HandoffMeta = { title: 'ER handoff — Trauma Llama', status: 'Draft — not crew approved' };
const doc = (props: Parameters<typeof HandoffDocument>[0]) => renderToStaticMarkup(<HandoffDocument {...props} />);

describe('HandoffDocument', () => {
  it('renders the platform sections: both temperatures in order with site and phase, collapse unknown', async () => {
    const { incident, draft } = await captureFlow();
    const html = doc({ doc: draft, incidentId: incident.id, sources: incident.sources, meta: DRAFT_META });
    expect(html).toContain('SYNTHETIC DEMO — NOT A REAL PATIENT');
    expect(draft.sections.every(s => html.includes(s.title))).toBe(true);
    expect(html).toContain('Body temperature 40.6 °C — rectal');
    expect(html.indexOf('40.6 °C')).toBeLessThan(html.indexOf('39 °C'));
    expect(html).toContain('before cooling started');
    expect(html).toContain('after cooling stopped');
    expect(html).toMatch(/Time unknown — Collapse \(unknown; witness\)/);
    expect(html).toContain('Patient association confirmed');
  });

  it('shows the DRAFT banner when not approved and CREW APPROVED when approved for this revision', async () => {
    const { incident, draft } = await captureFlow();
    expect(doc({ doc: draft, incidentId: incident.id, sources: incident.sources, meta: DRAFT_META })).toContain('DRAFT — NOT CREW APPROVED');
    const approved = doc({ doc: draft, incidentId: incident.id, sources: incident.sources, meta: { ...DRAFT_META, approval: { approved: true, revision: draft.revision, at: '2026-10-24T15:10:00Z' } } });
    expect(approved).toContain(`CREW APPROVED · revision ${draft.revision}`);
    expect(approved).not.toContain('DRAFT — NOT CREW APPROVED');
  });

  it('lists every platform uncertainty in the Unresolved box with its state in words', async () => {
    const { platform } = makePlatform();
    const draft = await platform.getHandoffDraft();
    const inc = await platform.getIncident();
    const html = doc({ doc: draft, incidentId: inc.id, sources: inc.sources, meta: DRAFT_META });
    expect(html).toContain(`Unresolved (${draft.uncertainties.length})`);
    expect(html).toContain('Clinical body temperature');
    expect(html).toContain('Not documented');
    expect(html).toContain('[not documented]');
  });

  it('lists attached sources with event time, capture time and limitation', async () => {
    const { incident, draft } = await captureFlow();
    const html = doc({ doc: draft, incidentId: incident.id, sources: incident.sources, meta: DRAFT_META });
    expect(html).toContain('<h2>Sources</h2>');
    expect(html).toContain('event time');
    expect(html).toContain('captured');
    expect(html).toContain('id="hd-src-');
    expect(html).toContain('Self-reported and not verified on scene.');
  });

  it('renders the signature lines, the non-clinical footer and a standalone HTML file', async () => {
    const { incident, draft } = await captureFlow();
    const html = doc({ doc: draft, incidentId: incident.id, sources: incident.sources, meta: DRAFT_META });
    expect(html).toContain('Reviewed by ______');
    expect(html).toContain('Generated from a synthetic demonstration incident. Not for clinical use.');
    const file = handoffHtml({ doc: draft, incidentId: incident.id, sources: incident.sources, meta: DRAFT_META });
    expect(file.startsWith('<!doctype html>')).toBe(true);
    expect(file).toContain('<meta charset="utf-8">');
  });
});

describe('ErPage', () => {
  it('renders the reviewed snapshot (same sections as the approved draft) and an amendment notice after new data', async () => {
    const { platform, incident, draft } = await captureFlow();
    const approved = await platform.approveHandoff({ revision: incident.revision, reviewedBy: 'medic-1' });
    expect(approved.handoffs[0].sections).toEqual(draft.sections);
    const before = renderToStaticMarkup(<ErPage incident={approved} />);
    expect(before).toContain(`CREW APPROVED · revision ${draft.revision}`);
    expect(before).not.toContain('an amendment has not been shared yet');

    const after = await platform.addObservation(obs(approved, 'Still confused and not following commands.', { category: 'neurological' }));
    const afterHtml = renderToStaticMarkup(<ErPage incident={after} />);
    expect(afterHtml).toContain('New information has been recorded since this version was reviewed; an amendment has not been shared yet.');
    // The receiving view still shows the reviewed version, not the newer record.
    expect(afterHtml).not.toContain('Still confused and not following commands.');
  });

  it('shows the calm empty state when no handoff has been shared', async () => {
    const { incident } = await captureFlow();
    expect(renderToStaticMarkup(<ErPage incident={incident} />)).toContain('No reviewed handoff has been shared yet.');
  });
});
