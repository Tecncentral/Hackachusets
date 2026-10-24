// Behaviour tests for the opt-in development adapter (dev.ts). The adapter implements the Platform
// interface in the browser, seeded from the synthetic fixture and persisted to an injected storage.
// These tests exercise the real idempotency/revision guard, the deterministic evaluate stub, late-
// evaluation rejection, feedback resolution, and handoff approval/versioning.
import { beforeEach, describe, expect, it } from 'vitest';
import { createDevPlatform, setDevAssistantEnabled, type DevStorage } from './dev';
import { normalizeIncident } from './legacy';
import type { ObservationInput, WorkspaceIncident } from './boundary';
// '@scenebrief/fixtures' is the canonical import; the relative fallback keeps the test runnable
// from the worktree if the workspace alias is unavailable.
import { createDemoIncident } from '@scenebrief/fixtures';
import { IncidentStore } from '../../../api/src/store';
import { DemoInitial, DemoClarification } from '@scenebrief/contracts';
import { clock } from './time';

function memStorage(): DevStorage {
  const map = new Map<string, string>();
  return { get: k => map.get(k) ?? null, set: (k, v) => { map.set(k, v); }, remove: k => { map.delete(k); } };
}

let counter = 0;
const counterUuid = () => `uuid-${++counter}`;
const seed = async (): Promise<WorkspaceIncident> => normalizeIncident(createDemoIncident());

function make(evaluationDelayMs = 0, storage: DevStorage = memStorage()) {
  const platform = createDevPlatform({ storage, seed, evaluationDelayMs, uuid: counterUuid, now: () => '2026-10-24T15:00:00Z' });
  return { platform, storage };
}

/** Enable sharing and confirm the patient so mutations are permitted; returns the matched incident. */
async function ready(platform = make().platform) {
  await platform.setSharing(true);
  return platform.match('patient-demo-01');
}

const obsInput = (over: Partial<ObservationInput> = {}): ObservationInput => ({
  requestId: 'req-1', baseRevision: 0, text: 'Patient is confused.', observedAt: null,
  category: 'mental_status', inputMode: 'typed', ...over
});

beforeEach(() => { counter = 0; });

describe('dev adapter — mutation guard', () => {
  it('rejects mutations with "forbidden" before the patient is matched', async () => {
    const { platform } = make();
    await expect(platform.addObservation(obsInput())).rejects.toMatchObject({ kind: 'forbidden' });
  });

  it('persists an observation with a new source and bumps the revision', async () => {
    const { platform } = make();
    await ready(platform);
    const { incident } = await platform.addObservation(obsInput());
    expect(incident.revision).toBe(1);
    const obs = incident.observations.find(o => o.text === 'Patient is confused.');
    expect(obs).toBeDefined();
    const src = incident.sources.find(s => s.id === obs!.sourceId);
    expect(src).toBeDefined();
    expect(src!.text).toBe('Patient is confused.');
  });

  it('is idempotent for the same requestId and identical body (no duplicate, same revision)', async () => {
    const { platform } = make();
    await ready(platform);
    const first = await platform.addObservation(obsInput());
    const second = await platform.addObservation(obsInput());
    expect(second.incident.revision).toBe(first.incident.revision);
    expect(second.incident.observations.filter(o => o.text === 'Patient is confused.')).toHaveLength(1);
  });

  it('rejects the same requestId with a different body as a conflict', async () => {
    const { platform } = make();
    await ready(platform);
    await platform.addObservation(obsInput());
    await expect(platform.addObservation(obsInput({ text: 'Different text' })))
      .rejects.toMatchObject({ kind: 'conflict' });
  });

  it('rejects a stale baseRevision as a conflict', async () => {
    const { platform } = make();
    await ready(platform);
    await platform.addObservation(obsInput());
    await expect(platform.addObservation(obsInput({ requestId: 'req-2', baseRevision: 0 })))
      .rejects.toMatchObject({ kind: 'conflict' });
  });
});

describe('dev adapter — evaluate (deterministic stub)', () => {
  async function evaluateWith(text: string, category: ObservationInput['category'] = 'general') {
    const { platform } = make();
    await ready(platform);
    const { incident } = await platform.addObservation(obsInput({ text, category }));
    const after = await platform.evaluate({ requestId: 'eval-1', baseRevision: incident.revision });
    return after;
  }

  it('gives timing missing_context for the witness-account scenario', async () => {
    const after = await evaluateWith('Friend says short run, dropped about five minutes ago.', 'account');
    const timing = after.feedback.find(f => f.kind === 'missing_context' && /collapse/i.test(f.suggestedQuestion ?? ''));
    expect(timing).toBeDefined();
    expect(timing!.suggestedQuestion).toMatch(/collapse|found him afterward/i);
  });

  it('flags the wearable-skin-temperature inference referencing the temperature-method reference', async () => {
    const after = await evaluateWith('The wearable skin temperature is elevated, so core temperature is confirmed high.');
    const f = after.feedback.find(x => x.kind === 'unsupported_inference' && x.knowledgeReferenceIds.includes('nata-2015-rec8-temperature-method'));
    expect(f).toBeDefined();
  });

  it('flags the sweating-excludes-heat-stroke inference referencing the sweating reference', async () => {
    const after = await evaluateWith('He is sweating, so this cannot be heat stroke.');
    const f = after.feedback.find(x => x.kind === 'unsupported_inference' && x.knowledgeReferenceIds.includes('nata-2015-rec25-sweating'));
    expect(f).toBeDefined();
  });

  it('produces no sweating feedback for a bare "Patient is sweating." observation', async () => {
    const after = await evaluateWith('Patient is sweating.');
    expect(after.feedback.some(f => f.knowledgeReferenceIds.includes('nata-2015-rec25-sweating'))).toBe(false);
  });

  it('only references knowledge IDs that exist on the incident, and carries the evaluated revision', async () => {
    const after = await evaluateWith('He is sweating, so this cannot be heat stroke.');
    expect(after.feedback.length).toBeGreaterThan(0);
    for (const f of after.feedback) {
      expect(f.revision).toBe(after.revision);
      for (const ref of f.knowledgeReferenceIds) {
        expect(after.knowledgeReferences.some(k => k.id === ref)).toBe(true);
      }
    }
  });

  it('does not duplicate feedback items when re-evaluating at the same revision', async () => {
    const { platform } = make();
    await ready(platform);
    const { incident } = await platform.addObservation(obsInput({ text: 'He is sweating, so this cannot be heat stroke.', category: 'skin' }));
    const first = await platform.evaluate({ requestId: 'eval-1', baseRevision: incident.revision });
    const second = await platform.evaluate({ requestId: 'eval-2', baseRevision: first.revision });
    expect(second.feedback.length).toBe(first.feedback.length);
    const ids = second.feedback.map(f => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('dev adapter — late evaluation', () => {
  it('rejects with "conflict" when the incident changes before the check finishes, storing no feedback', async () => {
    const { platform } = make(50);
    await ready(platform);
    const { incident } = await platform.addObservation(obsInput({ text: 'He is sweating, so this cannot be heat stroke.', category: 'skin' }));
    const evaluation = platform.evaluate({ requestId: 'eval-late', baseRevision: incident.revision });
    // Add an observation while the evaluation is mid-flight (delay 50ms).
    await platform.addObservation(obsInput({ requestId: 'req-mid', baseRevision: incident.revision, text: 'Patient now responsive.' }));
    await expect(evaluation).rejects.toMatchObject({ kind: 'conflict' });
    const current = await platform.getIncident();
    expect(current.feedback).toHaveLength(0);
  });
});

describe('dev adapter — assistant disabled', () => {
  it('rejects evaluate with "unavailable" but still allows capture and handoff', async () => {
    const { platform, storage } = make();
    await ready(platform);
    setDevAssistantEnabled(false, storage);
    await expect(platform.evaluate({ requestId: 'eval-x', baseRevision: 0 })).rejects.toMatchObject({ kind: 'unavailable' });

    const obs = await platform.addObservation(obsInput());
    expect(obs.incident.revision).toBe(1);
    const afterMeasure = await platform.addMeasurement({
      requestId: 'm1', baseRevision: obs.incident.revision, kind: 'temperature', status: 'obtained', value: 41,
      value2: null, unit: '°C', method: 'rectal', eventTime: '2026-10-24T14:30:00Z', coolingPhase: 'before',
      sourceKind: 'manual', device: null, recordedBy: 'crew', note: null
    });
    expect(afterMeasure.measurements.some(m => m.kind === 'temperature')).toBe(true);
    const draft = await platform.getHandoffDraft(afterMeasure);
    expect(draft.mode).toBe('website-grouped');
    const approved = await platform.approveHandoff({ revision: afterMeasure.revision, reviewedBy: 'crew' });
    expect(approved.handoffs).toHaveLength(1);
  });
});

describe('dev adapter — resolveFeedback', () => {
  async function withFeedback() {
    const { platform } = make();
    await ready(platform);
    const { incident } = await platform.addObservation(obsInput({ text: 'He is sweating, so this cannot be heat stroke.', category: 'skin' }));
    const after = await platform.evaluate({ requestId: 'eval-1', baseRevision: incident.revision });
    const feedback = after.feedback.find(f => f.knowledgeReferenceIds.includes('nata-2015-rec25-sweating'))!;
    return { platform, after, feedback };
  }

  it('rejects clarify without text as "invalid"', async () => {
    const { platform, after, feedback } = await withFeedback();
    await expect(platform.resolveFeedback({ requestId: 'r1', baseRevision: after.revision, feedbackId: feedback.id, action: 'clarify' }))
      .rejects.toMatchObject({ kind: 'invalid' });
  });

  it('clarify with text creates a replacement observation, marks the original clarified, records a correction, and bumps revision', async () => {
    const { platform, after, feedback } = await withFeedback();
    const originalId = feedback.observationIds[0];
    const resolved = await platform.resolveFeedback({
      requestId: 'r1', baseRevision: after.revision, feedbackId: feedback.id, action: 'clarify',
      clarificationText: 'He is sweating and remains confused; temperature not yet obtained.'
    });
    expect(resolved.revision).toBe(after.revision + 1);
    const original = resolved.observations.find(o => o.id === originalId)!;
    expect(original.status).toBe('clarified');
    expect(original.text).toBe('He is sweating, so this cannot be heat stroke.');
    const correction = resolved.observationCorrections.find(c => c.originalObservationId === originalId);
    expect(correction).toBeDefined();
    expect(correction!.feedbackId).toBe(feedback.id);
    const replacement = resolved.observations.find(o => o.id === correction!.replacementObservationId);
    expect(replacement).toBeDefined();
    expect(resolved.feedback.find(f => f.id === feedback.id)!.status).toBe('clarified');
  });

  it('dismiss records a resolution with author/recordedAt and status "dismissed" without bumping revision', async () => {
    const { platform, after, feedback } = await withFeedback();
    const resolved = await platform.resolveFeedback({ requestId: 'r1', baseRevision: after.revision, feedbackId: feedback.id, action: 'dismiss' });
    expect(resolved.revision).toBe(after.revision);
    const f = resolved.feedback.find(x => x.id === feedback.id)!;
    expect(f.status).toBe('dismissed');
    expect(f.resolution).toMatchObject({ action: 'dismiss', author: 'crew' });
    expect(f.resolution!.recordedAt).toBeTruthy();
  });

  it('defer records status "deferred"', async () => {
    const { platform, after, feedback } = await withFeedback();
    const resolved = await platform.resolveFeedback({ requestId: 'r1', baseRevision: after.revision, feedbackId: feedback.id, action: 'defer' });
    expect(resolved.feedback.find(x => x.id === feedback.id)!.status).toBe('deferred');
  });

  it('rejects resolving an already clarified item as a conflict', async () => {
    const { platform, after, feedback } = await withFeedback();
    const resolved = await platform.resolveFeedback({
      requestId: 'r1', baseRevision: after.revision, feedbackId: feedback.id, action: 'clarify',
      clarificationText: 'Clarified once.'
    });
    await expect(platform.resolveFeedback({
      requestId: 'r2', baseRevision: resolved.revision, feedbackId: feedback.id, action: 'dismiss'
    })).rejects.toMatchObject({ kind: 'conflict' });
  });
});

describe('dev adapter — approveHandoff', () => {
  it('rejects a stale revision as a conflict', async () => {
    const { platform } = make();
    await ready(platform);
    const { incident } = await platform.addObservation(obsInput());
    await expect(platform.approveHandoff({ revision: incident.revision - 1, reviewedBy: 'crew' }))
      .rejects.toMatchObject({ kind: 'conflict' });
  });

  it('approving the same revision twice yields a single version', async () => {
    const { platform } = make();
    await ready(platform);
    const { incident } = await platform.addObservation(obsInput());
    await platform.approveHandoff({ revision: incident.revision, reviewedBy: 'crew' });
    const again = await platform.approveHandoff({ revision: incident.revision, reviewedBy: 'crew' });
    expect(again.handoffs).toHaveLength(1);
  });

  it('after new data, a second approval creates version 2 and leaves version 1 unchanged', async () => {
    const { platform } = make();
    await ready(platform);
    const first = await platform.addObservation(obsInput());
    const v1inc = await platform.approveHandoff({ revision: first.incident.revision, reviewedBy: 'crew' });
    const version1 = v1inc.handoffs[0];

    const second = await platform.addObservation(obsInput({ requestId: 'req-2', baseRevision: first.incident.revision, text: 'Skin is hot and dry.', category: 'skin' }));
    const v2inc = await platform.approveHandoff({ revision: second.incident.revision, reviewedBy: 'crew' });
    expect(v2inc.handoffs).toHaveLength(2);
    expect(v2inc.handoffs.find(h => h.version === 2)).toBeDefined();
    expect(v2inc.handoffs.find(h => h.version === 1)).toEqual(version1);
  });
});

describe('legacy normalization (normalizeIncident via the real API store)', () => {
  async function legacySnapshot() {
    const store = new IncidentStore();
    store.sharing(true);
    store.match('patient-demo-01');
    await store.transcript({ requestId: 'initial', text: DemoInitial });
    await store.transcript({ requestId: 'clarify', text: DemoClarification });
    return normalizeIncident(store.snapshot());
  }

  it('derives observations for both voice sources, marks the original clarified', async () => {
    const incident = await legacySnapshot();
    const voiceSources = incident.sources.filter(s => s.type === 'voice');
    expect(voiceSources).toHaveLength(2);
    for (const s of voiceSources) {
      expect(incident.observations.some(o => o.sourceId === s.id)).toBe(true);
    }
    const original = incident.observations.find(o => o.text === DemoInitial);
    expect(original).toBeDefined();
    expect(original!.status).toBe('clarified');
  });

  it('creates a discovery timeline event at 10:43 EDT with certainty "reported"', async () => {
    const incident = await legacySnapshot();
    const discovery = incident.timelineEvents.find(t => t.kind === 'discovery');
    expect(discovery).toBeDefined();
    expect(discovery!.certainty).toBe('reported');
    expect(clock(discovery!.time)).toBe('10:43');
  });

  it('keeps the collapse event time null and records exactly one observationCorrection', async () => {
    const incident = await legacySnapshot();
    const collapse = incident.timelineEvents.find(t => t.kind === 'collapse');
    expect(collapse).toBeDefined();
    expect(collapse!.time).toBeNull();
    expect(incident.observationCorrections).toHaveLength(1);
  });
});
