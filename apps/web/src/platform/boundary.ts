// UI-side schemas for the shared logical boundary (docs/kickoff-prompts/03-emt-website.md).
// The core platform owns the canonical schemas. Until they are published on main, these extend the
// canonical `IncidentSchema` with OPTIONAL collections so the website validates today's platform
// responses unchanged and tomorrow's richer ones. Differences are recorded in docs/handoffs/emt-website.md.
import { z } from 'zod';
import { IncidentSchema, HandoffSchema, SourceSchema } from '@scenebrief/contracts';

const iso = z.string().datetime();
const isoOrNull = iso.nullable();

export const ObservationCategory = z.enum(['account', 'mental_status', 'skin', 'exertion', 'environment', 'history', 'general']);
export const ObservationSchema = z.object({
  id: z.string(),
  text: z.string(),
  category: ObservationCategory.default('general'),
  observedAt: isoOrNull,
  capturedAt: iso,
  sourceId: z.string(),
  author: z.string().default('crew'),
  inputMode: z.enum(['typed', 'voice-reviewed', 'example', 'legacy']).default('typed'),
  status: z.enum(['active', 'clarified']).default('active'),
  baseRevision: z.number().int().nonnegative().nullable().default(null)
});

export const MeasurementKind = z.enum(['temperature', 'heartRate', 'bloodPressure', 'respiratoryRate', 'spo2', 'glucose', 'ambientTemperature', 'humidity', 'skinTemperatureDeviation']);
export const CoolingPhase = z.enum(['before', 'during', 'after', 'unknown']);
export const MeasurementSchema = z.object({
  id: z.string(),
  kind: MeasurementKind,
  status: z.enum(['obtained', 'not_obtained']),
  value: z.number().nullable(),
  /** Second value where needed (diastolic BP). */
  value2: z.number().nullable().default(null),
  unit: z.string(),
  /** Method/site, e.g. "rectal", "oral", "tympanic", "temporal", "axillary"; null = not documented. */
  method: z.string().nullable(),
  eventTime: isoOrNull,
  capturedAt: iso,
  coolingPhase: CoolingPhase,
  /** manual = entered by crew (no device connection implied); wearable = consumer device record; reference = external context such as weather. */
  sourceKind: z.enum(['manual', 'wearable', 'reference']),
  device: z.string().nullable(),
  recordedBy: z.string(),
  note: z.string().nullable(),
  sourceId: z.string(),
  synthetic: z.boolean().default(false)
});

export const CareCategory = z.enum(['cooling', 'airway', 'iv_access', 'medication', 'positioning', 'transport', 'other']);
export const CareEventSchema = z.object({
  id: z.string(),
  category: CareCategory,
  action: z.string(),
  startedAt: isoOrNull,
  endedAt: isoOrNull,
  note: z.string().nullable(),
  recordedBy: z.string(),
  capturedAt: iso,
  sourceId: z.string()
});

export const TimeKind = z.enum(['activityStart', 'activityEnd', 'symptomOnset', 'lastKnownWell', 'discovery', 'collapse', 'deviceFall', 'call', 'arrival', 'transport', 'handoff']);
export const TimeCertainty = z.enum(['recorded', 'reported', 'estimated', 'unknown']);
export const TimelineEventSchema = z.object({
  id: z.string(),
  kind: TimeKind,
  time: isoOrNull,
  certainty: TimeCertainty,
  note: z.string().nullable(),
  sourceIds: z.array(z.string()),
  capturedAt: iso
});

export const KnowledgeReferenceSchema = z.object({
  id: z.string(), title: z.string(), url: z.string().url(), version: z.string(), passage: z.string(),
  applicability: z.string(), reviewStatus: z.string()
});

export const FeedbackResolutionSchema = z.object({
  action: z.enum(['clarify', 'dismiss', 'defer']),
  text: z.string().nullable(),
  recordedAt: iso,
  author: z.string(),
  revision: z.number().int().nonnegative(),
  replacementObservationId: z.string().nullable().default(null)
});
export const FeedbackSchema = z.object({
  id: z.string(),
  /** Incident revision the assistant evaluated. */
  revision: z.number().int().nonnegative(),
  kind: z.enum(['conflict', 'missing_context', 'unsupported_inference']),
  message: z.string(),
  suggestedQuestion: z.string().nullable(),
  observationIds: z.array(z.string()),
  evidenceSourceIds: z.array(z.string()),
  knowledgeReferenceIds: z.array(z.string()),
  spokenSummary: z.string().nullable(),
  mode: z.string().default('unknown'),
  status: z.enum(['open', 'clarified', 'dismissed', 'deferred']).default('open'),
  resolution: FeedbackResolutionSchema.nullable().default(null)
});

export const ObservationCorrectionSchema = z.object({
  id: z.string(), originalObservationId: z.string(), replacementObservationId: z.string(),
  feedbackId: z.string().nullable(), author: z.string(), recordedAt: iso
});

export const DraftItemSchema = z.object({ text: z.string(), sourceIds: z.array(z.string()).default([]), note: z.string().nullable().default(null) });
export const DraftSectionSchema = z.object({ id: z.string(), title: z.string(), items: z.array(DraftItemSchema) });
export const UncertaintySchema = z.object({ label: z.string(), state: z.enum(['unknown', 'not_documented', 'not_obtained', 'unresolved']), detail: z.string().nullable().default(null) });
export const HandoffDraftSchema = z.object({
  revision: z.number().int().nonnegative(),
  sections: z.array(DraftSectionSchema),
  sourceIds: z.array(z.string()),
  uncertainties: z.array(UncertaintySchema),
  /** platform = served by GET /handoff-draft; website-grouped = grouped in the browser because that endpoint is unavailable. */
  mode: z.enum(['platform', 'website-grouped']).default('platform')
});

export const WorkspaceHandoffSchema = HandoffSchema.extend({ draft: HandoffDraftSchema.optional() });

export const PatientContextSchema = z.object({
  age: z.string().nullable().default(null), history: z.string().nullable().default(null),
  allergies: z.string().nullable().default(null), medications: z.string().nullable().default(null),
  contact: z.string().nullable().default(null)
});

/** Canonical source plus provisional types for crew-entered and reference records (proposal; see handoff doc). */
export const WorkspaceSourceSchema = SourceSchema.extend({ type: z.enum(['wearable', 'dispatch', 'voice', 'crew', 'reference']) });

export const WorkspaceIncidentSchema = IncidentSchema.extend({
  sources: z.array(WorkspaceSourceSchema),
  patient: IncidentSchema.shape.patient.extend({ context: PatientContextSchema.optional() }),
  handoffs: z.array(WorkspaceHandoffSchema),
  observations: z.array(ObservationSchema).default([]),
  measurements: z.array(MeasurementSchema).default([]),
  careEvents: z.array(CareEventSchema).default([]),
  timelineEvents: z.array(TimelineEventSchema).default([]),
  feedback: z.array(FeedbackSchema).default([]),
  knowledgeReferences: z.array(KnowledgeReferenceSchema).default([]),
  observationCorrections: z.array(ObservationCorrectionSchema).default([])
});

export const TranscriptionSchema = z.object({ transcript: z.string(), mode: z.string(), warnings: z.array(z.string()).default([]) });

export type Observation = z.infer<typeof ObservationSchema>;
export type Measurement = z.infer<typeof MeasurementSchema>;
export type CareEvent = z.infer<typeof CareEventSchema>;
export type TimelineEvent = z.infer<typeof TimelineEventSchema>;
export type Feedback = z.infer<typeof FeedbackSchema>;
export type KnowledgeReference = z.infer<typeof KnowledgeReferenceSchema>;
export type HandoffDraft = z.infer<typeof HandoffDraftSchema>;
export type DraftSection = z.infer<typeof DraftSectionSchema>;
export type WorkspaceIncident = z.infer<typeof WorkspaceIncidentSchema>;
export type WorkspaceHandoff = z.infer<typeof WorkspaceHandoffSchema>;
export type Transcription = z.infer<typeof TranscriptionSchema>;
export type WorkspaceSource = z.infer<typeof WorkspaceSourceSchema>;
export type MeasurementKindT = z.infer<typeof MeasurementKind>;
export type TimeKindT = z.infer<typeof TimeKind>;

// ---- Requests (logical boundary) ----
export interface Mutation { requestId: string; baseRevision: number }
export interface ObservationInput extends Mutation { text: string; observedAt: string | null; category: Observation['category']; inputMode: Observation['inputMode'] }
export type MeasurementInput = Mutation & Omit<Measurement, 'id' | 'capturedAt' | 'sourceId' | 'synthetic'>;
export type CareEventInput = Mutation & Omit<CareEvent, 'id' | 'capturedAt' | 'sourceId'>;
export type TimelineEventInput = Mutation & Omit<TimelineEvent, 'id' | 'capturedAt' | 'sourceIds'>;
export interface ResolutionInput extends Mutation { feedbackId: string; action: 'clarify' | 'dismiss' | 'defer'; clarificationText?: string }
export interface ApproveInput { revision: number; reviewedBy: string }

export type PlatformErrorKind = 'unavailable' | 'conflict' | 'forbidden' | 'invalid' | 'not_found' | 'network' | 'server';
export class PlatformError extends Error {
  constructor(public kind: PlatformErrorKind, message: string, public endpoint: string, public status: number | null = null) { super(message); this.name = 'PlatformError'; }
}
export function errorMessage(e: unknown): string {
  if (e instanceof PlatformError) return e.message;
  return e instanceof Error ? e.message : String(e);
}
