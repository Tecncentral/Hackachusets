// End-to-end: the website's HTTP adapter (the only way the UI reaches the platform) against the real
// core platform (apps/api, correction assistant in-process) and the real assistant service
// (apps/assistant, for transcription). fetch is routed to those servers; nothing is mocked.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../../../api/src/app';
import { createAssistantApp } from '../../../assistant/src/app';
import { createHttpPlatform } from './http';
import { patientScoped } from './scope';
import { PlatformError, type WorkspaceIncident } from './boundary';
import { zoneTimeToIso } from './time';

let api: Server, assistant: Server, apiUrl: string, assistantUrl: string;
const listen = (app: { listen: Function }) => new Promise<Server>((resolve, reject) => { const s: Server = app.listen(0, '127.0.0.1', (e?: Error) => (e ? reject(e) : resolve(s))); });
const url = (s: Server) => `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
const realFetch = globalThis.fetch;
beforeAll(async () => {
  api = await listen(createApp()); assistant = await listen(createAssistantApp());
  apiUrl = url(api); assistantUrl = url(assistant);
  // Same routing as the Vite dev proxy: /api → platform, /assistant → assistant service.
  vi.stubGlobal('fetch', (input: string | URL, init?: RequestInit) => {
    const path = String(input);
    if (path.startsWith('/assistant/')) return realFetch(assistantUrl + path.replace(/^\/assistant/, ''), init);
    return realFetch(path.startsWith('/') ? apiUrl + path : path, init);
  });
});
afterAll(async () => {
  vi.unstubAllGlobals();
  await Promise.all([api, assistant].map(s => new Promise<void>((resolve, reject) => s.close(e => (e ? reject(e) : resolve())))));
});

const t = (hhmm: string) => zoneTimeToIso('2026-10-24', hhmm);
let n = 0;
const rid = () => `web-int-${++n}`;

describe('website ↔ core platform ↔ correction assistant', () => {
  const p = createHttpPlatform();
  let inc: WorkspaceIncident;
  const at = () => ({ requestId: rid(), baseRevision: inc.revision });

  it('loads the canonical fixture into the website view, hiding patient-linked data until matched', async () => {
    inc = await p.reset();
    expect(inc.revision).toBe(0);
    expect(inc.patient.matched).toBe(false);
    const view = patientScoped(inc);
    expect(view.sources.some(s => s.type === 'wearable' || s.type === 'patient_profile')).toBe(false);
    expect(view.measurements.find(m => m.kind === 'heartRate')).toMatchObject({ value: 140, unit: 'bpm', coolingPhase: 'before', synthetic: true });
    expect(view.measurements.find(m => m.kind === 'ambientTemperature')).toMatchObject({ value: 88, unit: '°F', sourceKind: 'reference' });
    expect(view.timelineEvents.find(t => t.kind === 'collapse')).toMatchObject({ time: null, certainty: 'unknown' });
    expect(view.timelineEvents.find(t => t.kind === 'call')).toMatchObject({ certainty: 'recorded' });
  });

  it('documents an unidentified patient and gets assistant feedback per observation', async () => {
    const saved = await p.addObservation({ ...at(), text: 'Friend says he went for a run and dropped maybe five minutes ago. Not sure exactly.', observedAt: t('10:58'), category: 'account', inputMode: 'voice-reviewed' });
    expect(saved.compatibility).toBeNull(); // real /observations route, not the legacy fallback
    inc = saved.incident;
    const witness = inc.observations.at(-1)!;
    expect(witness).toMatchObject({ category: 'account', inputMode: 'voice-reviewed', status: 'active' });
    inc = (await p.addObservation({ ...at(), text: 'The wearable skin temperature is elevated, so core temperature is confirmed high.', observedAt: t('10:59'), category: 'general', inputMode: 'typed' })).incident;
    inc = (await p.addObservation({ ...at(), text: "He's drenched in sweat, so it can't be heat stroke.", observedAt: t('11:00'), category: 'skin', inputMode: 'typed' })).incident;
    inc = await p.evaluate(at());
    const forObs = (text: string) => inc.feedback.find(f => f.observationIds.includes(inc.observations.find(o => o.text.startsWith(text))!.id));
    expect(forObs('Friend says')).toMatchObject({ kind: 'missing_context', status: 'open', revision: inc.revision });
    const skin = forObs('The wearable')!, sweat = forObs("He's drenched")!;
    expect(skin.kind).toBe('unsupported_inference');
    expect(sweat.spokenSummary).toMatch(/sweating alone does not rule out heat stroke/i);
    const ref = inc.knowledgeReferences.find(r => r.id === 'nata-2015-rec25-sweating')!;
    expect(ref).toMatchObject({ url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC4639891/', reviewStatus: 'Not clinically reviewed' });
    expect(ref.passage.length).toBeGreaterThan(20);
  });

  it('clarify replaces the statement with the crew’s wording; dismiss keeps a reason; re-check refreshes open items', async () => {
    const sweat = inc.feedback.find(f => /sweating/i.test(f.spokenSummary ?? ''))!;
    const skin = inc.feedback.find(f => /skin temperature/i.test(f.spokenSummary ?? ''))!;
    inc = await p.resolveFeedback({ ...at(), feedbackId: sweat.id, action: 'clarify', clarificationText: 'Skin hot and sweaty. Heat illness remains a concern.' });
    const original = inc.observations.find(o => o.id === sweat.observationIds[0])!;
    expect(original.status).toBe('clarified');
    const correction = inc.observationCorrections.find(c => c.originalObservationId === original.id)!;
    expect(inc.observations.find(o => o.id === correction.replacementObservationId)).toMatchObject({ text: 'Skin hot and sweaty. Heat illness remains a concern.', category: 'skin', status: 'active' });
    expect(inc.feedback.find(f => f.id === sweat.id)).toMatchObject({ status: 'clarified', resolution: { action: 'clarify', replacementObservationId: correction.replacementObservationId } });
    // The workspace treats open feedback from an older revision as stale until re-checked.
    expect(inc.feedback.find(f => f.id === skin.id)!.revision).toBeLessThan(inc.revision);
    inc = await p.evaluate(at());
    expect(inc.feedback.find(f => f.id === skin.id)).toMatchObject({ status: 'open', revision: inc.revision });
    const timing = inc.feedback.find(f => f.kind === 'missing_context')!;
    inc = await p.resolveFeedback({ ...at(), feedbackId: timing.id, action: 'dismiss', clarificationText: 'Witness already gone' });
    expect(inc.feedback.find(f => f.id === timing.id)).toMatchObject({ status: 'dismissed', resolution: { action: 'dismiss', text: 'Witness already gone' } });
  });

  it('records readings, cooling and key times; the platform draft separates before/after cooling', async () => {
    inc = await p.addMeasurement({ ...at(), kind: 'temperature', status: 'obtained', value: 41.2, value2: null, unit: '°C', method: 'rectal', eventTime: t('11:02'), coolingPhase: 'before', sourceKind: 'manual', device: null, recordedBy: 'crew', note: null });
    inc = await p.addCareEvent({ ...at(), category: 'cooling', action: 'Cold-water immersion in portable tub', startedAt: t('11:05'), endedAt: t('11:20'), note: 'More alert by 11:20', recordedBy: 'crew' });
    inc = await p.addMeasurement({ ...at(), kind: 'temperature', status: 'obtained', value: 38.9, value2: null, unit: '°C', method: 'temporal artery', eventTime: t('11:25'), coolingPhase: 'after', sourceKind: 'manual', device: null, recordedBy: 'crew', note: null });
    inc = await p.addMeasurement({ ...at(), kind: 'bloodPressure', status: 'not_obtained', value: null, value2: null, unit: 'mmHg', method: null, eventTime: null, coolingPhase: 'unknown', sourceKind: 'manual', device: null, recordedBy: 'crew', note: 'Cuff unavailable' });
    inc = await p.addMeasurement({ ...at(), kind: 'humidity', status: 'obtained', value: 72, value2: null, unit: '%', method: null, eventTime: t('11:00'), coolingPhase: 'unknown', sourceKind: 'manual', device: null, recordedBy: 'crew', note: null });
    inc = await p.addTimelineEvent({ ...at(), kind: 'discovery', time: t('10:43'), certainty: 'reported', note: 'Friend found him; collapse not witnessed.' });
    const temps = inc.measurements.filter(m => m.kind === 'temperature');
    expect(temps.map(m => [m.value, m.method, m.coolingPhase])).toEqual([[41.2, 'rectal', 'before'], [38.9, 'temporal artery', 'after']]);
    expect(inc.measurements.find(m => m.kind === 'bloodPressure')).toMatchObject({ status: 'not_obtained', value: null });
    expect(inc.measurements.filter(m => m.kind === 'humidity').map(m => m.sourceKind)).toEqual(['reference', 'reference']);
    expect(inc.careEvents.at(-1)).toMatchObject({ category: 'cooling', note: 'More alert by 11:20' });
    expect(inc.timelineEvents.find(e => e.kind === 'discovery')).toMatchObject({ certainty: 'reported' });

    const draft = await p.getHandoffDraft(inc);
    expect(draft).toMatchObject({ mode: 'platform', revision: inc.revision });
    const measurements = draft.sections.find(s => s.id === 'measurements')!.items.map(i => i.text).join('\n');
    expect(measurements).toContain('Body temperature 41.2 °C — rectal — at 11:02 EDT — before cooling started');
    expect(measurements).toContain('Body temperature 38.9 °C — temporal artery — at 11:25 EDT — after cooling stopped');
    expect(draft.uncertainties).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'Collapse time', state: 'unknown' }),
      expect.objectContaining({ label: 'Blood pressure', state: 'not_obtained' }),
      expect.objectContaining({ label: 'Discovery time', state: 'unresolved' })
    ]));
  });

  it('approves a structured handoff, rejects a stale approval, and reports assistant and transcription as unavailable when off', async () => {
    await expect(p.approveHandoff({ revision: inc.revision - 1, reviewedBy: 'Paramedic A' })).rejects.toMatchObject({ kind: 'conflict' });
    inc = await p.approveHandoff({ revision: inc.revision, reviewedBy: 'Paramedic A' });
    expect(inc.handoffs[0]).toMatchObject({ version: 1, kind: 'initial', revision: inc.revision, draft: { mode: 'platform' } });
    expect(inc.handoffs[0].draft!.sections.length).toBeGreaterThan(5);

    await expect(p.transcribe(new Blob(['RIFF....WAVEfmt '], { type: 'audio/wav' }), rid())).rejects.toSatisfy((e: unknown) => e instanceof PlatformError && e.kind === 'unavailable' && /not configured/i.test(e.message));

    await realFetch(`${apiUrl}/api/demo/assistant`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: false }) });
    await expect(p.evaluate(at())).rejects.toMatchObject({ kind: 'unavailable' });
    inc = (await p.addObservation({ ...at(), text: 'Transport started.', observedAt: t('11:30'), category: 'general', inputMode: 'typed' })).incident;
    inc = await p.approveHandoff({ revision: inc.revision, reviewedBy: 'Paramedic A' });
    expect(inc.handoffs[1]).toMatchObject({ version: 2, kind: 'amendment', amendsVersion: 1 });
    await expect(p.addObservation({ requestId: rid(), baseRevision: inc.revision + 5, text: 'x', observedAt: null, category: 'general', inputMode: 'typed' })).rejects.toMatchObject({ kind: 'conflict' });
  });
});
