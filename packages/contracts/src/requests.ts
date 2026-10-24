import { z } from 'zod';
import { IsoTime, RecordId, ObservationFields, MeasurementFields, checkMeasurement, CareEventFields, checkCareEvent, TimelineEventFields, checkTimeline, ContextFactFields, checkFact, EnvironmentReadingFields, checkEnvironment, ObservationCategory, Attribution, InputMode } from './records.js';
import { ScenarioVariant } from './incident.js';

// Every mutation carries a client-generated requestId (idempotency) and the revision the client last saw.
const Mutation = {
  requestId: z.string().trim().min(1).max(100),
  baseRevision: z.number().int().nonnegative(),
  recordedBy: z.string().trim().min(1).max(100).default('crew'),
};

// Field-only schemas: used for corrections (replacement payloads) and to build the create requests below.
export const ObservationInputSchema = z.object(ObservationFields).strict();
export const MeasurementInputSchema = z.object(MeasurementFields).strict().superRefine(checkMeasurement);
export const CareEventInputSchema = z.object(CareEventFields).strict().superRefine(checkCareEvent);
export const TimelineEventInputSchema = z.object(TimelineEventFields).strict().superRefine(checkTimeline);
export const ContextFactInputSchema = z.object(ContextFactFields).strict().superRefine(checkFact);
export const EnvironmentReadingInputSchema = z.object(EnvironmentReadingFields).strict().superRefine(checkEnvironment);

export const ObservationRequest = z.object({ ...Mutation, ...ObservationFields }).strict();
export const MeasurementRequest = z.object({ ...Mutation, ...MeasurementFields }).strict().superRefine(checkMeasurement);
export const CareEventRequest = z.object({ ...Mutation, ...CareEventFields }).strict().superRefine(checkCareEvent);
export const TimelineEventRequest = z.object({ ...Mutation, ...TimelineEventFields }).strict().superRefine(checkTimeline);
export const ContextFactRequest = z.object({ ...Mutation, ...ContextFactFields }).strict().superRefine(checkFact);
export const EnvironmentReadingRequest = z.object({ ...Mutation, ...EnvironmentReadingFields }).strict().superRefine(checkEnvironment);

// The replacement is validated against the target record type's input schema by the store.
export const CorrectionRequest = z.object({
  ...Mutation,
  targetId: RecordId,
  reason: z.string().trim().min(1).max(500).nullable().default(null),
  replacement: z.record(z.string(), z.unknown()),
}).strict();

export const EvaluationRequest = z.object({ requestId: Mutation.requestId, baseRevision: Mutation.baseRevision }).strict();

export const ResolutionRequest = z.object({
  ...Mutation,
  action: z.enum(['clarify', 'dismiss', 'defer']),
  // The EMT's own wording. Required for clarify; not accepted for dismiss/defer.
  clarificationText: z.string().trim().min(1).max(5000).optional(),
  note: z.string().trim().min(1).max(500).optional(),
  // Optional overrides for the clarification observation. Defaults come from the first referenced observation.
  category: ObservationCategory.optional(),
  reportedBy: Attribution.optional(),
  inputMode: InputMode.optional(),
  observedAt: IsoTime.nullable().optional(),
}).strict().superRefine((r, ctx) => {
  if (r.action === 'clarify' && !r.clarificationText) ctx.addIssue({ code: 'custom', path: ['clarificationText'], message: 'clarify requires the crew\'s clarificationText.' });
  if (r.action !== 'clarify' && (r.clarificationText || r.category || r.reportedBy || r.inputMode || r.observedAt !== undefined)) ctx.addIssue({ code: 'custom', path: ['action'], message: 'Clarification fields are only accepted with action "clarify".' });
});

export const ResetRequest = z.object({ variant: ScenarioVariant.optional() }).strict();
export const AssistantToggleRequest = z.object({ enabled: z.boolean() }).strict();

// Legacy scaffold requests (unchanged).
export const TranscriptRequest = z.object({ requestId: z.string().min(1), text: z.string().trim().min(1).max(5000) }).strict();
export const ReviewRequest = z.object({ revision: z.number().int().nonnegative(), reviewedBy: z.string().trim().min(1).max(100) }).strict();
export const MatchRequest = z.object({ patientId: z.string(), confirmed: z.literal(true) }).strict();
export const SharingRequest = z.object({ sharing: z.boolean() }).strict();

export type ObservationRequestInput = z.input<typeof ObservationRequest>;
export type MeasurementRequestInput = z.input<typeof MeasurementRequest>;
export type CareEventRequestInput = z.input<typeof CareEventRequest>;
export type TimelineEventRequestInput = z.input<typeof TimelineEventRequest>;
export type ContextFactRequestInput = z.input<typeof ContextFactRequest>;
export type EnvironmentReadingRequestInput = z.input<typeof EnvironmentReadingRequest>;
export type CorrectionRequestInput = z.input<typeof CorrectionRequest>;
export type EvaluationRequestInput = z.input<typeof EvaluationRequest>;
export type ResolutionRequestInput = z.input<typeof ResolutionRequest>;
export type TranscriptInput = z.infer<typeof TranscriptRequest>;
