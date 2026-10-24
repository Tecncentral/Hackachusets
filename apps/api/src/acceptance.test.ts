import { afterAll, beforeAll, expect, it } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { HandoffDraftSchema, IncidentSchema, type Incident } from '@scenebrief/contracts';
import { ExampleStatements } from '@scenebrief/fixtures';
import { createApp } from './app.js';

// Shared acceptance scenario from docs/kickoff-prompts/01-core-platform.md, exercised over HTTP with the mock assistant.
let server: Server, base: string, n = 0;
beforeAll(async () => { await new Promise<void>((resolve, reject) => { server = createApp().listen(0, '127.0.0.1', e => (e ? reject(e) : resolve())); }); base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`; });
afterAll(async () => { await new Promise<void>((resolve, reject) => server.close(e => (e ? reject(e) : resolve()))); });

const route = '/incidents/runner-found-down';
async function call(method: string, path: string, body?: unknown) {
  const response = await fetch(`${base}${path}`, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, json: response.headers.get('content-type')?.includes('json') ? await response.json() : null, response };
}
async function mutate(path: string, body: Record<string, unknown>, expected = 200): Promise<Incident> {
  const { status, json } = await call('POST', `${route}${path}`, body);
  expect(status, JSON.stringify(json)).toBe(expected);
  return IncidentSchema.parse(json);
}
let incident: Incident;
const at = () => ({ requestId: `acc-${++n}`, baseRevision: incident.revision });

it('runs capture → assessment → correction → reassessment → handoff, with and without the assistant', async () => {
  incident = IncidentSchema.parse((await call('POST', '/demo/reset', {})).json);
  await mutate('/sharing', { sharing: true });
  incident = await mutate('/match', { patientId: 'patient-demo-01', confirmed: true });

  // 1. Short, uncertain witness account and the skin-temperature inference.
  incident = await mutate('/observations', { ...at(), text: ExampleStatements.witnessAccount, observedAt: '2026-10-24T14:58:00Z', category: 'account', reportedBy: 'witness', inputMode: 'transcribed' });
  const retry = { ...at(), text: ExampleStatements.skinTemperatureInference, observedAt: '2026-10-24T14:59:00Z' };
  incident = await mutate('/observations', retry);
  incident = await mutate('/observations', retry); // duplicate request
  expect(incident.observations.filter(o => o.text === ExampleStatements.skinTemperatureInference)).toHaveLength(1);

  incident = await mutate('/evaluations', at());
  const timing = incident.feedback.find(f => f.kind === 'missing_context')!;
  const skin = incident.feedback.find(f => f.kind === 'unsupported_inference')!;
  expect(timing.suggestedQuestion).toContain('Did you see him collapse');
  expect(timing.evidenceSourceIds).toEqual(expect.arrayContaining(['dispatch', 'fall']));
  expect(skin.message).toContain('does not establish core body temperature');
  expect(skin.suggestedQuestion).toContain('method or site, and time');

  // 2. Sweating inference gets a source-backed clarification.
  incident = await mutate('/observations', { ...at(), text: ExampleStatements.sweatingInference, observedAt: '2026-10-24T15:00:00Z' });
  incident = await mutate('/evaluations', at());
  const sweating = incident.feedback.find(f => f.message.startsWith('Sweating does not exclude'))!;
  expect(incident.knowledgeReferences.find(k => k.id === sweating.knowledgeReferenceIds[0])).toMatchObject({ url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC4639891/', reviewStatus: 'unreviewed' });
  expect(incident.feedback.filter(f => f.status === 'open')).toHaveLength(3); // no duplicates from re-evaluation

  // 3. The EMT clarifies, defers and later dismisses.
  incident = await mutate(`/feedback/${timing.id}/resolutions`, { ...at(), action: 'clarify', clarificationText: 'Friend found him around 10:43 and called at 10:44. Did not see him collapse. Five minutes was a guess.' });
  incident = await mutate('/timeline-events', { ...at(), kind: 'discovery', time: '2026-10-24T14:43:00Z', certainty: 'approximate', reportedBy: 'witness', note: 'Friend found him; collapse not witnessed.' });
  incident = await mutate('/timeline-events', { ...at(), kind: 'collapse', time: null, certainty: 'unknown', reportedBy: 'witness', note: 'Not witnessed.' });
  incident = await mutate(`/feedback/${skin.id}/resolutions`, { ...at(), action: 'defer', note: 'Cooling first' });
  incident = await mutate(`/feedback/${sweating.id}/resolutions`, { ...at(), action: 'clarify', clarificationText: 'Skin hot and sweaty. Heat illness remains a concern.', category: 'skin' });

  // 4. Clinical temperature, cooling and reassessment.
  incident = await mutate('/measurements', { ...at(), kind: 'body_temperature', value: 41.2, unit: '°C', site: 'rectal', measuredAt: '2026-10-24T15:02:00Z', coolingPhase: 'before_cooling', device: 'Rectal thermometer (synthetic)', observer: 'Crew', deviceClass: 'clinical' });
  incident = await mutate('/care-events', { ...at(), kind: 'cooling', description: 'Cold-water immersion in portable tub', coolingMethod: 'cold_water_immersion', startedAt: '2026-10-24T15:05:00Z', endedAt: '2026-10-24T15:20:00Z', performedBy: 'Crew', response: 'More alert by 11:20.' });
  incident = await mutate('/measurements', { ...at(), kind: 'body_temperature', value: 38.9, unit: '°C', site: 'rectal', measuredAt: '2026-10-24T15:25:00Z', coolingPhase: 'after_cooling', device: 'Rectal thermometer (synthetic)', observer: 'Crew', deviceClass: 'clinical' });
  incident = await mutate('/observations', { ...at(), text: 'Answers name and location; still slow to respond.', observedAt: '2026-10-24T15:26:00Z', category: 'reassessment' });
  incident = await mutate(`/feedback/${skin.id}/resolutions`, { ...at(), action: 'dismiss', note: 'Rectal temperature now recorded.', recordedBy: 'Paramedic A' });
  expect(incident.resolutions.find(r => r.action === 'dismiss')).toMatchObject({ resolvedBy: 'Paramedic A', note: 'Rectal temperature now recorded.' });

  // 5. Handoff distinguishes pre/post-cooling and keeps collapse time unknown.
  const draft = HandoffDraftSchema.parse((await call('GET', `${route}/handoff-draft`)).json);
  expect(draft.revision).toBe(incident.revision);
  const measurements = draft.sections.find(s => s.id === 'measurements')!.items.map(i => i.text).join('\n');
  expect(measurements).toContain('Body temperature 41.2 °C — rectal — at 11:02 EDT — before cooling started');
  expect(measurements).toContain('Body temperature 38.9 °C — rectal — at 11:25 EDT — after cooling stopped');
  expect(draft.uncertainties.map(u => u.text)).toEqual(expect.arrayContaining([expect.stringMatching(/^Collapse time: unknown/), expect.stringMatching(/^Discovery time: approximate \(~10:43 EDT, witness\)/)]));
  expect(draft.text).toContain('Five minutes was a guess');
  // The superseded inference appears only as a recorded change, not as a current finding.
  const textOf = (id: string) => draft.sections.find(s => s.id === id)!.items.map(i => i.text).join('\n');
  expect(textOf('presentation') + textOf('neurological')).not.toContain(ExampleStatements.sweatingInference);
  expect(textOf('neurological')).toContain('Heat illness remains a concern');
  expect(textOf('changes')).toContain(ExampleStatements.sweatingInference);

  // 6. Disable the assistant: evaluation is explicit, capture and handoff still work.
  expect((await call('POST', '/demo/assistant', { enabled: false })).json).toMatchObject({ enabled: false, effectiveMode: 'unavailable' });
  incident = await mutate('/observations', { ...at(), text: 'Transport started.', observedAt: '2026-10-24T15:30:00Z' });
  incident = await mutate('/evaluations', at());
  expect(incident.evaluations.at(-1)).toMatchObject({ status: 'unavailable' });
  expect((await call('POST', `${route}/handoffs`, { revision: incident.revision - 1, reviewedBy: 'Paramedic A' })).status).toBe(409);
  incident = await mutate('/handoffs', { revision: incident.revision, reviewedBy: 'Paramedic A' });
  expect(incident.handoffs[0]).toMatchObject({ version: 1, kind: 'initial', revision: incident.revision });
  const print = await call('GET', `${route}/handoffs/1/print`);
  expect(print.status).toBe(200);
  expect(print.response.headers.get('content-security-policy')).toContain("default-src 'none'");
  expect(await print.response.text()).toContain('Reviewed handoff v1');
  await call('POST', '/demo/assistant', { enabled: true });

  // Errors use { error } with the documented status codes.
  expect((await call('POST', `${route}/measurements`, { ...at(), kind: 'heart_rate', value: 90, unit: '°F', measuredAt: null })).status).toBe(400);
  expect((await call('POST', `${route}/feedback/nope/resolutions`, { ...at(), action: 'dismiss' })).status).toBe(404);
  expect((await call('GET', `${route}/handoffs/9`)).status).toBe(404);
});
