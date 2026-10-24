import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { findIntegrityProblems, IncidentSchema, type EvaluateRequest } from '@scenebrief/contracts';
import { createIncidentFixture, ExampleStatements } from '@scenebrief/fixtures';
import { IncidentStore } from './store.js';
import { AssistantGateway, HttpAssistant, MockAssistant, UnavailableAssistant, type AssistantClient, type AssistantOutcome } from './assistant.js';
import { renderHandoffHtml } from './handoff.js';

let n = 0;
const rid = () => `req-${++n}`;
function matched(options: ConstructorParameters<typeof IncidentStore>[0] = {}) { const s = new IncidentStore(options); s.sharing(true); s.match('patient-demo-01'); return s; }
const obs = (s: IncidentStore, text: string, extra: object = {}) => s.addObservation({ requestId: rid(), baseRevision: s.snapshot().revision, text, observedAt: '2026-10-24T14:58:00Z', ...extra });
const temp = (s: IncidentStore, value: number, measuredAt: string, coolingPhase: string, site = 'rectal') =>
  s.addMeasurement({ requestId: rid(), baseRevision: s.snapshot().revision, kind: 'body_temperature', value, unit: '°C', site, measuredAt, coolingPhase, device: 'Rectal thermometer (synthetic)', observer: 'Crew', deviceClass: 'clinical' });
const cooling = (s: IncidentStore) => s.addCareEvent({ requestId: rid(), baseRevision: s.snapshot().revision, kind: 'cooling', description: 'Cold-water immersion in portable tub', coolingMethod: 'cold_water_immersion', startedAt: '2026-10-24T15:05:00Z', endedAt: '2026-10-24T15:20:00Z', performedBy: 'Crew', response: 'More alert, answers name and location.' });
const section = (s: IncidentStore, id: string) => s.handoffDraft().sections.find(x => x.id === id)!.items.map(i => i.text).join('\n');

describe('fixtures', () => {
  it('both variants are valid, referentially intact and labeled synthetic', () => {
    for (const variant of ['ehs-runner', 'ehs-runner-no-wearable'] as const) {
      const incident = createIncidentFixture(variant);
      expect(IncidentSchema.safeParse(incident).success).toBe(true);
      expect(findIntegrityProblems(incident)).toEqual([]);
      expect(incident.sources.every(s => s.origin === 'synthetic_fixture')).toBe(true);
    }
    const none = createIncidentFixture('ehs-runner-no-wearable');
    expect(none.sources.some(s => s.type === 'wearable')).toBe(false);
    expect(none.wearableRecords).toEqual([]);
    expect(none.wearableStatus.availability).toBe('unavailable');
  });
  it('keeps environment, skin temperature and clinical temperature separate', () => {
    const incident = createIncidentFixture();
    expect(incident.environmentReadings.map(e => e.kind)).toEqual(['ambient_temperature', 'relative_humidity']);
    expect(incident.measurements.some(m => m.kind === 'body_temperature')).toBe(false);
    expect(incident.wearableRecords.find(w => w.metric === 'skin_temperature_deviation')?.limitation).toContain('not core temperature');
  });
});

describe('measurement validation', () => {
  const base = { requestId: 'v', baseRevision: 0, measuredAt: '2026-10-24T15:00:00Z' };
  it.each([
    [{ kind: 'heart_rate', value: 140, unit: '°C' }, 'not valid for heart_rate'],
    [{ kind: 'blood_pressure', value: 100, unit: 'mmHg' }, 'diastolic'],
    [{ kind: 'body_temperature', value: 40.8, unit: '°C' }, 'measurement site'],
    [{ kind: 'skin_temperature', value: 37, unit: '°C', site: 'rectal' }, 'body temperature only'],
    [{ kind: 'body_temperature', value: 104, unit: '°C', site: 'rectal' }, 'plausible range'],
  ])('rejects %o', (body, message) => {
    const s = new IncidentStore();
    expect(() => s.addMeasurement({ ...base, ...body })).toThrow(ZodError);
    try { s.addMeasurement({ ...base, ...body }); } catch (e) { expect(String((e as ZodError).message)).toContain(message); }
    expect(s.snapshot().revision).toBe(0);
  });
});

describe('capture, idempotency and revisions', () => {
  it('adds observations beyond the scripted scenario with source attribution', () => {
    const s = new IncidentStore();
    const result = obs(s, 'Bystander reports he vomited once before we arrived.', { reportedBy: 'bystander', inputMode: 'transcribed' });
    const added = result.observations.at(-1)!;
    expect(result.revision).toBe(1);
    expect(added).toMatchObject({ reportedBy: 'bystander', inputMode: 'transcribed', status: 'current', addedAtRevision: 1 });
    expect(result.sources.find(src => src.id === added.sourceIds[0])).toMatchObject({ type: 'crew', origin: 'crew_entry', text: added.text });
  });
  it('deduplicates retries, rejects reuse with a different body, and rejects a future baseRevision', () => {
    const s = new IncidentStore();
    const body = { requestId: 'same', baseRevision: 0, text: 'Responds to voice.', observedAt: null };
    s.addObservation(body); s.addObservation(body);
    expect(s.snapshot().observations.filter(o => o.text === 'Responds to voice.')).toHaveLength(1);
    expect(() => s.addObservation({ ...body, text: 'Different' })).toThrow('different request');
    expect(() => s.addObservation({ requestId: 'ahead', baseRevision: 9, text: 'x', observedAt: null })).toThrow('ahead');
  });
  it('accepts appends from an older revision and records what the crew had seen', () => {
    const s = new IncidentStore(); obs(s, 'First note.');
    const result = s.addObservation({ requestId: rid(), baseRevision: 0, text: 'Second crew member note.', observedAt: null });
    expect(result.observations.at(-1)).toMatchObject({ baseRevision: 0, addedAtRevision: 2 });
  });
  it('corrects a measurement while retaining the original value and sources', () => {
    const s = new IncidentStore();
    const result = s.correct({ requestId: rid(), baseRevision: 0, targetId: 'meas-hr-arrival', replacement: { value: 142 }, reason: 'Misread monitor' });
    const original = result.measurements.find(m => m.id === 'meas-hr-arrival')!, replacement = result.measurements.find(m => m.status === 'current' && m.kind === 'heart_rate')!;
    expect(original).toMatchObject({ status: 'superseded', value: 140, sourceIds: ['crew-arrival'] });
    expect(replacement).toMatchObject({ value: 142, unit: 'bpm', measuredAt: '2026-10-24T14:57:00Z', device: 'Cardiac monitor (synthetic)' });
    expect(result.corrections.at(-1)).toMatchObject({ targetType: 'measurement', originalId: 'meas-hr-arrival', replacementId: replacement.id, reason: 'Misread monitor' });
    expect(() => s.correct({ requestId: rid(), baseRevision: result.revision, targetId: 'meas-hr-arrival', replacement: { value: 1 } })).toThrow('already superseded');
    expect(() => s.correct({ requestId: rid(), baseRevision: 0, targetId: replacement.id, replacement: { value: 150 } })).toThrow('Incident changed');
    expect(section(s, 'changes')).toContain('Heart rate 140 bpm');
  });
  it('leaves state unchanged when a mutation fails validation', () => {
    const s = new IncidentStore(); const before = s.snapshot();
    expect(() => s.addObservation({ requestId: rid(), baseRevision: 0, text: 'x', observedAt: null, sourceIds: ['no-such-source'] })).toThrow('Unknown source');
    expect(s.snapshot()).toEqual(before);
  });
});

describe('handoff', () => {
  it('distinguishes readings before, during and after cooling and keeps method/unit/time', () => {
    const s = matched();
    temp(s, 41.2, '2026-10-24T15:02:00Z', 'before_cooling'); cooling(s);
    temp(s, 39.6, '2026-10-24T15:12:00Z', 'during_cooling'); temp(s, 38.9, '2026-10-24T15:25:00Z', 'after_cooling');
    const text = section(s, 'measurements');
    expect(text).toContain('Body temperature 41.2 °C — rectal — at 11:02 EDT — before cooling started');
    expect(text).toContain('Body temperature 39.6 °C — rectal — at 11:12 EDT — during cooling');
    expect(text).toContain('Body temperature 38.9 °C — rectal — at 11:25 EDT — after cooling stopped');
    expect(text.indexOf('41.2')).toBeLessThan(text.indexOf('38.9'));
    expect(section(s, 'care')).toContain('Cooling: Cold-water immersion in portable tub (cold-water immersion) — performed — 11:05 EDT–11:20 EDT');
    expect(s.handoffDraft().uncertainties.map(u => u.topic)).not.toContain('Pre-cooling temperature');
  });
  it('never treats a post-cooling reading as the initial reading and flags phase conflicts', () => {
    const s = matched(); cooling(s);
    temp(s, 38.9, '2026-10-24T15:25:00Z', 'after_cooling');
    temp(s, 39.4, '2026-10-24T15:10:00Z', 'before_cooling'); // recorded phase contradicts care-event times
    const u = s.handoffDraft().uncertainties;
    expect(u.find(x => x.topic === 'Pre-cooling temperature')?.text).toContain('do not show the pre-cooling temperature');
    expect(u.find(x => x.state === 'conflicting')?.text).toContain('care-event times place it during cooling');
  });
  it('reports missing data as not documented, never as normal', () => {
    const s = new IncidentStore({ variant: 'ehs-runner-no-wearable' });
    const draft = s.handoffDraft();
    expect(section(s, 'measurements')).toContain('Blood pressure: not documented.');
    expect(section(s, 'care')).toContain('Not documented does not mean not performed');
    expect(draft.uncertainties.map(u => u.text)).toEqual(expect.arrayContaining(['No clinical body temperature documented.', 'Collapse time: unknown.', 'Symptom onset time: not documented.']));
    expect(draft.text).not.toMatch(/\bwithin normal|\bnormal (finding|vital|range)|\bunremarkable|\bnegative\b/i);
  });
  it('excludes profile and wearable data until the patient is matched', () => {
    const s = new IncidentStore();
    const draft = s.handoffDraft();
    expect(draft.patientMatched).toBe(false);
    expect(draft.sourceIds).not.toContain('profile');
    expect(draft.sourceIds).not.toContain('fall');
    expect(section(s, 'history')).toContain('Patient association not confirmed');
    s.sharing(true); s.match('patient-demo-01');
    expect(section(s, 'history')).toContain('Allergies: No known drug allergies');
    expect(section(s, 'device_context')).toContain('Device-reported fall at 10:42 EDT');
  });
  it('freezes reviewed versions and records amendments with a change summary', () => {
    const s = matched();
    const first = s.review(0, 'Paramedic A').handoffs[0];
    temp(s, 41.2, '2026-10-24T15:02:00Z', 'before_cooling');
    expect(() => s.review(0, 'Paramedic A')).toThrow('Incident changed');
    const result = s.review(1, 'Paramedic A');
    expect(result.handoffs[0]).toEqual(first);
    expect(result.handoffs[1]).toMatchObject({ version: 2, kind: 'amendment', amendsVersion: 1, revision: 1 });
    expect(result.handoffs[1].changeSummary.join('\n')).toContain('Added — Clinical measurements: Body temperature 41.2 °C');
    expect(s.review(1, 'Someone else').handoffs).toHaveLength(2);
  });
  it('escapes record text in printable HTML', () => {
    const s = new IncidentStore(); obs(s, '<script>alert(1)</script> & "quoted"');
    const html = renderHandoffHtml(s.handoffDraft(), s.snapshot().sources, 'runner-found-down');
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;quoted&quot;');
  });
});

/** Assistant whose response can be released manually, to simulate a slow model. */
class ControlledAssistant implements AssistantClient {
  readonly mode = 'http' as const; readonly baseUrl = 'http://test';
  calls: EvaluateRequest[] = []; private release: ((o: AssistantOutcome) => void)[] = [];
  evaluate(request: EvaluateRequest) { this.calls.push(request); return new Promise<AssistantOutcome>(r => this.release.push(r)); }
  respond(o: AssistantOutcome) { this.release.shift()!(o); }
  async health() { return { reachable: true, detail: 'test' }; }
}
const item = (observationIds: string[], extra: object = {}) => ({ id: 'a1', kind: 'missing_context' as const, message: 'Clarify timing.', suggestedQuestion: 'When?', observationIds, evidenceSourceIds: [], knowledgeReferenceIds: [], spokenSummary: null, ...extra });

describe('assistant evaluation', () => {
  it('mock returns source-backed feedback for the shared example statements only', async () => {
    const s = matched({ assistant: new AssistantGateway(new MockAssistant()) });
    obs(s, ExampleStatements.skinTemperatureInference); obs(s, ExampleStatements.sweatingInference); obs(s, 'Patient is sweating.');
    const result = await s.evaluate({ requestId: rid(), baseRevision: s.snapshot().revision });
    expect(result.evaluations.at(-1)).toMatchObject({ status: 'completed', mode: 'mock' });
    const [skin, sweat] = result.feedback;
    expect(result.feedback).toHaveLength(2);
    expect(skin).toMatchObject({ kind: 'unsupported_inference', status: 'open', revision: 3, knowledgeReferenceIds: ['mock-kr-nata-2015-rectal'] });
    expect(skin.suggestedQuestion).toContain('method or site');
    expect(sweat.message).toContain('Sweating does not exclude exertional heat stroke');
    expect(result.knowledgeReferences.map(k => k.reviewStatus)).toEqual(['unreviewed', 'unreviewed']);
    expect(result.revision).toBe(3); // storing feedback is not a content change
    const again = await s.evaluate({ requestId: rid(), baseRevision: 3 });
    expect(again.feedback).toHaveLength(2);
    expect(again.evaluations.at(-1)?.suppressedDuplicates).toBe(2);
  });
  it('re-evaluation moves still-open feedback to the new revision, but not dismissed feedback', async () => {
    const s = matched({ assistant: new AssistantGateway(new MockAssistant()) });
    obs(s, ExampleStatements.skinTemperatureInference); obs(s, ExampleStatements.sweatingInference);
    const first = await s.evaluate({ requestId: rid(), baseRevision: 2 });
    const [skin, sweat] = first.feedback;
    s.resolve(sweat.id, { requestId: rid(), baseRevision: 2, action: 'dismiss', note: 'Crew disagrees' });
    obs(s, 'Unrelated new note.'); // revision 3
    const again = await s.evaluate({ requestId: rid(), baseRevision: 3 });
    expect(again.feedback).toHaveLength(2);
    expect(again.feedback.find(f => f.id === skin.id)).toMatchObject({ status: 'open', revision: 3, evaluationId: again.evaluations.at(-1)!.id });
    expect(again.feedback.find(f => f.id === sweat.id)).toMatchObject({ status: 'dismissed', revision: 2 });
  });
  it('records a measurement the crew did not obtain without inventing a value', () => {
    const s = matched();
    const result = s.addMeasurement({ requestId: rid(), baseRevision: 0, kind: 'blood_pressure', obtained: false, value: null, unit: 'mmHg', measuredAt: null, note: 'Cuff unavailable' });
    expect(result.measurements.at(-1)).toMatchObject({ obtained: false, value: null, diastolic: null });
    expect(() => s.addMeasurement({ requestId: rid(), baseRevision: 1, kind: 'heart_rate', value: null, unit: 'bpm', measuredAt: null })).toThrow('not obtained');
    const draft = s.handoffDraft();
    expect(draft.sections.find(x => x.id === 'measurements')!.items.map(i => i.text)).toContain('Blood pressure: not obtained (crew recorded it was not done) — Cuff unavailable');
    expect(draft.uncertainties.find(u => u.topic === 'Blood pressure')).toMatchObject({ state: 'not_performed' });
    expect(draft.uncertainties.find(u => u.topic === 'Vital signs')!.text).not.toContain('blood pressure');
  });
  it('with the assistant unavailable, records the state and capture and handoff keep working', async () => {
    for (const gateway of [new AssistantGateway(new UnavailableAssistant()), Object.assign(new AssistantGateway(new MockAssistant()), { enabled: false })]) {
      const s = new IncidentStore({ assistant: gateway }); obs(s, ExampleStatements.sweatingInference);
      const result = await s.evaluate({ requestId: rid(), baseRevision: 1 });
      expect(result.evaluations[0]).toMatchObject({ status: 'unavailable', mode: 'unavailable' });
      expect(result.feedback).toEqual([]);
      expect(obs(s, 'Still documenting.').revision).toBe(2);
      expect(s.review(2, 'crew').handoffs).toHaveLength(1);
    }
  });
  it('does not block capture during evaluation and stores a late response as stale', async () => {
    const assistant = new ControlledAssistant(); const s = new IncidentStore({ assistant: new AssistantGateway(assistant) });
    const o = obs(s, 'Friend unsure of timing.').observations.at(-1)!;
    const pending = s.evaluate({ requestId: rid(), baseRevision: 1 });
    await new Promise(r => setTimeout(r, 0));
    expect(s.snapshot().evaluations[0].status).toBe('pending');
    await s.transaction(() => obs(s, 'Added while assistant is thinking.'));
    assistant.respond({ status: 'completed', response: { incidentId: 'runner-found-down', revision: 1, mode: 'model', feedback: [item([o.id])], knowledgeReferences: [] } });
    const result = await pending;
    expect(result.revision).toBe(2);
    expect(result.evaluations[0].status).toBe('stale');
    expect(result.feedback[0]).toMatchObject({ status: 'stale', revision: 1 });
    expect(() => s.resolve(result.feedback[0].id, { requestId: rid(), baseRevision: 2, action: 'dismiss' })).toThrow('earlier revision');
  });
  it('discards feedback that references unknown IDs and rejects mismatched revisions', async () => {
    const assistant = new ControlledAssistant(); const s = new IncidentStore({ assistant: new AssistantGateway(assistant) });
    const o = obs(s, 'Note.').observations.at(-1)!;
    let p = s.evaluate({ requestId: rid(), baseRevision: 1 }); await new Promise(r => setTimeout(r, 0));
    assistant.respond({ status: 'completed', response: { incidentId: 'runner-found-down', revision: 1, mode: 'model', knowledgeReferences: [], feedback: [item(['invented-obs']), item([o.id], { id: 'a2', evidenceSourceIds: ['invented-src'] }), item([o.id], { id: 'a3', knowledgeReferenceIds: ['invented-ref'] }), item([o.id], { id: 'ok' })] } });
    let result = await p;
    expect(result.evaluations[0]).toMatchObject({ status: 'completed', discardedItems: 3 });
    expect(result.feedback.map(f => f.assistantItemId)).toEqual(['ok']);
    p = s.evaluate({ requestId: rid(), baseRevision: 1 }); await new Promise(r => setTimeout(r, 0));
    assistant.respond({ status: 'completed', response: { incidentId: 'runner-found-down', revision: 0, mode: 'model', feedback: [], knowledgeReferences: [] } });
    result = await p;
    expect(result.evaluations[1]).toMatchObject({ status: 'failed' });
  });
  it('HTTP client reports timeouts, bad responses and unreachable services without throwing', async () => {
    const request: EvaluateRequest = { incidentId: 'x', revision: 0, patientMatched: false, observations: [], measurements: [], sources: [], careEvents: [], timelineEvents: [], contextFacts: [], environmentReadings: [], wearableRecords: [], protocolContext: { agencyProtocolId: null, applicability: 'not_configured', note: '' } };
    const slow = (_u: unknown, init?: RequestInit) => new Promise<Response>((_r, reject) => init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('t'), { name: 'TimeoutError' }))));
    expect(await new HttpAssistant('http://a', 100, slow as typeof fetch).evaluate(request)).toMatchObject({ status: 'failed', error: expect.stringContaining('timed out') });
    expect(await new HttpAssistant('http://a', 100, (async () => new Response('{"nope":1}')) as typeof fetch).evaluate(request)).toMatchObject({ status: 'failed', error: expect.stringContaining('validation') });
    expect(await new HttpAssistant('http://a', 100, (async () => new Response('', { status: 503 })) as typeof fetch).evaluate(request)).toMatchObject({ status: 'unavailable' });
    expect(await new HttpAssistant('http://127.0.0.1:1', 500).evaluate(request)).toMatchObject({ status: 'unavailable' });
  });
});

describe('feedback resolution', () => {
  async function withFeedback() {
    const s = matched(); const original = obs(s, ExampleStatements.sweatingInference).observations.at(-1)!;
    const result = await s.evaluate({ requestId: rid(), baseRevision: s.snapshot().revision });
    return { s, original, feedback: result.feedback[0] };
  }
  it('clarify records the crew\'s wording, supersedes the original with an auditable correction', async () => {
    const { s, original, feedback } = await withFeedback();
    const revision = s.snapshot().revision;
    const result = s.resolve(feedback.id, { requestId: rid(), baseRevision: revision, action: 'clarify', clarificationText: 'Skin hot and sweaty. Heat illness remains a concern.', recordedBy: 'Paramedic A' });
    const clarification = result.observations.at(-1)!;
    expect(result.revision).toBe(revision + 1);
    expect(clarification).toMatchObject({ text: 'Skin hot and sweaty. Heat illness remains a concern.', reportedBy: 'crew', recordedBy: 'Paramedic A', clarifiesFeedbackId: feedback.id });
    expect(result.observations.find(o => o.id === original.id)).toMatchObject({ status: 'superseded', text: ExampleStatements.sweatingInference });
    expect(result.corrections.at(-1)).toMatchObject({ targetType: 'observation', originalId: original.id, replacementId: clarification.id, feedbackId: feedback.id });
    expect(result.feedback[0].status).toBe('clarified');
    expect(result.resolutions[0]).toMatchObject({ action: 'clarify', clarificationObservationId: clarification.id, resolvedBy: 'Paramedic A' });
    // Assistant text never enters the handoff; the crew's clarification does.
    const text = s.handoffDraft().text;
    expect(text).not.toContain(feedback.message);
    expect(text).toContain('Heat illness remains a concern');
    expect(() => s.resolve(feedback.id, { requestId: rid(), baseRevision: result.revision, action: 'dismiss' })).toThrow('already clarified');
  });
  it('dismiss keeps provenance without changing clinical content; defer can be resolved later', async () => {
    const { s, feedback } = await withFeedback();
    const revision = s.snapshot().revision;
    const dismissed = s.resolve(feedback.id, { requestId: rid(), baseRevision: revision, action: 'defer', note: 'Treating first' });
    expect(dismissed.feedback[0].status).toBe('deferred');
    const result = s.resolve(feedback.id, { requestId: rid(), baseRevision: revision, action: 'dismiss', note: 'Crew disagrees', recordedBy: 'Paramedic B' });
    expect(result.revision).toBe(revision);
    expect(result.feedback[0].status).toBe('dismissed');
    expect(result.resolutions.map(r => [r.action, r.resolvedBy, r.note])).toEqual([['defer', 'crew', 'Treating first'], ['dismiss', 'Paramedic B', 'Crew disagrees']]);
  });
  it('rejects clarify without text or against a stale revision', async () => {
    const { s, feedback } = await withFeedback();
    expect(() => s.resolve(feedback.id, { requestId: rid(), baseRevision: s.snapshot().revision, action: 'clarify' })).toThrow(ZodError);
    obs(s, 'Another note.');
    expect(() => s.resolve(feedback.id, { requestId: rid(), baseRevision: s.snapshot().revision - 1, action: 'clarify', clarificationText: 'x' })).toThrow('Incident changed');
  });
});
