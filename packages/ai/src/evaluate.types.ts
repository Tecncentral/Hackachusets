import { z } from 'zod';

// Shared logical contract for the assistant service. The PLATFORM owns canonical
// incident state; these shapes are the assistant's request/response seam only.
// Required vs. nullable fields are enforced here so units, timestamps, statuses,
// and uncertainty survive the round trip.

/** A crew observation handed to the assistant. The assistant never mutates it. */
export const ObservationInput = z.object({
  id: z.string().min(1),
  text: z.string(),
  observedAt: z.string().nullable(), // ISO; null = time unknown (distinct from absent)
  sourceIds: z.array(z.string()).default([]),
});
export type ObservationInput = z.infer<typeof ObservationInput>;

/** A measurement with the metadata that makes it interpretable. */
export const MeasurementInput = z.object({
  id: z.string().min(1),
  kind: z.enum([
    'temperature',
    'heartRate',
    'bloodPressure',
    'respiratoryRate',
    'spo2',
    'glucose',
    'ambientTemperature', // weather/context — never body temperature
    'humidity',
    'skinTemperatureDeviation', // consumer wearable — never core temperature
    'other',
  ]),
  value: z.string(), // kept as string to preserve "38.9" vs "102/64" without lossy parsing
  unit: z.string().nullable(),
  method: z.string().nullable(), // e.g. "rectal", "temporal", "consumer wearable skin"
  site: z.string().nullable(),
  eventTime: z.string().nullable(),
  beforeCooling: z.boolean().nullable(), // null = unknown, distinct from false
  sourceId: z.string().nullable(),
});
export type MeasurementInput = z.infer<typeof MeasurementInput>;

export const SourceInput = z.object({
  id: z.string().min(1),
  type: z.string(),
  label: z.string(),
  text: z.string().default(''),
});
export type SourceInput = z.infer<typeof SourceInput>;

export const CareEventInput = z.object({
  id: z.string().min(1),
  action: z.string(),
  startedAt: z.string().nullable(),
  stoppedAt: z.string().nullable(),
});
export type CareEventInput = z.infer<typeof CareEventInput>;

/** Key times. `time: null` with certainty `unknown` keeps an unknown time unknown. */
export const TimelineEventInput = z.object({
  id: z.string().min(1),
  kind: z.string(), // e.g. discovery, collapse, deviceFall, symptomOnset, lastKnownWell
  time: z.string().nullable(),
  certainty: z.enum(['recorded', 'reported', 'estimated', 'unknown']).default('unknown'),
  sourceIds: z.array(z.string()).default([]),
});
export type TimelineEventInput = z.infer<typeof TimelineEventInput>;

export const ProtocolContext = z.object({
  agency: z.string().nullable().default(null),
  protocolConfirmed: z.boolean().default(false), // true only when a human confirmed local applicability
});
export type ProtocolContext = z.infer<typeof ProtocolContext>;

export const EvaluateRequest = z
  .object({
    incidentId: z.string().min(1),
    revision: z.number().int().nonnegative(),
    observations: z.array(ObservationInput).default([]),
    measurements: z.array(MeasurementInput).default([]),
    sources: z.array(SourceInput).default([]),
    careEvents: z.array(CareEventInput).default([]),
    /** Optional. When absent, timing checks treat collapse/discovery as not documented. */
    timelineEvents: z.array(TimelineEventInput).optional(),
    protocolContext: ProtocolContext.optional(),
  })
  .strict();
export type EvaluateRequest = z.infer<typeof EvaluateRequest>;

export const FeedbackKind = z.enum([
  'conflict',
  'missing_context',
  'unsupported_inference',
]);
export type FeedbackKind = z.infer<typeof FeedbackKind>;

export const FeedbackItem = z.object({
  id: z.string().min(1),
  kind: FeedbackKind,
  message: z.string().min(1),
  suggestedQuestion: z.string().min(1),
  observationIds: z.array(z.string()).default([]),
  evidenceSourceIds: z.array(z.string()).default([]),
  knowledgeReferenceIds: z.array(z.string()).default([]),
  spokenSummary: z.string().min(1),
});
export type FeedbackItem = z.infer<typeof FeedbackItem>;

export type EvaluationMode =
  | 'rules-only' // deterministic evidence/rule checks (default, always available)
  | 'hybrid'; // rules + optional model phrasing (validated)

export const EvaluateResponse = z
  .object({
    incidentId: z.string(),
    revision: z.number().int().nonnegative(),
    mode: z.enum(['rules-only', 'hybrid']),
    feedback: z.array(FeedbackItem).default([]),
    /** Non-blocking notes (e.g. "model phrasing unavailable, used deterministic text"). */
    warnings: z.array(z.string()).default([]),
  })
  .strict();
export type EvaluateResponse = z.infer<typeof EvaluateResponse>;
