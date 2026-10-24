import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createDemoIncident } from '../../../../../packages/fixtures/src/index';
import { createDevPlatform, type DevStorage } from '../../platform/dev';
import { normalizeIncident } from '../../platform/legacy';
import { IncidentProvider, type Platform, type WorkspaceIncident } from '../../platform';
import { Workspace } from './Workspace';
import { nextStep, partitionObservations } from './model';

function setup() {
  const m = new Map<string, string>();
  const storage: DevStorage = { get: k => m.get(k) ?? null, set: (k, v) => void m.set(k, v), remove: k => void m.delete(k) };
  let n = 0;
  return createDevPlatform({ storage, seed: async () => normalizeIncident(createDemoIncident()), evaluationDelayMs: 0, uuid: () => `id-${++n}` });
}
const text = (p: Platform, incident: WorkspaceIncident) => renderToStaticMarkup(<IncidentProvider platform={p} pollMs={1e9}><Workspace incident={incident} /></IncidentProvider>)
  .replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').replace(/ ([.;,])/g, '$1');
const obs = (inc: WorkspaceIncident, requestId: string, t: string, category: 'account' | 'skin' | 'mental_status' | 'general' = 'general') =>
  ({ requestId, baseRevision: inc.revision, text: t, category, observedAt: null, inputMode: 'typed' as const });

describe('Trauma Llama EMT workspace', () => {
  it('unidentified patient: capture and handoff available; patient-linked wearable context hidden', async () => {
    const p = setup();
    const t = text(p, await p.getIncident());
    expect(t).toContain('Record observation');
    expect(t).toContain('Unidentified patient');
    expect(t).toContain('ER handoff');
    expect(t).not.toContain('Alex Morgan');
    expect(t).not.toContain('Synthetic fall fixture');
  });

  it('documents an unidentified patient end to end without matching', async () => {
    const p = setup();
    let inc = (await p.addObservation(obs(await p.getIncident(), 'a', 'Confused, answers slowly.', 'mental_status'))).incident;
    expect(inc.patient.matched).toBe(false);
    const draft = await p.getHandoffDraft(inc);
    inc = await p.approveHandoff({ revision: draft.revision, reviewedBy: 'Crew (demo)' });
    expect(inc.handoffs).toHaveLength(1);
    expect(inc.handoffs[0].text).not.toContain('Synthetic fall fixture');
  });

  it('matched: capture controls, demo example labeled, unknowns visible', async () => {
    const p = setup();
    await p.setSharing(true);
    const inc = await p.match('patient-demo-01');
    const t = text(p, inc);
    expect(t).toContain('Alex Morgan');
    expect(t).toContain('DEMO Load example transcript');
    expect(t).toContain('Not yet measured');
    expect(t).toMatch(/Collapse\s+Unknown/);
    expect(nextStep(inc).id).toBe('capture');
  });

  it('feedback sits under its observation; stale feedback shows both revisions and hides actions', async () => {
    const p = setup();
    let inc = (await p.addObservation(obs(await p.getIncident(), 'a', 'He is sweating, so this cannot be heat stroke.', 'skin'))).incident;
    inc = await p.evaluate({ requestId: 'e', baseRevision: inc.revision });
    let t = text(p, inc);
    expect(t).toContain('“He is sweating, so this cannot be heat stroke.” Assistant · about this observation');
    expect(t).toContain('Clarify');
    expect(t).toContain('Generated for revision 1.');
    inc = (await p.addObservation(obs(inc, 'b', 'Responds to voice.', 'mental_status'))).incident;
    expect(partitionObservations(inc).attention.map(o => o.text)).toContain('He is sweating, so this cannot be heat stroke.');
    t = text(p, inc);
    expect(t).toContain('It was generated for revision 1; the incident is now at revision 2.');
    expect(t).toContain('Re-check current revision');
    expect(t).not.toMatch(/>\s*Defer\s*</);
  });
});
