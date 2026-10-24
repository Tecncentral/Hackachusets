import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createDemoIncident } from '../../../../../packages/fixtures/src/index';
import { createDevPlatform, type DevStorage } from '../../platform/dev';
import { normalizeIncident } from '../../platform/legacy';
import { IncidentProvider, type Platform, type WorkspaceIncident } from '../../platform';
import { Workspace } from './Workspace';
import { nextStep } from './model';

function setup() {
  const m = new Map<string, string>();
  const storage: DevStorage = { get: k => m.get(k) ?? null, set: (k, v) => void m.set(k, v), remove: k => void m.delete(k) };
  let n = 0;
  return createDevPlatform({ storage, seed: async () => normalizeIncident(createDemoIncident()), evaluationDelayMs: 0, uuid: () => `id-${++n}` });
}
const text = (p: Platform, incident: WorkspaceIncident) => renderToStaticMarkup(<IncidentProvider platform={p} pollMs={1e9}><Workspace incident={incident} /></IncidentProvider>)
  .replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');

describe('EMT workspace', () => {
  it('hides patient context and capture until the crew confirms the match', async () => {
    const p = setup();
    const t = text(p, await p.getIncident());
    expect(t).toContain('Patient not matched');
    expect(t).toContain('Emergency sharing is off');
    expect(t).not.toContain('Alex Morgan');
    expect(t).not.toContain('Record voice note');
  });

  it('matched: voice control, examples labeled as not recordings, unknowns visible, one next step', async () => {
    const p = setup();
    await p.setSharing(true);
    const inc = await p.match('patient-demo-01');
    const t = text(p, inc);
    expect(t).toContain('Record voice note');
    expect(t).toContain('Example transcripts (for testing — not recordings)');
    expect(t).toContain('Collapse time: Unknown');
    expect(t).toContain('Clinical temperature: Not documented');
    expect(nextStep(inc).id).toBe('capture');
  });

  it('marks open feedback stale after a new observation and steers to feedback review', async () => {
    const p = setup();
    await p.setSharing(true);
    let inc = await p.match('patient-demo-01');
    inc = (await p.addObservation({ requestId: 'a', baseRevision: inc.revision, text: 'He is sweating, so this cannot be heat stroke.', category: 'skin', observedAt: null, inputMode: 'typed' })).incident;
    inc = await p.evaluate({ requestId: 'e', baseRevision: inc.revision });
    expect(nextStep(inc).id).toBe('feedback');
    expect(text(p, inc)).not.toContain('Stale');
    inc = (await p.addObservation({ requestId: 'b', baseRevision: inc.revision, text: 'Confused, answers slowly.', category: 'mental_status', observedAt: null, inputMode: 'typed' })).incident;
    const t = text(p, inc);
    expect(t).toContain('Stale — record changed since revision 1');
    expect(t).toContain('Sweating does not exclude exertional heat stroke');
    expect(t).toContain('Evidence (0) and references (1)'); // reference detail is behind progressive disclosure
  });
});
