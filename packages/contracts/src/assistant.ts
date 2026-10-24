import { z } from 'zod';
import { RecordId, ObservationSchema, MeasurementSchema, SourceSchema, CareEventSchema, TimelineEventSchema, ContextFactSchema, EnvironmentReadingSchema, WearableRecordSchema } from './records.js';

// Logical boundary between the core platform and the correction assistant (workstream 02).
// The assistant returns proposals only; it never mutates incident state.

export const FeedbackKind = z.enum(['conflict', 'missing_context', 'unsupported_inference']);
// deterministic: rule checks only. model: model-generated. hybrid: rules plus model phrasing. mock: platform fixture replay.
export const AssistantMode = z.enum(['deterministic', 'model', 'hybrid', 'mock']);

// Required keys; nullable where marked. Lengths are capped so assistant output stays concise.
export const AssistantFeedbackItemSchema = z.object({
  id: RecordId,
  kind: FeedbackKind,
  message: z.string().trim().min(1).max(600),
  suggestedQuestion: z.string().trim().min(1).max(300).nullable(),
  observationIds: z.array(RecordId).max(20),
  evidenceSourceIds: z.array(RecordId).max(20),
  knowledgeReferenceIds: z.array(RecordId).max(10),
  spokenSummary: z.string().trim().min(1).max(240).nullable(),
});

export const KnowledgeReferenceSchema = z.object({
  id: RecordId,
  title: z.string().trim().min(1).max(300),
  url: z.string().url(),
  versionDate: z.string().max(40).nullable(),
  section: z.string().max(200).nullable(),
  passage: z.string().max(600).nullable(),
  // Consensus documents are background, not the responder's applicable local protocol.
  applicability: z.string().max(300),
  reviewStatus: z.enum(['unreviewed', 'clinician_reviewed']),
});

export const ProtocolContextSchema = z.object({
  agencyProtocolId: z.string().nullable(),
  applicability: z.enum(['not_configured', 'configured']),
  note: z.string(),
});

export const EvaluateRequestSchema = z.object({
  incidentId: z.string(),
  revision: z.number().int().nonnegative(),
  patientMatched: z.boolean(),
  observations: z.array(ObservationSchema),
  measurements: z.array(MeasurementSchema),
  sources: z.array(SourceSchema),
  careEvents: z.array(CareEventSchema),
  // Additions beyond the original logical contract; the assistant may ignore them.
  timelineEvents: z.array(TimelineEventSchema),
  contextFacts: z.array(ContextFactSchema),
  environmentReadings: z.array(EnvironmentReadingSchema),
  wearableRecords: z.array(WearableRecordSchema),
  protocolContext: ProtocolContextSchema,
});

export const EvaluateResponseSchema = z.object({
  incidentId: z.string(),
  revision: z.number().int().nonnegative(),
  mode: AssistantMode,
  feedback: z.array(AssistantFeedbackItemSchema).max(10),
  // Optional addition: metadata for every knowledgeReferenceId used in feedback.
  knowledgeReferences: z.array(KnowledgeReferenceSchema).max(20).default([]),
});

export type FeedbackKindValue = z.infer<typeof FeedbackKind>;
export type AssistantModeValue = z.infer<typeof AssistantMode>;
export type AssistantFeedbackItem = z.infer<typeof AssistantFeedbackItemSchema>;
export type KnowledgeReference = z.infer<typeof KnowledgeReferenceSchema>;
export type ProtocolContext = z.infer<typeof ProtocolContextSchema>;
export type EvaluateRequest = z.infer<typeof EvaluateRequestSchema>;
export type EvaluateResponse = z.infer<typeof EvaluateResponseSchema>;
