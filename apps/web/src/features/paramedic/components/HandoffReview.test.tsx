// Crew review view, rendered with renderToStaticMarkup inside the real IncidentProvider (pollMs very
// high so no polling fires). Interaction-level approval binding is covered in platform/approval.test.ts.
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { IncidentProvider, type HandoffDraft, type Incident, type Platform } from '../../../platform';
import { makePlatform, matched, obs, temp } from '../../../test-helpers';
import { HandoffReview } from './HandoffReview';

async function captureFlow() {
  const { platform, incident } = await matched();
  let inc = await platform.addObservation(obs(incident, 'Friend says he went down about ten minutes ago on the trail.', { category: 'account', reportedBy: 'witness' }));
  inc = await platform.addMeasurement(temp(inc, 40.6, '2026-10-24T14:58:00Z', 'before_cooling'));
  return { platform, incident: inc };
}

const render = (platform: Platform, incident: Incident, draft: HandoffDraft | null) => renderToStaticMarkup(
  <IncidentProvider platform={platform} pollMs={1e9}>
    <HandoffReview incident={incident} draft={draft} draftError={null} onBack={() => {}} />
  </IncidentProvider>
);

describe('HandoffReview', () => {
  it('renders the review checkbox with the platform unresolved count and a disabled approve button', async () => {
    const { platform, incident } = await captureFlow();
    const draft = await platform.getHandoffDraft();
    const html = render(platform, incident, draft);
    expect(html).toContain(`I reviewed the complete draft, including ${draft.uncertainties.length} unresolved items.`);
    const approveIdx = html.indexOf(`Approve reviewed handoff (rev ${draft.revision})`);
    expect(approveIdx).toBeGreaterThan(0);
    expect(html.slice(html.lastIndexOf('<button', approveIdx), approveIdx)).toContain('disabled');
    expect(html).toContain('Approval confirms review. It does not clinically verify reported information.');
  });

  it('shows "Crew approved" for the draft whose content was shared, with no approve button', async () => {
    const { platform, incident } = await captureFlow();
    const approved = await platform.approveHandoff({ revision: incident.revision, reviewedBy: 'Crew (demo)' });
    const html = render(platform, approved, await platform.getHandoffDraft());
    expect(html).toContain(`CREW APPROVED · revision ${approved.revision}`);
    expect(html).not.toContain('Approve reviewed handoff');
  });

  it('requires fresh review when a new observation follows approval', async () => {
    const { platform, incident } = await captureFlow();
    const approved = await platform.approveHandoff({ revision: incident.revision, reviewedBy: 'Crew (demo)' });
    const after = await platform.addObservation(obs(approved, 'Still confused and not following commands.', { category: 'neurological' }));
    const html = render(platform, after, await platform.getHandoffDraft());
    expect(html).toContain(`Fresh review required. The draft changed after version 1 was approved (approved revision ${approved.revision}, current draft revision ${after.revision}).`);
    expect(html).toContain('DRAFT — NOT CREW APPROVED');
  });

  it('a match after approval (same revision, more context) is not shown as approved', async () => {
    const { platform } = makePlatform();
    const inc = await platform.getIncident();
    const approved = await platform.approveHandoff({ revision: inc.revision, reviewedBy: 'Crew (demo)' });
    await platform.setSharing(true);
    const now = await platform.match('patient-demo-01');
    expect(now.revision).toBe(approved.revision);
    const html = render(platform, now, await platform.getHandoffDraft());
    expect(html).toContain('Fresh review required');
    expect(html).toContain('Approve reviewed handoff');
  });

  it('renders the document column and the draft-loading state', async () => {
    const { platform, incident } = await captureFlow();
    expect(render(platform, incident, null)).toContain('Loading draft…');
    const html = render(platform, incident, await platform.getHandoffDraft());
    expect(html).toContain('ER handoff — Trauma Llama');
    expect(html).toContain('Print handoff');
    expect(html).toContain('Back to workspace');
  });
});
