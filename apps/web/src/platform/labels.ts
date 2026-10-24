// Display labels and small pure helpers for canonical records. These are UI wording only; record
// meaning comes from the contract (docs/core-api-contract.md). The handoff itself is built by the
// platform (GET /handoff-draft) — the website never re-groups records into its own handoff.
import type { CareEvent, Measurement, Observation, SourceRecord, TimelineEvent, Uncertainty, HandoffItem } from './boundary';
import { clock } from './time';

export const MEASUREMENT_LABEL: Record<Measurement['kind'], string> = {
  body_temperature: 'Body temperature', skin_temperature: 'Skin temperature (not core)', heart_rate: 'Heart rate',
  blood_pressure: 'Blood pressure', respiratory_rate: 'Respiratory rate', spo2: 'SpO₂', glucose: 'Glucose'
};
/** Clinical measurement kinds shown as vitals. Skin temperature is never a clinical temperature. */
export const CLINICAL_KINDS: Measurement['kind'][] = ['body_temperature', 'heart_rate', 'blood_pressure', 'respiratory_rate', 'spo2', 'glucose'];
export const UNITS: Record<Measurement['kind'], Measurement['unit'][]> = {
  body_temperature: ['°C', '°F'], skin_temperature: ['°C', '°F'], heart_rate: ['bpm'], blood_pressure: ['mmHg'],
  respiratory_rate: ['breaths/min'], spo2: ['%'], glucose: ['mg/dL', 'mmol/L']
};
export const SITE_LABEL: Record<NonNullable<Measurement['site']>, string> = {
  rectal: 'Rectal', esophageal: 'Esophageal', oral: 'Oral', tympanic: 'Tympanic', temporal_artery: 'Temporal artery', axillary: 'Axillary', unknown: 'Site/method unknown'
};
export const COOLING_LABEL: Record<Measurement['coolingPhase'], string> = {
  before_cooling: 'before cooling', during_cooling: 'during cooling', after_cooling: 'after cooling', unknown: 'cooling phase not recorded'
};
export const TIME_LABEL: Record<TimelineEvent['kind'], string> = {
  exertion_start: 'Exertion started', exertion_end: 'Exertion stopped', symptom_onset: 'Symptom onset', last_known_normal: 'Last known normal',
  collapse: 'Collapse', discovery: 'Found (discovery)', device_fall_event: 'Device-reported fall', emergency_call: 'Emergency call',
  crew_arrival: 'Crew arrival', patient_contact: 'Patient contact', transport_start: 'Transport start', hospital_arrival: 'Hospital arrival', handoff: 'Handoff'
};
export const CERTAINTY_LABEL: Record<TimelineEvent['certainty'], string> = { recorded: 'Recorded', approximate: 'Approximate', unknown: 'Unknown' };
export const OBS_LABEL: Record<Observation['category'], string> = {
  account: 'Witness / account', neurological: 'Mental status / neurological', skin: 'Skin', general: 'General', reassessment: 'Reassessment', care_response: 'Response to care'
};
export const REPORTED_BY_LABEL: Record<Observation['reportedBy'], string> = {
  crew: 'Crew', witness: 'Witness', patient: 'Patient', bystander: 'Bystander', device: 'Device', dispatch: 'Dispatch', other: 'Other'
};
export const CARE_LABEL: Record<CareEvent['kind'], string> = {
  cooling: 'Cooling', oxygen: 'Oxygen', airway: 'Airway', vascular_access: 'IV / IO access', fluids: 'Fluids', medication: 'Medication', positioning: 'Positioning', other: 'Other'
};
export const COOLING_METHOD_LABEL: Record<NonNullable<CareEvent['coolingMethod']>, string> = {
  cold_water_immersion: 'Cold-water immersion', ice_water_towels: 'Ice-water towels', ice_packs: 'Ice packs', evaporative_fanning: 'Evaporative / fanning', other: 'Other method'
};
export const SOURCE_TYPE_LABEL: Record<SourceRecord['type'], string> = {
  wearable: 'Consumer wearable · background', dispatch: 'Dispatch · simulated', voice: 'Voice note', crew: 'Crew entry', patient_profile: 'Patient profile · self-reported', weather: 'Weather · environmental'
};
export const UNCERTAINTY_LABEL: Record<Uncertainty['state'], string> = { unknown: 'Unknown', not_documented: 'Not documented', approximate: 'Approximate', conflicting: 'Conflicting' };
export const UNCERTAINTY_CHIP: Record<Uncertainty['state'], string> = { unknown: 'chip-unknown', not_documented: 'chip-notdoc', approximate: 'chip-attn', conflicting: 'chip-crit' };
export const ITEM_STATE_LABEL: Record<HandoffItem['state'], string> = { documented: 'Documented', reported: 'Reported', unknown: 'Unknown', not_documented: 'Not documented', superseded: 'Superseded' };

export const current = <T extends { status: string }>(records: T[]): T[] => records.filter(r => r.status === 'current');

export function formatValue(m: Pick<Measurement, 'kind' | 'value' | 'diastolic' | 'unit'>): string {
  if (m.kind === 'blood_pressure') return `${m.value}/${m.diastolic ?? '?'} mmHg`;
  return m.unit === '%' ? `${m.value}%` : `${m.value} ${m.unit}`;
}

export type PhaseLabel = { phase: Measurement['coolingPhase'] | 'no-time'; label: string; derived: boolean };
const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);

/**
 * Cooling phase of a reading. The crew's explicit entry wins. Otherwise it is placed relative to
 * performed cooling care events by time ("from cooling times"), as the platform handoff does.
 */
export function phaseOf(m: Measurement, care: CareEvent[] = []): PhaseLabel {
  if (m.coolingPhase !== 'unknown') return { phase: m.coolingPhase, label: cap(COOLING_LABEL[m.coolingPhase]), derived: false };
  const cooling = current(care).filter(c => c.kind === 'cooling' && c.performance === 'performed' && c.startedAt);
  if (cooling.length === 0) return { phase: 'unknown', label: 'Cooling phase not recorded', derived: false };
  if (!m.measuredAt) return { phase: 'no-time', label: 'Time not recorded', derived: false };
  const t = Date.parse(m.measuredAt);
  const derived = (p: Measurement['coolingPhase']) => ({ phase: p, label: `${cap(COOLING_LABEL[p])} (from cooling times)`, derived: true });
  if (t < Math.min(...cooling.map(c => Date.parse(c.startedAt!)))) return derived('before_cooling');
  if (cooling.some(c => t >= Date.parse(c.startedAt!) && (c.endedAt === null || t <= Date.parse(c.endedAt)))) return derived('during_cooling');
  return derived('after_cooling');
}

export function describeCare(c: CareEvent): string {
  if (c.performance === 'not_performed') return `${c.description} — not performed`;
  const span = c.startedAt ? `${clock(c.startedAt)}–${c.endedAt ? clock(c.endedAt) : 'ongoing / stop not recorded'}` : 'start not recorded';
  return `${c.description}${c.coolingMethod ? ` (${COOLING_METHOD_LABEL[c.coolingMethod].toLowerCase()})` : ''} · ${span}${c.performance === 'unknown' ? ' · whether performed is unknown' : ''}`;
}

/** Latest current entry of a timeline kind. */
export function latestTime(events: TimelineEvent[], kind: TimelineEvent['kind']): TimelineEvent | undefined {
  return current(events).filter(e => e.kind === kind).at(-1);
}
