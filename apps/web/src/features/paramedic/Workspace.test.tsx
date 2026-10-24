import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ExampleStatements } from '@scenebrief/fixtures';
import { IncidentProvider, type Incident, type Platform } from '../../platform';
import { makePlatform, matched, obs, textOf } from '../../test-helpers';
import { Workspace } from './Workspace';
import { nextStep, partitionObservations } from './model';

const text = (p: Platform, incident: Incident) => textOf(renderToStaticMarkup(<IncidentProvider platform={p} pollMs={1e9}><Workspace incident={incident} /></IncidentProvider>));

describe('Trauma Llama EMT workspace', () => {
  it('unidentified patient: capture and handoff available; patient-linked context hidden', async () => {
    const { platform } = makePlatform();
    const t = text(platform, await platform.getIncident());
    expect(t).toContain('Record observation');
    expect(t).toContain('Unidentified patient');
    expect(t).toContain('ER handoff');
    expect(t).not.toContain('Alex Morgan');
    expect(t).not.toContain('Device-reported fall at 10:42');
  });

  it('documents an unidentified patient end to end without matching', async () => {
    const { platform } = makePlatform();
    let inc = await platform.addObservation(obs(await platform.getIncident(), 'Confused, answers slowly.', { category: 'neurological' }));
    expect(inc.patient.matched).toBe(false);
    const draft = await platform.getHandoffDraft();
    inc = await platform.approveHandoff({ revision: draft.revision, reviewedBy: 'Crew (demo)' });
    expect(inc.handoffs).toHaveLength(1);
    expect(inc.handoffs[0].patientMatched).toBe(false);
    expect(inc.handoffs[0].text).toContain('Patient association not confirmed');
    expect(inc.handoffs[0].text).not.toContain('Device-reported fall at 10:42');
  });

  it('matched: profile visible, demo example labeled, unknowns visible', async () => {
    const { platform, incident } = await matched();
    const t = text(platform, incident);
    expect(t).toContain('Alex Morgan');
    expect(t).toContain('DEMO Load example transcript');
    expect(t).toContain('Not yet measured');
    expect(t).toMatch(/Collapse\s+Unknown/);
    expect(nextStep(incident).id).toBe('capture');
  });

  it('feedback sits under its observation with the mock label; a later change marks it as behind but keeps it resolvable', async () => {
    const { platform } = makePlatform();
    let inc = await platform.addObservation(obs(await platform.getIncident(), ExampleStatements.sweatingInference, { category: 'skin' }));
    inc = await platform.evaluate({ requestId: 'e', baseRevision: inc.revision });
    let t = text(platform, inc);
    expect(t).toContain(`“${ExampleStatements.sweatingInference}” Assistant · about this observation`);
    expect(t).toContain('Mock assistant · fixture replay');
    expect(t).toContain('Clarify');
    expect(t).toContain(`Generated for revision ${inc.revision}.`);
    const evaluated = inc.revision;
    inc = await platform.addObservation(obs(inc, 'Responds to voice.', { category: 'neurological' }));
    expect(partitionObservations(inc).attention.map(o => o.text)).toContain(ExampleStatements.sweatingInference);
    t = text(platform, inc);
    expect(t).toContain(`Generated for revision ${evaluated}; the record is now at revision ${inc.revision}.`);
    expect(t).toMatch(/>?\s*Defer\s*/);
  });

  it('after clarification, the original is kept (superseded) and the clarification is shown beside it', async () => {
    const { platform } = makePlatform();
    let inc = await platform.addObservation(obs(await platform.getIncident(), ExampleStatements.witnessAccount, { category: 'account', reportedBy: 'witness' }));
    inc = await platform.evaluate({ requestId: 'e', baseRevision: inc.revision });
    const f = inc.feedback.at(-1)!;
    inc = await platform.resolveFeedback({ feedbackId: f.id, requestId: 'c', baseRevision: inc.revision, action: 'clarify', clarificationText: 'Found him at 10:43. Did not see him collapse.' });
    const t = text(platform, inc);
    expect(t).toContain('Original statement — kept in record');
    expect(t).toContain('Superseded — kept in record');
    expect(t).toContain('“Found him at 10:43. Did not see him collapse.”');
  });
});
