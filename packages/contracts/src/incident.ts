import { z } from 'zod';
import { IsoTime, RecordId, SourceSchema, ClaimSchema, ObservationSchema, MeasurementSchema, CareEventSchema, TimelineEventSchema, ContextFactSchema, EnvironmentReadingSchema, WearableRecordSchema, WearableStatusSchema } from './records.js';
import { AssistantFeedbackItemSchema, AssistantMode, KnowledgeReferenceSchema } from './assistant.js';
import { HandoffSchema } from './handoff.js';

export const IncidentId = 'runner-found-down';
export const ScenarioVariant = z.enum(['ehs-runner', 'ehs-runner-no-wearable']);
const Revision = z.number().int().nonnegative();

export const CorrectableType = z.enum(['claim', 'observation', 'measurement', 'careEvent', 'timelineEvent', 'contextFact', 'environmentReading']);
export const CorrectionSchema = z.object({
  id: RecordId,
  targetType: CorrectableType,
  originalId: RecordId,
  replacementId: RecordId,
  // Legacy aliases, present only for claim corrections from the scripted /transcripts flow.
  originalClaimId: z.string().optional(),
  replacementClaimId: z.string().optional(),
  author: z.string(),
  recordedAt: IsoTime,
  reason: z.string().nullable(),
  // Set when the correction came from the crew clarifying assistant feedback.
  feedbackId: RecordId.nullable(),
  revision: Revision,
});

export const FeedbackStatus = z.enum(['open', 'clarified', 'dismissed', 'deferred', 'stale']);
export const FeedbackSchema = AssistantFeedbackItemSchema.omit({ id: true }).extend({
  id: RecordId, // platform-assigned
  assistantItemId: RecordId,
  evaluationId: RecordId,
  revision: Revision, // the revision that was evaluated
  mode: AssistantMode,
  status: FeedbackStatus,
  createdAt: IsoTime,
});

export const EvaluationSchema = z.object({
  id: RecordId,
  requestId: z.string(),
  revision: Revision,
  status: z.enum(['pending', 'completed', 'unavailable', 'failed', 'stale']),
  mode: z.union([AssistantMode, z.literal('unavailable')]).nullable(),
  requestedAt: IsoTime,
  completedAt: IsoTime.nullable(),
  feedbackIds: z.array(RecordId),
  discardedItems: z.number().int().nonnegative(),
  suppressedDuplicates: z.number().int().nonnegative(),
  error: z.string().nullable(),
});

export const ResolutionSchema = z.object({
  id: RecordId,
  feedbackId: RecordId,
  action: z.enum(['clarify', 'dismiss', 'defer']),
  clarificationText: z.string().nullable(),
  clarificationObservationId: RecordId.nullable(),
  note: z.string().nullable(),
  resolvedBy: z.string(),
  resolvedAt: IsoTime,
  baseRevision: Revision,
  revisionAfter: Revision,
});

export const IncidentSchema = z.object({
  id: z.string(),
  revision: Revision,
  synthetic: z.literal(true),
  scenario: z.object({ variant: ScenarioVariant, title: z.string(), note: z.string() }),
  patient: z.object({ id: z.string(), name: z.string(), sharing: z.boolean(), matched: z.boolean() }),
  wearableStatus: WearableStatusSchema,
  sources: z.array(SourceSchema),
  claims: z.array(ClaimSchema),
  corrections: z.array(CorrectionSchema),
  observations: z.array(ObservationSchema),
  measurements: z.array(MeasurementSchema),
  careEvents: z.array(CareEventSchema),
  timelineEvents: z.array(TimelineEventSchema),
  contextFacts: z.array(ContextFactSchema),
  environmentReadings: z.array(EnvironmentReadingSchema),
  wearableRecords: z.array(WearableRecordSchema),
  evaluations: z.array(EvaluationSchema),
  feedback: z.array(FeedbackSchema),
  resolutions: z.array(ResolutionSchema),
  knowledgeReferences: z.array(KnowledgeReferenceSchema),
  handoffs: z.array(HandoffSchema),
});

export type Incident = z.infer<typeof IncidentSchema>;
export type ScenarioVariantValue = z.infer<typeof ScenarioVariant>;
export type Correction = z.infer<typeof CorrectionSchema>;
export type CorrectableTypeValue = z.infer<typeof CorrectableType>;
export type Feedback = z.infer<typeof FeedbackSchema>;
export type Evaluation = z.infer<typeof EvaluationSchema>;
export type Resolution = z.infer<typeof ResolutionSchema>;
