import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { HandoffDraft, Incident } from '../../../platform';
import { cooling, hr, matched, obs, temp } from '../../../test-helpers';
import { zoneTimeToIso } from '../../../platform/time';
import { ReassessmentPanel } from './ReassessmentPanel';
import { HandoffCard } from './HandoffCard';

const at = (hhmm: string) => zoneTimeToIso('2026-10-24', hhmm);
const panel = (incident: Incident) => renderToStaticMarkup(<ReassessmentPanel incident={incident} />);
const card = (incident: Incident, draft: HandoffDraft) => renderToStaticMarkup(<HandoffCard incident={incident} draft={draft} draftError={null} onReview={() => undefined} />);

describe('ReassessmentPanel', () => {
  it('shows before/after cooling columns with site and time for two rectal temperatures', async () => {
    const { platform, incident } = await matched();
    let inc = await platform.addMeasurement(temp(incident, 41.2, at('11:01'), 'before_cooling'));
    inc = await platform.addMeasurement(temp(inc, 39.1, at('11:20'), 'after_cooling'));
    const html = panel(inc);
    expect(html).toContain('Before cooling');
    expect(html).toContain('After cooling');
    expect(html).toContain('Rectal');
    expect(html).toContain('11:01');
    expect(html).toContain('11:20');
    expect(html).toContain('41.2 °C');
    expect(html).toContain('39.1 °C');
  });

  it('shows the fixture heart rate and "Time unknown" for an undated reading', async () => {
    const { platform, incident } = await matched();
    const inc = await platform.addMeasurement(hr(incident, 120, null));
    const html = panel(inc);
    expect(html).toContain('Heart rate');
    expect(html).toContain('140 bpm');
    expect(html).toContain('Time unknown');
  });

  it('derives phase from documented cooling times when the reading is not marked', async () => {
    const { platform, incident } = await matched();
    let inc = await platform.addCareEvent(cooling(incident, at('11:05'), at('11:15')));
    inc = await platform.addMeasurement(temp(inc, 41.2, at('11:01'), 'unknown'));
    inc = await platform.addMeasurement(temp(inc, 39.1, at('11:20'), 'unknown'));
    const html = panel(inc);
    expect(html).toContain('Before cooling');
    expect(html).toContain('After cooling');
    expect(html).toContain('from cooling times');
    expect(html).toContain('Cold-water immersion');
  });
});

describe('HandoffCard', () => {
  it('lists uncertainties from the platform draft', async () => {
    const { platform, incident } = await matched();
    const draft = await platform.getHandoffDraft();
    const html = card(incident, draft);
    expect(html).toContain(`Unresolved (${draft.uncertainties.length})`);
    expect(html).toContain('Clinical body temperature');
    expect(html).toContain('Not documented');
    expect(html).toContain('Not yet approved');
  });

  it('shows the approved version, then Fresh review required after a new observation', async () => {
    const { platform, incident } = await matched();
    const approved = await platform.approveHandoff({ revision: incident.revision, reviewedBy: 'Crew (demo)' });
    expect(card(approved, await platform.getHandoffDraft())).toContain(`Crew approved · version 1 · revision ${approved.revision}`);
    const after = await platform.addObservation(obs(approved, 'He is answering questions now.', { category: 'neurological' }));
    const html = card(after, await platform.getHandoffDraft());
    expect(html).toContain('Fresh review required');
    expect(html).toContain(`approved at revision ${approved.revision}; draft is now revision ${after.revision}`);
  });
});
