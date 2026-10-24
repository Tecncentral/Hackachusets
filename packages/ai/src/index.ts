import { DemoInitial, DemoClarification, type Incident, type Claim } from '@scenebrief/contracts';

// --- Existing scaffold adapter (unchanged behavior; API store depends on it) ---
export interface Extraction { field: Claim['field']; value: string; clarifiesInitial: boolean }
export interface EvidenceAdapter { extract(text: string): Promise<Extraction>; draft(incident: Incident): string }
// Deliberately scripted. This adapter neither transcribes audio nor provides clinical reasoning.
// Future model outputs must be validated and retain source IDs before storage.
export const demoAdapter: EvidenceAdapter = {
 async extract(text) {
  if (text === DemoClarification) return { field: 'discoveryTime', value: 'Approximately 10:43 EDT on 2026-10-24, per witness. Collapse not witnessed.', clarifiesInitial: true };
  return { field: 'account', value: text, clarifiesInitial: false };
 },
 draft(incident) {
  const claims = incident.claims.filter(c => c.status !== 'superseded');
  return ['SYNTHETIC DEMO — crew review does not confirm all underlying claims.',
   ...claims.map(c => `${c.field}: ${c.value ?? 'Unknown'} [sources: ${c.sourceIds.join(', ') || 'none'}]`),
   `Corrections recorded: ${incident.corrections.length}.`,
   'Device context: workout at 09:05; device-reported fall at 10:42. Neither establishes symptom onset or downtime.',
   'Clinical findings and care: not documented in this scaffold.'
  ].join('\n');
 }
};
export { DemoInitial };

// --- EHS correction assistant (Member 2 revised scope) ---
export * from './knowledge.js';
export * from './evaluate.types.js';
export { evaluateRules } from './evaluate.js';
export { evaluateHybrid, type LanguageModel, type HybridOptions } from './hybrid.js';
export {
  transcribe,
  transcriptionAvailability,
  TRANSCRIPTION_KEY_ENV,
  TRANSCRIPTION_PROVIDER_ENV,
  type TranscriptionMode,
  type TranscriptionResult,
  type TranscriptionProvider,
  type TranscriptionConfig,
  type AudioInput,
} from './transcribe.js';
export * from './fixtures.js';
