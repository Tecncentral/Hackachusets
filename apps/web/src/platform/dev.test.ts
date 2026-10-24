// Behaviour tests for the opt-in development adapter (dev.ts). It wraps the platform's own
// IncidentStore, so these tests check the wiring and the website-visible outcomes: error mapping to
// PlatformError, unidentified documentation, the labeled mock assistant, assistant unavailability,
// clarification and handoff versioning.
import { describe, expect, it } from 'vitest';
import { ExampleStatements } from '@scenebrief/fixtures';
import { PlatformError } from './boundary';
import { cooling, makePlatform, matched, obs, temp } from '../test-helpers';

describe('dev adapter — wiring and errors', () => {
  it('documents an unidentified patient: saving does not require a confirmed match', async () => {
    const { platform } = makePlatform();
    const inc = await platform.addObservation(obs(await platform.getIncident(), 'Confused; answers slowly.', { category: 'neurological' }));
    expect(inc.patient.matched).toBe(false);
    expect(inc.revision).toBe(1);
    const added = inc.observations.at(-1)!;
    expect(added).toMatchObject({ status: 'current', category: 'neurological', addedAtRevision: 1 });
    expect(inc.sources.find(s => s.id === added.sourceIds[0])).toMatchObject({ type: 'crew', origin: 'crew_entry' });
  });

  it('is idempotent for the same requestId and body; a different body is a conflict', async () => {
    const { platform } = makePlatform();
    const body = obs(await platform.getIncident(), 'Responds to voice.');
    const a = await platform.addObservation(body);
    const b = await platform.addObservation(body);
    expect(b.revision).toBe(a.revision);
    expect(b.observations).toHaveLength(a.observations.length);
    await expect(platform.addObservation({ ...body, text: 'Different.' })).rejects.toMatchObject({ kind: 'conflict', status: 409 });
  });

  it('maps a contract violation to PlatformError "invalid" with the platform message', async () => {
    const { platform } = makePlatform();
    const inc = await platform.getIncident();
    const e = await platform.addMeasurement(temp(inc, 104, null, 'unknown')).catch(x => x);
    expect(e).toBeInstanceOf(PlatformError);
    expect(e.kind).toBe('invalid');
    expect(e.message).toMatch(/plausible range/);
  });

  it('rejects a future baseRevision for appends, but accepts an older one (documentation is never blocked)', async () => {
    const { platform } = makePlatform();
    const inc = await platform.addObservation(obs(await platform.getIncident(), 'First.'));
    await expect(platform.addObservation(obs(inc, 'Ahead.', { baseRevision: inc.revision + 1 }))).rejects.toMatchObject({ kind: 'conflict' });
    const older = await platform.addObservation(obs(inc, 'Based on revision 0.', { baseRevision: 0 }));
    expect(older.revision).toBe(2);
  });

  it('matching requires sharing (403 → forbidden) and the canonical patient code', async () => {
    const { platform } = makePlatform();
    await expect(platform.match('patient-demo-01')).rejects.toMatchObject({ kind: 'forbidden' });
    await platform.setSharing(true);
    await expect(platform.match('someone-else')).rejects.toMatchObject({ kind: 'conflict' });
    expect((await platform.match('patient-demo-01')).patient.matched).toBe(true);
  });
});

describe('dev adapter — assistant', () => {
  it('stores labeled mock feedback for the example statements, carrying the evaluated revision', async () => {
    const { platform } = await matched();
    let inc = await platform.addObservation(obs(await platform.getIncident(), ExampleStatements.sweatingInference, { category: 'skin' }));
    inc = await platform.evaluate({ requestId: 'e1', baseRevision: inc.revision });
    const f = inc.feedback.at(-1)!;
    expect(f).toMatchObject({ kind: 'unsupported_inference', mode: 'mock', status: 'open', revision: inc.revision });
    expect(f.knowledgeReferenceIds.every(id => inc.knowledgeReferences.some(k => k.id === id))).toBe(true);
    expect(inc.evaluations.at(-1)).toMatchObject({ requestId: 'e1', status: 'completed' });
  });

  it('produces no feedback for a bare "Patient is sweating."', async () => {
    const { platform } = makePlatform();
    let inc = await platform.addObservation(obs(await platform.getIncident(), 'Patient is sweating.'));
    inc = await platform.evaluate({ requestId: 'e', baseRevision: inc.revision });
    expect(inc.feedback).toHaveLength(0);
  });

  it('records an "unavailable" evaluation when the assistant is off; capture and handoff still work', async () => {
    const { platform } = makePlatform();
    expect((await platform.setAssistantEnabled(false)).effectiveMode).toBe('unavailable');
    let inc = await platform.addObservation(obs(await platform.getIncident(), ExampleStatements.sweatingInference));
    inc = await platform.evaluate({ requestId: 'e', baseRevision: inc.revision });
    expect(inc.evaluations.at(-1)).toMatchObject({ status: 'unavailable', mode: 'unavailable' });
    expect(inc.feedback).toHaveLength(0);
    inc = await platform.addMeasurement(temp(inc, 41.2, '2026-10-24T15:02:00Z', 'before_cooling'));
    const approved = await platform.approveHandoff({ revision: inc.revision, reviewedBy: 'Crew (demo)' });
    expect(approved.handoffs).toHaveLength(1);
  });

  it('rejects evaluating a revision that is no longer current', async () => {
    const { platform } = makePlatform();
    const inc = await platform.addObservation(obs(await platform.getIncident(), 'One.'));
    await expect(platform.evaluate({ requestId: 'e', baseRevision: 0 })).rejects.toMatchObject({ kind: 'conflict' });
    expect(inc.evaluations).toHaveLength(0);
  });
});

describe('dev adapter — resolutions', () => {
  async function withFeedback() {
    const { platform } = await matched();
    let inc = await platform.addObservation(obs(await platform.getIncident(), ExampleStatements.witnessAccount, { category: 'account', reportedBy: 'witness' }));
    inc = await platform.evaluate({ requestId: 'e', baseRevision: inc.revision });
    return { platform, inc, f: inc.feedback.at(-1)! };
  }

  it('clarify stores the crew wording as a new observation, supersedes the original, records a correction', async () => {
    const { platform, inc, f } = await withFeedback();
    await expect(platform.resolveFeedback({ feedbackId: f.id, requestId: 'r0', baseRevision: inc.revision, action: 'clarify' })).rejects.toMatchObject({ kind: 'invalid' });
    const after = await platform.resolveFeedback({ feedbackId: f.id, requestId: 'r1', baseRevision: inc.revision, action: 'clarify', clarificationText: 'Found him at 10:43. Did not see the collapse.' });
    expect(after.revision).toBe(inc.revision + 1);
    const original = after.observations.find(o => o.id === f.observationIds[0])!;
    const replacement = after.observations.find(o => o.clarifiesFeedbackId === f.id)!;
    expect(original.status).toBe('superseded');
    expect(replacement).toMatchObject({ status: 'current', text: 'Found him at 10:43. Did not see the collapse.', reportedBy: 'witness' });
    expect(after.corrections.at(-1)).toMatchObject({ targetType: 'observation', originalId: original.id, replacementId: replacement.id, feedbackId: f.id });
    expect(after.feedback.find(x => x.id === f.id)!.status).toBe('clarified');
    await expect(platform.resolveFeedback({ feedbackId: f.id, requestId: 'r2', baseRevision: after.revision, action: 'dismiss' })).rejects.toMatchObject({ kind: 'conflict' });
  });

  it('dismiss and defer record a resolution without bumping the revision', async () => {
    const { platform, inc, f } = await withFeedback();
    const deferred = await platform.resolveFeedback({ feedbackId: f.id, requestId: 'd', baseRevision: inc.revision, action: 'defer' });
    expect(deferred.revision).toBe(inc.revision);
    expect(deferred.feedback.find(x => x.id === f.id)!.status).toBe('deferred');
    const dismissed = await platform.resolveFeedback({ feedbackId: f.id, requestId: 'x', baseRevision: inc.revision, action: 'dismiss', note: 'Already asked.' });
    expect(dismissed.resolutions.at(-1)).toMatchObject({ action: 'dismiss', note: 'Already asked.', resolvedBy: 'crew' });
  });
});

describe('dev adapter — handoff', () => {
  it('approving the same revision twice yields one version; later data yields an amendment, v1 unchanged', async () => {
    const { platform } = makePlatform();
    let inc = await platform.getIncident();
    inc = await platform.approveHandoff({ revision: inc.revision, reviewedBy: 'Crew (demo)' });
    inc = await platform.approveHandoff({ revision: inc.revision, reviewedBy: 'Crew (demo)' });
    expect(inc.handoffs).toHaveLength(1);
    const v1 = structuredClone(inc.handoffs[0]);
    inc = await platform.addCareEvent(cooling(inc, '2026-10-24T15:03:00Z'));
    await expect(platform.approveHandoff({ revision: inc.revision - 1, reviewedBy: 'Crew (demo)' })).rejects.toMatchObject({ kind: 'conflict' });
    inc = await platform.approveHandoff({ revision: inc.revision, reviewedBy: 'Crew (demo)' });
    expect(inc.handoffs).toHaveLength(2);
    expect(inc.handoffs[0]).toEqual(v1);
    expect(inc.handoffs[1]).toMatchObject({ kind: 'amendment', amendsVersion: 1 });
  });

  it('the unmatched draft excludes profile and wearable context', async () => {
    const { platform } = makePlatform();
    const draft = await platform.getHandoffDraft();
    expect(draft.patientMatched).toBe(false);
    expect(draft.text).not.toContain('Device-reported fall at 10:42');
    expect(draft.sourceIds).not.toContain('profile');
  });
});
