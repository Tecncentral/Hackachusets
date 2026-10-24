import { z } from 'zod';
import { IsoTime } from './records.js';

export const HandoffSectionId = z.enum(['presentation', 'exertion_environment', 'neurological', 'measurements', 'care', 'history', 'device_context', 'timeline', 'changes']);
// documented: crew-recorded or measured. reported: account or claim, not verified. unknown: stated as unknown.
// not_documented: no record exists (never a normal finding). superseded: replaced by a correction.
export const ItemState = z.enum(['documented', 'reported', 'unknown', 'not_documented', 'superseded']);

export const HandoffItemSchema = z.object({
  text: z.string(),
  state: ItemState,
  recordIds: z.array(z.string()),
  sourceIds: z.array(z.string()),
});
export const HandoffSectionSchema = z.object({ id: HandoffSectionId, title: z.string(), items: z.array(HandoffItemSchema) });
export const UncertaintySchema = z.object({
  topic: z.string(),
  state: z.enum(['unknown', 'not_documented', 'approximate', 'conflicting']),
  text: z.string(),
  sourceIds: z.array(z.string()),
});

export const HandoffDraftSchema = z.object({
  incidentId: z.string(),
  revision: z.number().int().nonnegative(),
  status: z.literal('draft'),
  synthetic: z.literal(true),
  generatedAt: IsoTime,
  patientMatched: z.boolean(),
  sections: z.array(HandoffSectionSchema),
  sourceIds: z.array(z.string()),
  uncertainties: z.array(UncertaintySchema),
  text: z.string(),
});

// Reviewed snapshot. version/revision/reviewedAt/reviewedBy/text are the original scaffold fields.
export const HandoffSchema = z.object({
  version: z.number().int().positive(),
  revision: z.number().int().nonnegative(),
  reviewedAt: IsoTime,
  reviewedBy: z.string(),
  text: z.string(),
  kind: z.enum(['initial', 'amendment']),
  amendsVersion: z.number().int().positive().nullable(),
  patientMatched: z.boolean(),
  sections: z.array(HandoffSectionSchema),
  sourceIds: z.array(z.string()),
  uncertainties: z.array(UncertaintySchema),
  changeSummary: z.array(z.string()),
});

export type HandoffItem = z.infer<typeof HandoffItemSchema>;
export type HandoffSection = z.infer<typeof HandoffSectionSchema>;
export type Uncertainty = z.infer<typeof UncertaintySchema>;
export type HandoffDraft = z.infer<typeof HandoffDraftSchema>;
export type Handoff = z.infer<typeof HandoffSchema>;
