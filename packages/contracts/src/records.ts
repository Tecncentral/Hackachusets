import { z } from 'zod';

// Shared primitives. Event times are UTC ISO 8601 ("Z"); null means the time is unknown.
export const IsoTime = z.string().datetime();
export const RecordId = z.string().trim().min(1).max(120);
const Revision = z.number().int().nonnegative();
const ShortText = z.string().trim().min(1).max(200);
const LongText = z.string().trim().min(1).max(5000);
const Note = z.string().trim().min(1).max(1000);

export const SourceType = z.enum(['wearable', 'dispatch', 'voice', 'crew', 'patient_profile', 'weather']);
export const SourceSchema = z.object({
  id: RecordId,
  type: SourceType,
  label: z.string(),
  capturedAt: IsoTime,
  eventTime: IsoTime.nullable(),
  text: z.string(),
  // synthetic_fixture: pre-generated demo data. crew_entry: entered during this session.
  origin: z.enum(['synthetic_fixture', 'crew_entry']),
  // What this source cannot establish (e.g. consumer device data is not core temperature).
  limitation: z.string().nullable(),
});

// Legacy claim model used by the scripted /transcripts flow.
export const ClaimSchema = z.object({ id: z.string(), field: z.enum(['account', 'discoveryTime', 'collapseTime']), value: z.string().nullable(), sourceIds: z.array(z.string()), status: z.enum(['reported', 'unknown', 'superseded']), recordedAt: IsoTime });

// Who asserted the information (the crew enters it either way).
export const Attribution = z.enum(['crew', 'witness', 'patient', 'bystander', 'device', 'dispatch', 'other']);
export const RecordStatus = z.enum(['current', 'superseded']);

const RecordMeta = {
  id: RecordId,
  status: RecordStatus,
  sourceIds: z.array(RecordId),
  recordedAt: IsoTime,
  recordedBy: z.string(),
  addedAtRevision: Revision,
  baseRevision: Revision,
};

// ---- Observations ---------------------------------------------------------
export const ObservationCategory = z.enum(['account', 'neurological', 'skin', 'general', 'reassessment', 'care_response']);
export const InputMode = z.enum(['typed', 'transcribed']);
export const ObservationFields = {
  text: LongText,
  observedAt: IsoTime.nullable(),
  category: ObservationCategory.default('general'),
  reportedBy: Attribution.default('crew'),
  // transcribed = produced by the assistant's transcription and reviewed by the crew before submission.
  inputMode: InputMode.default('typed'),
  sourceIds: z.array(RecordId).max(20).default([]),
};
export const ObservationSchema = z.object({
  ...RecordMeta,
  text: z.string(),
  observedAt: IsoTime.nullable(),
  category: ObservationCategory,
  reportedBy: Attribution,
  inputMode: InputMode,
  clarifiesFeedbackId: RecordId.nullable(),
});

// ---- Measurements ---------------------------------------------------------
export const MeasurementKind = z.enum(['body_temperature', 'skin_temperature', 'heart_rate', 'blood_pressure', 'respiratory_rate', 'spo2', 'glucose']);
export const MeasurementUnit = z.enum(['°C', '°F', 'bpm', 'mmHg', 'breaths/min', '%', 'mg/dL', 'mmol/L']);
// Body temperature sites only. Consumer/wearable skin readings must use kind "skin_temperature".
export const TemperatureSite = z.enum(['rectal', 'esophageal', 'oral', 'tympanic', 'temporal_artery', 'axillary', 'unknown']);
// before_cooling: no cooling had started. during_cooling: cooling in progress. after_cooling: cooling had stopped.
export const CoolingPhase = z.enum(['before_cooling', 'during_cooling', 'after_cooling', 'unknown']);
export const DeviceClass = z.enum(['clinical', 'consumer', 'unknown']);

const UNITS: Record<z.infer<typeof MeasurementKind>, readonly string[]> = {
  body_temperature: ['°C', '°F'], skin_temperature: ['°C', '°F'], heart_rate: ['bpm'], blood_pressure: ['mmHg'],
  respiratory_rate: ['breaths/min'], spo2: ['%'], glucose: ['mg/dL', 'mmol/L'],
};
// Physical plausibility bounds to catch unit and typing errors. These are NOT clinical thresholds.
const BOUNDS: Record<string, [number, number]> = {
  '°C': [15, 50], '°F': [59, 122], bpm: [0, 300], mmHg: [0, 350], 'breaths/min': [0, 100], '%': [0, 100], 'mg/dL': [0, 2000], 'mmol/L': [0, 120],
};

export const MeasurementFields = {
  kind: MeasurementKind,
  value: z.number(),
  diastolic: z.number().nullable().default(null),
  unit: MeasurementUnit,
  site: TemperatureSite.nullable().default(null),
  device: ShortText.nullable().default(null),
  observer: ShortText.nullable().default(null),
  deviceClass: DeviceClass.default('unknown'),
  measuredAt: IsoTime.nullable(),
  coolingPhase: CoolingPhase.default('unknown'),
  note: Note.nullable().default(null),
  sourceIds: z.array(RecordId).max(20).default([]),
};
type MeasurementShape = { kind: string; value: number; diastolic: number | null; unit: string; site: string | null };
export function checkMeasurement(m: MeasurementShape, ctx: z.RefinementCtx) {
  const kind = m.kind as z.infer<typeof MeasurementKind>;
  if (!UNITS[kind].includes(m.unit)) ctx.addIssue({ code: 'custom', path: ['unit'], message: `Unit ${m.unit} is not valid for ${kind}. Use ${UNITS[kind].join(' or ')}.` });
  const [min, max] = BOUNDS[m.unit] ?? [-Infinity, Infinity];
  if (m.value < min || m.value > max) ctx.addIssue({ code: 'custom', path: ['value'], message: `Value ${m.value} ${m.unit} is outside the plausible range ${min}–${max}. Check the unit.` });
  if (kind === 'blood_pressure') {
    if (m.diastolic === null) ctx.addIssue({ code: 'custom', path: ['diastolic'], message: 'Blood pressure needs a diastolic value.' });
    else if (m.diastolic < min || m.diastolic > max) ctx.addIssue({ code: 'custom', path: ['diastolic'], message: 'Diastolic value is outside the plausible range.' });
  } else if (m.diastolic !== null) ctx.addIssue({ code: 'custom', path: ['diastolic'], message: 'Only blood pressure has a diastolic value.' });
  if (kind === 'body_temperature' && m.site === null) ctx.addIssue({ code: 'custom', path: ['site'], message: 'Body temperature needs a measurement site. Use "unknown" if it was not recorded.' });
  if (kind !== 'body_temperature' && m.site !== null) ctx.addIssue({ code: 'custom', path: ['site'], message: 'Site applies to body temperature only.' });
}
export const MeasurementSchema = z.object({
  ...RecordMeta,
  kind: MeasurementKind,
  value: z.number(),
  diastolic: z.number().nullable(),
  unit: MeasurementUnit,
  site: TemperatureSite.nullable(),
  device: z.string().nullable(),
  observer: z.string().nullable(),
  deviceClass: DeviceClass,
  measuredAt: IsoTime.nullable(),
  coolingPhase: CoolingPhase,
  note: z.string().nullable(),
}).superRefine(checkMeasurement);

// ---- Care events ----------------------------------------------------------
export const CareKind = z.enum(['cooling', 'oxygen', 'airway', 'vascular_access', 'fluids', 'medication', 'positioning', 'other']);
export const CoolingMethod = z.enum(['cold_water_immersion', 'ice_water_towels', 'ice_packs', 'evaporative_fanning', 'other']);
export const Performance = z.enum(['performed', 'not_performed', 'unknown']);
export const CareEventFields = {
  kind: CareKind,
  description: ShortText,
  performance: Performance.default('performed'),
  coolingMethod: CoolingMethod.nullable().default(null),
  startedAt: IsoTime.nullable(),
  endedAt: IsoTime.nullable().default(null),
  performedBy: ShortText.nullable().default(null),
  response: Note.nullable().default(null),
  sourceIds: z.array(RecordId).max(20).default([]),
};
type CareShape = { kind: string; performance: string; coolingMethod: string | null; startedAt: string | null; endedAt: string | null };
export function checkCareEvent(c: CareShape, ctx: z.RefinementCtx) {
  if (c.kind !== 'cooling' && c.coolingMethod !== null) ctx.addIssue({ code: 'custom', path: ['coolingMethod'], message: 'coolingMethod applies to cooling events only.' });
  if (c.performance === 'not_performed' && (c.startedAt !== null || c.endedAt !== null)) ctx.addIssue({ code: 'custom', path: ['startedAt'], message: 'A care action that was not performed has no start or end time.' });
  if (c.startedAt && c.endedAt && Date.parse(c.endedAt) < Date.parse(c.startedAt)) ctx.addIssue({ code: 'custom', path: ['endedAt'], message: 'endedAt is before startedAt.' });
}
export const CareEventSchema = z.object({
  ...RecordMeta,
  kind: CareKind,
  description: z.string(),
  performance: Performance,
  coolingMethod: CoolingMethod.nullable(),
  startedAt: IsoTime.nullable(),
  endedAt: IsoTime.nullable(),
  performedBy: z.string().nullable(),
  response: z.string().nullable(),
}).superRefine(checkCareEvent);

// ---- Timeline -------------------------------------------------------------
export const TimelineKind = z.enum(['exertion_start', 'exertion_end', 'symptom_onset', 'last_known_normal', 'collapse', 'discovery', 'device_fall_event', 'emergency_call', 'crew_arrival', 'patient_contact', 'transport_start', 'hospital_arrival', 'handoff']);
export const TimeCertainty = z.enum(['recorded', 'approximate', 'unknown']);
export const TimelineEventFields = {
  kind: TimelineKind,
  time: IsoTime.nullable(),
  certainty: TimeCertainty,
  reportedBy: Attribution.default('crew'),
  note: Note.nullable().default(null),
  sourceIds: z.array(RecordId).max(20).default([]),
};
export function checkTimeline(t: { time: string | null; certainty: string }, ctx: z.RefinementCtx) {
  if ((t.certainty === 'unknown') !== (t.time === null)) ctx.addIssue({ code: 'custom', path: ['certainty'], message: 'Use certainty "unknown" exactly when time is null.' });
}
export const TimelineEventSchema = z.object({
  ...RecordMeta,
  kind: TimelineKind,
  time: IsoTime.nullable(),
  certainty: TimeCertainty,
  reportedBy: Attribution,
  note: z.string().nullable(),
}).superRefine(checkTimeline);

// ---- Context facts (identity, history, exertion) --------------------------
export const ContextCategory = z.enum(['age', 'sex', 'relevant_history', 'allergy', 'medication', 'witness_contact', 'activity', 'exertion_duration', 'exertion_intensity', 'location', 'clothing_equipment', 'acclimatization', 'loss_of_consciousness', 'other']);
export const FactState = z.enum(['documented', 'unknown']);
export const ContextFactFields = {
  category: ContextCategory,
  value: ShortText.nullable(),
  state: FactState,
  reportedBy: Attribution.default('crew'),
  note: Note.nullable().default(null),
  sourceIds: z.array(RecordId).max(20).default([]),
};
export function checkFact(f: { value: string | null; state: string }, ctx: z.RefinementCtx) {
  if ((f.state === 'unknown') !== (f.value === null)) ctx.addIssue({ code: 'custom', path: ['state'], message: 'Use state "unknown" exactly when value is null.' });
}
export const ContextFactSchema = z.object({
  ...RecordMeta,
  category: ContextCategory,
  value: z.string().nullable(),
  state: FactState,
  reportedBy: Attribution,
  note: z.string().nullable(),
}).superRefine(checkFact);

// ---- Environment (never body temperature) ---------------------------------
export const EnvironmentKind = z.enum(['ambient_temperature', 'relative_humidity', 'wbgt']);
const ENV_BOUNDS: Record<string, [number, number]> = { '°C': [-60, 60], '°F': [-76, 140], '%': [0, 100] };
export const EnvironmentMethod = z.enum(['weather_service', 'onsite_meter', 'reported', 'unknown']);
export const EnvironmentReadingFields = {
  kind: EnvironmentKind,
  value: z.number(),
  unit: z.enum(['°C', '°F', '%']),
  measuredAt: IsoTime.nullable(),
  location: ShortText.nullable().default(null),
  method: EnvironmentMethod.default('unknown'),
  sourceIds: z.array(RecordId).max(20).default([]),
};
export function checkEnvironment(e: { kind: string; unit: string; value: number }, ctx: z.RefinementCtx) {
  const humidity = e.kind === 'relative_humidity';
  if (humidity !== (e.unit === '%')) ctx.addIssue({ code: 'custom', path: ['unit'], message: humidity ? 'Relative humidity uses %.' : 'Temperatures use °C or °F.' });
  const [min, max] = ENV_BOUNDS[e.unit] ?? [-Infinity, Infinity];
  if (e.value < min || e.value > max) ctx.addIssue({ code: 'custom', path: ['value'], message: `Value ${e.value} ${e.unit} is outside the plausible range ${min}–${max}. Check the unit.` });
}
export const EnvironmentReadingSchema = z.object({
  ...RecordMeta,
  kind: EnvironmentKind,
  value: z.number(),
  unit: z.enum(['°C', '°F', '%']),
  measuredAt: IsoTime.nullable(),
  location: z.string().nullable(),
  method: EnvironmentMethod,
}).superRefine(checkEnvironment);

// ---- Optional consumer wearable background --------------------------------
export const WearableMetric = z.enum(['workout', 'heart_rate', 'pace', 'fall_event', 'resting_heart_rate_deviation', 'recovery', 'hrv', 'skin_temperature_deviation']);
export const WearableRecordSchema = z.object({
  id: RecordId,
  sourceId: RecordId,
  metric: WearableMetric,
  startTime: IsoTime.nullable(),
  endTime: IsoTime.nullable(),
  value: z.number().nullable(),
  unit: z.string().nullable(),
  samples: z.array(z.object({ time: IsoTime, value: z.number() })),
  summary: z.string(),
  limitation: z.string(),
  gaps: z.string().nullable(),
  consumerDevice: z.literal(true),
});
export const WearableStatusSchema = z.object({ availability: z.enum(['available', 'partial', 'unavailable']), note: z.string() });

export type SourceRecord = z.infer<typeof SourceSchema>;
export type Claim = z.infer<typeof ClaimSchema>;
export type Observation = z.infer<typeof ObservationSchema>;
export type Measurement = z.infer<typeof MeasurementSchema>;
export type CareEvent = z.infer<typeof CareEventSchema>;
export type TimelineEvent = z.infer<typeof TimelineEventSchema>;
export type ContextFact = z.infer<typeof ContextFactSchema>;
export type EnvironmentReading = z.infer<typeof EnvironmentReadingSchema>;
export type WearableRecord = z.infer<typeof WearableRecordSchema>;
export type WearableStatus = z.infer<typeof WearableStatusSchema>;
