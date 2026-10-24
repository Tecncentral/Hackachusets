// Demo dataset for the patient companion, derived from the shared synthetic fixture
// (@scenebrief/fixtures, scenario "ehs-runner"). Nothing here is an independent copy of patient data:
// names, values, device times and capture time all come from the fixture records.
//
// Times kept distinct:
//   - device times      wearable record start/end and sample times (what the device recorded)
//   - capturedAt        when the synthetic profile/wearable sources were added to the incident record
//                       (fixture: "profile and wearable data shared with the incident"). It is NOT
//                       shown as a sync time; the demo sync below is simulated in the browser.
//   - discovery, symptom onset, collapse — not established by any device record; never derived here.
import { createIncidentFixture } from '@scenebrief/fixtures';
import type { ContextFact, WearableRecord } from '@scenebrief/contracts';
import { clock } from '../../platform/time';

const fixture = createIncidentFixture('ehs-runner');

const dayFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/New_York', day: 'numeric', month: 'short', year: 'numeric' });
/** "24 Oct 2026" in the narrative zone. */
export const day = (iso: string) => dayFmt.format(new Date(iso));

const profileSource = fixture.sources.find(s => s.type === 'patient_profile')!;
const fact = (category: ContextFact['category']) => fixture.contextFacts.find(f => f.category === category && f.sourceIds.includes(profileSource.id));

/** Local, browser-only field value. "none" (patient said none) is distinct from "not_provided" (left blank). */
export type FieldValue = { state: 'provided'; text: string } | { state: 'none' } | { state: 'not_provided' };
export type FieldKey = 'age' | 'contact' | 'history' | 'medications' | 'allergies';
export interface Profile { name: string; fields: Record<FieldKey, FieldValue> }

const fromFact = (f: ContextFact | undefined): FieldValue => (f && f.state === 'documented' && f.value ? { state: 'provided', text: f.value } : { state: 'not_provided' });

/** The fixture's self-reported profile. The fixture has no emergency contact, so it starts "Not provided". */
export function seedProfile(): Profile {
  return {
    name: fixture.patient.name,
    fields: {
      age: fromFact(fact('age')),
      contact: fromFact(fact('witness_contact')),
      history: fromFact(fact('relevant_history')),
      medications: fromFact(fact('medication')),
      allergies: fromFact(fact('allergy'))
    }
  };
}

export const PROFILE_SOURCE = {
  label: profileSource.label,
  /** Profile event time = when the person last reviewed it (fixture text says so). */
  lastReviewed: profileSource.eventTime ? day(profileSource.eventTime) : null,
  limitation: profileSource.limitation
};

export const FIELD_LABEL: Record<FieldKey, string> = { age: 'Age', contact: 'Emergency contact', history: 'Medical history', medications: 'Medications', allergies: 'Allergies' };
export const FIELD_PLACEHOLDER: Record<FieldKey, string> = { age: 'e.g. 24 years', contact: 'Name, relationship, phone', history: 'Conditions a crew should know', medications: 'Name and dose, if you know it', allergies: 'Allergy and reaction' };

// ---- Devices: plain-text names with generic line icons. No integration exists for any of them. ----
export type DeviceId = 'apple' | 'whoop' | 'garmin' | 'oura';
export type DeviceIcon = 'watch' | 'band' | 'ring';
export const DEVICES: Record<DeviceId, { name: string; kind: string; icon: DeviceIcon }> = {
  apple: { name: 'Apple Watch', kind: 'Smartwatch', icon: 'watch' },
  whoop: { name: 'WHOOP', kind: 'Fitness band', icon: 'band' },
  garmin: { name: 'Garmin', kind: 'Sports watch', icon: 'watch' },
  oura: { name: 'Oura Ring', kind: 'Smart ring', icon: 'ring' }
};
export const DEVICE_ORDER: DeviceId[] = ['apple', 'whoop', 'garmin', 'oura'];

// ---- Readings ----
const METRIC_TITLE: Partial<Record<WearableRecord['metric'], string>> = {
  recovery: 'Overnight recovery', resting_heart_rate_deviation: 'Resting heart rate', workout: 'Outdoor run', pace: 'Pace change', fall_event: 'Fall detected'
};
/** Device events are things the device flagged, as opposed to activity or summaries. */
const DEVICE_EVENTS = new Set<WearableRecord['metric']>(['fall_event', 'pace']);

export interface ActivityItem { id: string; time: string; title: string; detail: string; limitation: string; deviceEvent: boolean }

// Skin-temperature deviation stays in the EMT wearable panel only; the patient app does not show it.
const activityRecords = fixture.wearableRecords
  .filter(w => METRIC_TITLE[w.metric])
  .sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? ''));

export const ACTIVITY: ActivityItem[] = activityRecords.map(w => ({
  id: w.id,
  time: w.startTime ? clock(w.startTime) : 'time not recorded',
  title: METRIC_TITLE[w.metric]!,
  detail: [w.summary, w.gaps].filter(Boolean).join(' '),
  limitation: w.limitation,
  deviceEvent: DEVICE_EVENTS.has(w.metric)
}));

/** Summary tiles: the workout plus records that carry a single value. */
export const TILES = activityRecords.filter(w => w.metric === 'workout' || w.value !== null).map(w => ({
  id: w.id,
  title: METRIC_TITLE[w.metric]!,
  value: w.metric === 'workout' ? `from ${w.startTime ? clock(w.startTime) : '—'}` : `${w.metric === 'resting_heart_rate_deviation' ? '+' : ''}${w.value} ${w.unit === '%' ? '%' : w.unit ?? ''}`.trim(),
  sub: w.metric === 'workout' ? (w.gaps ?? 'device time') : w.startTime && w.endTime ? `overnight · ${clock(w.startTime)}–${clock(w.endTime)} device time` : 'device time'
}));

const hrRecord = fixture.wearableRecords.find(w => w.metric === 'heart_rate');
export interface Sample { iso: string; time: string; value: number }
export const HEART_RATE = {
  unit: hrRecord?.unit ?? 'bpm',
  samples: (hrRecord?.samples ?? []).map(s => ({ iso: s.time, time: clock(s.time), value: s.value })) as Sample[],
  gaps: hrRecord?.gaps ?? null,
  limitation: hrRecord?.limitation ?? ''
};

const wearableSources = fixture.sources.filter(s => s.type === 'wearable');
const deviceTimes = [...activityRecords.map(w => w.startTime), ...HEART_RATE.samples.map(s => s.iso)].filter((t): t is string => !!t).sort();
const firstDay = deviceTimes[0] ? day(deviceTimes[0]) : null, lastDay = deviceTimes.at(-1) ? day(deviceTimes.at(-1)!) : null;
/** "23–24 Oct 2026" when readings span two days. */
function dayRange(a: string | null, b: string | null): string | null {
  if (!a || !b || a === b) return a ?? b;
  const [da, ...ra] = a.split(' '), [db, ...rb] = b.split(' ');
  return ra.join(' ') === rb.join(' ') ? `${da}–${db} ${rb.join(' ')}` : `${a} – ${b}`;
}
export const READINGS = {
  date: dayRange(firstDay, lastDay),
  firstTime: deviceTimes[0] ? clock(deviceTimes[0]) : null,
  lastTime: deviceTimes.at(-1) ? clock(deviceTimes.at(-1)!) : null,
  /** When the fixture's wearable sources entered the incident record. Not a sync time. */
  capturedIntoRecord: wearableSources[0] ? clock(wearableSources[0].capturedAt) : null,
  status: fixture.wearableStatus.note
};

export function chartSummary(samples: Sample[] = HEART_RATE.samples): string {
  if (samples.length === 0) return 'Heart rate: no samples.';
  const max = samples.reduce((a, b) => (b.value > a.value ? b : a));
  const min = Math.min(...samples.map(s => s.value));
  return `Heart rate, ${HEART_RATE.unit}, device time ${samples[0].time} to ${samples.at(-1)!.time}. ${samples.length} samples. Range ${min} to ${max.value} ${HEART_RATE.unit}; highest ${max.value} at ${max.time}.`;
}
