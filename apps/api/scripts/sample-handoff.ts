// Generates docs/samples/* from the real store by running the shared acceptance scenario
// with a fixed clock and the mock assistant. Run: npm run sample:handoff -w @scenebrief/api
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ExampleStatements } from '@scenebrief/fixtures';
import { IncidentStore } from '../src/store.js';
import { renderHandoffHtml } from '../src/handoff.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const out = resolve(root, 'docs/samples');
let tick = Date.parse('2026-10-24T14:58:00Z');
const store = new IncidentStore({ clock: () => new Date((tick += 30_000)) });
let n = 0;
const at = () => ({ requestId: `sample-${++n}`, baseRevision: store.snapshot().revision });

store.sharing(true); store.match('patient-demo-01');
store.addObservation({ ...at(), text: ExampleStatements.witnessAccount, observedAt: '2026-10-24T14:58:00Z', category: 'account', reportedBy: 'witness', inputMode: 'transcribed' });
store.addObservation({ ...at(), text: ExampleStatements.skinTemperatureInference, observedAt: '2026-10-24T14:59:00Z' });
store.addObservation({ ...at(), text: ExampleStatements.sweatingInference, observedAt: '2026-10-24T15:00:00Z' });

// Capture the exact assistant exchange for the UI and assistant owners.
let evaluateRequest: unknown, evaluateResponse: unknown;
const gateway = store.assistant, original = gateway.client.evaluate.bind(gateway.client);
gateway.client.evaluate = async request => { evaluateRequest = request; const outcome = await original(request); if (outcome.status === 'completed') evaluateResponse = outcome.response; return outcome; };
const evaluated = await store.evaluate(at());
gateway.client.evaluate = original;
const fb = (prefix: string) => evaluated.feedback.find(f => f.message.startsWith(prefix))!;

store.resolve(fb('The account').id, { ...at(), action: 'clarify', clarificationText: 'Friend found him around 10:43 and called at 10:44. Did not see him collapse. Five minutes was a guess.', observedAt: '2026-10-24T15:01:00Z', recordedBy: 'Paramedic A' });
store.addTimelineEvent({ ...at(), kind: 'discovery', time: '2026-10-24T14:43:00Z', certainty: 'approximate', reportedBy: 'witness', note: 'Friend found him; collapse not witnessed.' });
store.addTimelineEvent({ ...at(), kind: 'collapse', time: null, certainty: 'unknown', reportedBy: 'witness', note: 'Not witnessed.' });
store.resolve(fb('A consumer').id, { ...at(), action: 'defer', note: 'Cooling first', recordedBy: 'Paramedic A' });
store.resolve(fb('Sweating').id, { ...at(), action: 'clarify', clarificationText: 'Skin hot and sweaty. Heat illness remains a concern.', category: 'skin', observedAt: '2026-10-24T15:01:00Z', recordedBy: 'Paramedic A' });
store.addMeasurement({ ...at(), kind: 'body_temperature', value: 41.2, unit: '°C', site: 'rectal', measuredAt: '2026-10-24T15:02:00Z', coolingPhase: 'before_cooling', device: 'Rectal thermometer (synthetic)', observer: 'Crew', deviceClass: 'clinical', recordedBy: 'Paramedic A' });
store.addMeasurement({ ...at(), kind: 'blood_pressure', value: 104, diastolic: 62, unit: 'mmHg', measuredAt: '2026-10-24T15:03:00Z', coolingPhase: 'before_cooling', device: 'Cardiac monitor (synthetic)', observer: 'Crew', deviceClass: 'clinical', recordedBy: 'Paramedic A' });
store.addCareEvent({ ...at(), kind: 'cooling', description: 'Cold-water immersion in portable tub', coolingMethod: 'cold_water_immersion', startedAt: '2026-10-24T15:05:00Z', endedAt: '2026-10-24T15:20:00Z', performedBy: 'Crew', response: 'More alert by 11:20.', recordedBy: 'Paramedic A' });
store.addMeasurement({ ...at(), kind: 'body_temperature', value: 38.9, unit: '°C', site: 'rectal', measuredAt: '2026-10-24T15:25:00Z', coolingPhase: 'after_cooling', device: 'Rectal thermometer (synthetic)', observer: 'Crew', deviceClass: 'clinical', recordedBy: 'Paramedic A' });
store.addObservation({ ...at(), text: 'Answers name and location; still slow to respond.', observedAt: '2026-10-24T15:26:00Z', category: 'reassessment', recordedBy: 'Paramedic A' });
// The deferred skin-temperature feedback is clarified once a clinical temperature exists.
store.resolve(fb('A consumer').id, { ...at(), action: 'clarify', clarificationText: 'Wearable shows elevated skin temperature (consumer device; not core temperature). Rectal temperature recorded separately.', category: 'general', observedAt: '2026-10-24T15:03:00Z', note: 'Rectal temperature now recorded.', recordedBy: 'Paramedic A' });
store.review(store.snapshot().revision, 'Paramedic A');
// A later correction produces an amendment.
store.correct({ ...at(), targetId: 'meas-hr-arrival', replacement: { value: 142 }, reason: 'Misread monitor', recordedBy: 'Paramedic A' });
const final = store.review(store.snapshot().revision, 'Paramedic A');

mkdirSync(out, { recursive: true });
const write = (name: string, content: string) => { writeFileSync(resolve(out, name), content.endsWith('\n') ? content : `${content}\n`); console.log(`wrote docs/samples/${name}`); };
write('handoff-v1.txt', final.handoffs[0].text);
write('handoff-v2-amendment.txt', final.handoffs[1].text);
write('handoff-v2-amendment.html', renderHandoffHtml(final.handoffs[1], final.sources, final.id));
write('handoff-draft.json', JSON.stringify(store.handoffDraft(), null, 2));
write('assistant-evaluate-request.json', JSON.stringify(evaluateRequest, null, 2));
write('assistant-evaluate-response.json', JSON.stringify(evaluateResponse, null, 2));
write('incident-after-scenario.json', JSON.stringify(final, null, 2));
