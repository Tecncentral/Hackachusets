import type { Measurement, CareEvent, TimelineEvent, ContextFact, EnvironmentReading, Observation } from '@scenebrief/contracts';

// Deterministic plain-language rendering of records. Used for source text and the handoff.
export const TIME_ZONE = 'America/New_York';
const timeFormat = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZoneName: 'short' });
const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });

export function localDay(iso: string): string { return dayFormat.format(new Date(iso)); }

/** "10:44 EDT", or "2026-10-23 22:15 EDT" when the day differs from the reference day. */
export function formatTime(iso: string | null, referenceDay?: string | null): string {
  if (!iso) return 'time unknown';
  const time = timeFormat.format(new Date(iso));
  const day = localDay(iso);
  return referenceDay && day === referenceDay ? time : `${day} ${time}`;
}

export const MEASUREMENT_LABEL: Record<Measurement['kind'], string> = {
  body_temperature: 'Body temperature', skin_temperature: 'Skin temperature (not core temperature)', heart_rate: 'Heart rate',
  blood_pressure: 'Blood pressure', respiratory_rate: 'Respiratory rate', spo2: 'SpO2', glucose: 'Glucose',
};
export const PHASE_LABEL: Record<Measurement['coolingPhase'], string> = {
  before_cooling: 'before cooling started', during_cooling: 'during cooling', after_cooling: 'after cooling stopped', unknown: 'relation to cooling not recorded',
};
const SITE_LABEL: Record<NonNullable<Measurement['site']>, string> = {
  rectal: 'rectal', esophageal: 'esophageal', oral: 'oral', tympanic: 'tympanic', temporal_artery: 'temporal artery', axillary: 'axillary', other: 'other site', unknown: 'site/method unknown',
};

export function measurementValue(m: Pick<Measurement, 'kind' | 'obtained' | 'value' | 'diastolic' | 'unit'>): string {
  if (!m.obtained) return 'not obtained';
  if (m.kind === 'blood_pressure') return `${m.value}/${m.diastolic} mmHg`;
  return m.unit === '%' ? `${m.value}%` : `${m.value} ${m.unit}`;
}

export function describeMeasurement(m: Omit<Measurement, 'id' | 'status' | 'sourceIds' | 'recordedAt' | 'recordedBy' | 'addedAtRevision' | 'baseRevision'>, day?: string | null): string {
  if (!m.obtained) return [`${MEASUREMENT_LABEL[m.kind]}: not obtained (crew recorded it was not done)`, m.measuredAt ? `at ${formatTime(m.measuredAt, day)}` : null, m.note].filter(Boolean).join(' — ');
  const parts = [`${MEASUREMENT_LABEL[m.kind]} ${measurementValue(m)}`];
  if (m.site) parts.push(SITE_LABEL[m.site]);
  parts.push(m.measuredAt ? `at ${formatTime(m.measuredAt, day)}` : 'time unknown');
  parts.push(PHASE_LABEL[m.coolingPhase]);
  const by = [m.device, m.observer && `by ${m.observer}`].filter(Boolean).join(', ');
  if (by) parts.push(by);
  if (m.deviceClass === 'consumer') parts.push('consumer device');
  if (m.note) parts.push(m.note);
  return parts.join(' — ');
}

const CARE_LABEL: Record<CareEvent['kind'], string> = {
  cooling: 'Cooling', oxygen: 'Oxygen', airway: 'Airway', vascular_access: 'Vascular access', fluids: 'Fluids', medication: 'Medication', positioning: 'Positioning', other: 'Care action',
};
const COOLING_LABEL: Record<NonNullable<CareEvent['coolingMethod']>, string> = {
  cold_water_immersion: 'cold-water immersion', ice_water_towels: 'ice-water towels', ice_packs: 'ice packs', evaporative_fanning: 'evaporative fanning', other: 'other method',
};

export function describeCareEvent(c: Pick<CareEvent, 'kind' | 'description' | 'performance' | 'coolingMethod' | 'startedAt' | 'endedAt' | 'performedBy' | 'response'>, day?: string | null): string {
  const head = `${CARE_LABEL[c.kind]}: ${c.description}${c.coolingMethod ? ` (${COOLING_LABEL[c.coolingMethod]})` : ''}`;
  if (c.performance === 'not_performed') return `${head} — not performed`;
  const status = c.performance === 'unknown' ? 'whether performed is unknown' : 'performed';
  const when = c.startedAt ? `${formatTime(c.startedAt, day)}–${c.endedAt ? formatTime(c.endedAt, day) : 'end not recorded'}` : 'start time unknown';
  const parts = [head, status, when];
  if (c.performedBy) parts.push(`by ${c.performedBy}`);
  parts.push(c.response ? `Response: ${c.response}` : 'Response not documented');
  return parts.join(' — ');
}

export const TIMELINE_LABEL: Record<TimelineEvent['kind'], string> = {
  exertion_start: 'Exertion start', exertion_end: 'Exertion end', symptom_onset: 'Symptom onset', last_known_normal: 'Last known normal',
  collapse: 'Collapse', discovery: 'Discovery (patient found)', device_fall_event: 'Device-reported fall event', emergency_call: 'Emergency call',
  crew_arrival: 'Crew arrival', patient_contact: 'Patient contact', transport_start: 'Transport start', hospital_arrival: 'Hospital arrival', handoff: 'Handoff',
};
const ATTRIBUTION_LABEL: Record<TimelineEvent['reportedBy'], string> = {
  crew: 'crew', witness: 'witness', patient: 'patient', bystander: 'bystander', device: 'device', dispatch: 'dispatch', other: 'other',
};

export function describeTimelineEvent(t: Pick<TimelineEvent, 'kind' | 'time' | 'certainty' | 'reportedBy' | 'note'>, day?: string | null): string {
  const when = t.certainty === 'unknown' ? 'Time unknown' : `${t.certainty === 'approximate' ? '~' : ''}${formatTime(t.time, day)}`;
  return `${when} — ${TIMELINE_LABEL[t.kind]} (${t.certainty}; ${ATTRIBUTION_LABEL[t.reportedBy]})${t.note ? ` — ${t.note}` : ''}`;
}

export const FACT_LABEL: Record<ContextFact['category'], string> = {
  age: 'Age', sex: 'Sex', relevant_history: 'Relevant history', allergy: 'Allergies', medication: 'Medications', witness_contact: 'Witness/contact',
  activity: 'Activity', exertion_duration: 'Exertion duration', exertion_intensity: 'Exertion intensity', location: 'Location',
  clothing_equipment: 'Clothing/equipment', acclimatization: 'Acclimatization', loss_of_consciousness: 'Loss of consciousness', other: 'Other context',
};
export function describeFact(f: Pick<ContextFact, 'category' | 'value' | 'state' | 'reportedBy' | 'note'>): string {
  return `${FACT_LABEL[f.category]}: ${f.state === 'unknown' ? 'unknown' : f.value} (${ATTRIBUTION_LABEL[f.reportedBy]})${f.note ? ` — ${f.note}` : ''}`;
}

const ENV_LABEL: Record<EnvironmentReading['kind'], string> = { ambient_temperature: 'Air temperature', relative_humidity: 'Relative humidity', wbgt: 'Wet-bulb globe temperature' };
const ENV_METHOD: Record<EnvironmentReading['method'], string> = { weather_service: 'weather service', onsite_meter: 'on-site meter', reported: 'reported', unknown: 'method unknown' };
export function describeEnvironment(e: Pick<EnvironmentReading, 'kind' | 'value' | 'unit' | 'measuredAt' | 'location' | 'method'>, day?: string | null): string {
  const value = e.unit === '%' ? `${e.value}%` : `${e.value} ${e.unit}`;
  return [`${ENV_LABEL[e.kind]} ${value}`, e.measuredAt ? `at ${formatTime(e.measuredAt, day)}` : 'time unknown', ENV_METHOD[e.method], e.location, 'environmental reading, not body temperature'].filter(Boolean).join(' — ');
}

const REPORTER_LABEL: Record<Observation['reportedBy'], string> = {
  crew: 'Crew observation', witness: 'Witness report (relayed by crew)', patient: 'Patient report', bystander: 'Bystander report', device: 'Device report', dispatch: 'Dispatch report', other: 'Report',
};
export function describeObservation(o: Pick<Observation, 'text' | 'reportedBy' | 'observedAt' | 'inputMode'>, day?: string | null): string {
  const mode = o.inputMode === 'transcribed' ? ', transcribed and crew-reviewed' : '';
  return `${REPORTER_LABEL[o.reportedBy]}, ${o.observedAt ? formatTime(o.observedAt, day) : 'time not recorded'}${mode}: \u201c${o.text}\u201d`;
}
