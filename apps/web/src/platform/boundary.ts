// Website side of the platform boundary. The core platform owns every record schema
// (`@scenebrief/contracts`, see docs/core-api-contract.md); this file only re-exports those types and
// adds what the website itself needs: request inputs, the transcription response (not yet a platform
// route) and a typed error. There are no competing record definitions here.
import { z } from 'zod';
import type {
  Incident, Observation, Measurement, CareEvent, TimelineEvent, ContextFact, EnvironmentReading, WearableRecord,
  Feedback, Evaluation, Resolution, KnowledgeReference, Correction, HandoffDraft, Handoff, HandoffSection, HandoffItem,
  Uncertainty, SourceRecord,
  ObservationRequestInput, MeasurementRequestInput, CareEventRequestInput, TimelineEventRequestInput,
  EnvironmentReadingRequestInput, ResolutionRequestInput, ScenarioVariantValue
} from '@scenebrief/contracts';

export type {
  Incident, Observation, Measurement, CareEvent, TimelineEvent, ContextFact, EnvironmentReading, WearableRecord,
  Feedback, Evaluation, Resolution, KnowledgeReference, Correction, HandoffDraft, Handoff, HandoffSection, HandoffItem,
  Uncertainty, SourceRecord, ScenarioVariantValue
};

// ---- Requests: the canonical request bodies (inputs before defaults are applied) ----
export type ObservationInput = ObservationRequestInput;
export type MeasurementInput = MeasurementRequestInput;
export type CareEventInput = CareEventRequestInput;
export type TimelineEventInput = TimelineEventRequestInput;
export type EnvironmentReadingInput = EnvironmentReadingRequestInput;
export type ResolutionInput = ResolutionRequestInput & { feedbackId: string };
export interface EvaluationInput { requestId: string; baseRevision: number }
export interface ApproveInput { revision: number; reviewedBy: string }

/** GET /api/health → assistant. Used for the demo "assistant available" control. */
export const AssistantStatusSchema = z.object({
  configuredMode: z.string(), enabled: z.boolean(), effectiveMode: z.string(), baseUrl: z.string().nullable()
});
export type AssistantStatus = z.infer<typeof AssistantStatusSchema>;

/**
 * Audio transcription result. NOT a platform route on main yet (POST /audio/transcriptions is a
 * proposal for workstreams 01/02); the HTTP adapter reports it as unavailable until it exists.
 */
export const TranscriptionSchema = z.object({ transcript: z.string(), mode: z.string(), warnings: z.array(z.string()).default([]) });
export type Transcription = z.infer<typeof TranscriptionSchema>;

export type PlatformErrorKind = 'unavailable' | 'conflict' | 'forbidden' | 'invalid' | 'not_found' | 'network' | 'server';
export class PlatformError extends Error {
  constructor(public kind: PlatformErrorKind, message: string, public endpoint: string, public status: number | null = null) { super(message); this.name = 'PlatformError'; }
}
export function errorMessage(e: unknown): string {
  if (e instanceof PlatformError) return e.message;
  return e instanceof Error ? e.message : String(e);
}
