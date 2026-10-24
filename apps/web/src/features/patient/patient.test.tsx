import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createIncidentFixture } from '@scenebrief/fixtures';
import { IncidentProvider } from '../../platform';
import { makePlatform, textOf } from '../../test-helpers';
import { ACTIVITY, HEART_RATE, READINGS, TILES, chartSummary, seedProfile } from './data';
import { initialState, load, reducer, type CompanionState } from './state';
import { createScriptedSource, type SyncProgress } from './wearableSource';
import { stageView } from './SyncStep';
import { PatientPage } from './PatientPage';

const fixture = createIncidentFixture('ehs-runner');

describe('patient dataset comes from the shared fixture', () => {
  it('seeds the profile from the fixture’s self-reported facts; missing contact is Not provided', () => {
    const p = seedProfile();
    expect(p.name).toBe(fixture.patient.name);
    expect(p.fields.allergies).toEqual({ state: 'provided', text: fixture.contextFacts.find(f => f.category === 'allergy')!.value });
    expect(p.fields.age).toEqual({ state: 'provided', text: '24 years' });
    expect(p.fields.contact).toEqual({ state: 'not_provided' });
  });

  it('uses fixture readings, device events and times; skin temperature stays out', () => {
    const hr = fixture.wearableRecords.find(w => w.metric === 'heart_rate')!;
    expect(HEART_RATE.samples.map(s => s.value)).toEqual(hr.samples.map(s => s.value));
    expect(ACTIVITY.find(a => a.title === 'Fall detected')).toMatchObject({ time: '10:42', deviceEvent: true });
    expect(ACTIVITY.some(a => /skin/i.test(a.detail))).toBe(false);
    expect(READINGS.date).toBe('23–24 Oct 2026'); // overnight summary starts the evening before
    expect(READINGS.capturedIntoRecord).toBe('10:43');
    expect(TILES.map(t => t.title)).toContain('Outdoor run');
    expect(chartSummary()).toContain('highest 166 at 10:34');
  });
});

describe('local state', () => {
  it('requires a name, and keeps "None" distinct from "Not provided"', () => {
    let s = initialState();
    s = reducer(s, { type: 'setName', name: '   ' });
    expect(s.profile.name).toBe(fixture.patient.name);
    s = reducer(s, { type: 'setField', key: 'medications', value: { state: 'none' } });
    expect(s.profile.fields.medications).toEqual({ state: 'none' });
    s = reducer(s, { type: 'setField', key: 'medications', value: { state: 'not_provided' } });
    expect(s.profile.fields.medications.state).toBe('not_provided');
  });

  it('removing readings clears the device; a reload during sync returns to sharing', () => {
    let s: CompanionState = reducer(initialState(), { type: 'connected', device: 'oura', options: { activity: true, heartRate: false } });
    s = reducer(reducer(s, { type: 'syncComplete' }), { type: 'disconnect' });
    expect(s).toMatchObject({ synced: true, disconnected: true });
    expect(reducer(s, { type: 'removeReadings' })).toMatchObject({ device: null, synced: false });
    const mem = new Map<string, string>([['traumallama.patient-companion.v1', JSON.stringify({ ...s, step: 'sync' })]]);
    expect(load({ getItem: k => mem.get(k) ?? null, setItem: () => {}, removeItem: () => {} }).step).toBe('sharing');
  });
});

describe('scripted wearable source', () => {
  async function runWith(o: Partial<Parameters<ReturnType<typeof createScriptedSource>['sync']>[0]> = {}, fail = false, cancelAt?: number) {
    vi.useFakeTimers();
    const source = createScriptedSource({ failNext: () => fail });
    const seen: SyncProgress[] = [];
    const c = new AbortController();
    const done = source.sync({ device: 'whoop', activity: true, heartRate: true, reducedMotion: false, ...o }, p => seen.push(p), c.signal);
    if (cancelAt !== undefined) { await vi.advanceTimersByTimeAsync(cancelAt); c.abort(); }
    let elapsed = 0, finished = false;
    void done.then(() => { finished = true; });
    while (elapsed < 20000 && !finished) { await vi.advanceTimersByTimeAsync(100); elapsed += 100; }
    vi.useRealTimers();
    return { result: await done, seen, elapsed };
  }

  it('runs four stages in about 8 s and fills rows and samples progressively', async () => {
    const { result, seen, elapsed } = await runWith();
    expect(result.status).toBe('complete');
    expect(elapsed).toBeGreaterThan(6500); expect(elapsed).toBeLessThan(9500);
    expect([...new Set(seen.map(p => p.stage))]).toEqual([1, 2, 3, 4, 5]);
    expect(seen.some(p => p.acts > p.actsReady)).toBe(true); // a row shows Pending before Ready
    expect(seen.map(p => p.pts).filter((v, i, a) => a.indexOf(v) === i)).toEqual([0, 1, 2, 3, 4]);
  });

  it('reduced motion keeps the same stages in about 4 s, each completing at once', async () => {
    const { result, seen, elapsed } = await runWith({ reducedMotion: true });
    expect(result.status).toBe('complete');
    expect(elapsed).toBeLessThan(5000);
    expect([...new Set(seen.map(p => p.stage))]).toEqual([1, 2, 3, 4, 5]);
    expect(seen.some(p => p.acts > 0 && p.acts < ACTIVITY.length)).toBe(false);
  });

  it('fails during stage 2 and can be cancelled', async () => {
    const failed = await runWith({}, true);
    expect(failed.result.status).toBe('failed');
    expect(failed.seen.at(-1)!.stage).toBe(2);
    const cancelled = await runWith({}, false, 2000);
    expect(cancelled.result.status).toBe('cancelled');
  });

  it('without a device only stage 4 runs; stages 1–3 read "No wearable — skipped"', async () => {
    const { result, seen } = await runWith({ device: null });
    expect(result.status).toBe('complete');
    expect(seen[0].stage).toBe(4);
    const v = stageView(null, { activity: true, heartRate: true }, seen.at(-1)!, 'complete');
    expect(v.stages.slice(0, 3).map(s => s.detail)).toEqual(['No wearable — skipped', 'No wearable — skipped', 'No wearable — skipped']);
    expect(v.stages[3].pill).toBe('Ready');
  });

  it('a stage the person switched off shows "Not selected · Skipped"', () => {
    const v = stageView('apple', { activity: false, heartRate: true }, { stage: 3, acts: 0, actsReady: 0, pts: 1, prof: 0 }, 'running');
    expect(v.stages[1].pill).toBe('Not selected · Skipped');
    expect(v.line).toBe('Stage 2 of 3 · Organizing readings by time');
  });
});

describe('PatientPage', () => {
  const page = async (initial: Partial<CompanionState>) => {
    const { platform } = makePlatform();
    const incident = await platform.getIncident();
    return textOf(renderToStaticMarkup(<IncidentProvider platform={platform} pollMs={1e9}><PatientPage incident={incident} initial={initial} /></IncidentProvider>));
  };
  const html = async (initial: Partial<CompanionState>) => {
    const { platform } = makePlatform();
    return renderToStaticMarkup(<IncidentProvider platform={platform} pollMs={1e9}><PatientPage incident={await platform.getIncident()} initial={initial} /></IncidentProvider>);
  };

  it('profile: fixture values, dashed "Not provided" for the missing contact, Add vs Edit, step tracker', async () => {
    const t = await page({ step: 'profile' });
    expect(t).toContain('Your emergency profile');
    expect(t).toContain('No known drug allergies');
    expect(t).toMatch(/Emergency contact \(optional\) Not provided Add/);
    expect(t).toContain('Continue without a wearable');
    expect(await html({ step: 'profile' })).toContain('aria-current="step"');
  });

  it('wearable: brand names as text only, generic icons, aria-pressed cards, no login', async () => {
    const h = await html({ step: 'wearable' });
    for (const n of ['Apple Watch', 'WHOOP', 'Garmin', 'Oura Ring']) expect(h).toContain(n);
    expect(h).not.toMatch(/<img|password|Sign in|Log in/i);
    expect(h.match(/aria-pressed="false"/g)?.length).toBe(4);
  });

  it('sharing: switches with text state; empty fields disabled; wearable row only with a device; not enforced note', async () => {
    const h = await html({ step: 'sharing', device: 'garmin' });
    const t = textOf(h);
    expect(h).toContain('role="switch"');
    expect(t).toContain('Not provided — nothing to share');
    expect(t).toContain('Wearable background');
    expect(t).toContain('Save and sync');
    expect(t).toContain('The platform does not enforce per-field sharing yet');
    expect(t).toContain('Emergency sharing with crews');
    expect(t).toContain('Off');
    expect(textOf(await html({ step: 'sharing' }))).toContain('Save and finish');
    expect(textOf(await html({ step: 'sharing', returnHome: true }))).toContain('Save sharing');
  });

  it('home: connected device with consumer-device labels and device times; capture time is not a sync time', async () => {
    const t = await page({ step: 'home', device: 'whoop', synced: true });
    expect(t).toContain('Emergency profile ready');
    expect(t).toContain('Connected (demo)');
    expect(t).toContain('Heart rate history');
    expect(t).toContain('consumer wearable, not a medical measurement');
    expect(t).toContain('Fall detected');
    expect(t).toContain('They do not show when symptoms started');
    expect(t).not.toMatch(/Synced at \d/);
    expect(t).toContain('Demo patient code patient-demo-01');
  });

  it('home without a device: "No wearable connected" and Add a wearable', async () => {
    const t = await page({ step: 'home' });
    expect(t).toContain('No wearable connected');
    expect(t).not.toContain('Heart rate history');
  });
});
