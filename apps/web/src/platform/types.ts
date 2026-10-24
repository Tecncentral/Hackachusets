// The single frontend platform interface. Every network call from the website goes through an
// implementation of this interface: http.ts for the real platform, or dev.ts — an opt-in, labeled
// development adapter that runs the platform's own IncidentStore inside the browser tab.
import type {
  ApproveInput, AssistantStatus, CareEventInput, EnvironmentReadingInput, EvaluationInput, HandoffDraft, Incident,
  MeasurementInput, ObservationInput, ResolutionInput, ScenarioVariantValue, TimelineEventInput, Transcription
} from './boundary';

export interface AdapterInfo {
  kind: 'http' | 'dev';
  label: string;
  /** Short description shown in the shell banner. */
  description: string;
}

export interface Platform {
  info: AdapterInfo;
  getIncident(): Promise<Incident>;
  reset(variant?: ScenarioVariantValue): Promise<Incident>;
  setSharing(sharing: boolean): Promise<Incident>;
  match(patientId: string): Promise<Incident>;
  addObservation(input: ObservationInput): Promise<Incident>;
  addMeasurement(input: MeasurementInput): Promise<Incident>;
  addCareEvent(input: CareEventInput): Promise<Incident>;
  addTimelineEvent(input: TimelineEventInput): Promise<Incident>;
  addEnvironmentReading(input: EnvironmentReadingInput): Promise<Incident>;
  transcribe(audio: Blob, requestId: string): Promise<Transcription>;
  /** Records an Evaluation on the platform. An unavailable or failed assistant is a completed request whose evaluation says so. */
  evaluate(input: EvaluationInput): Promise<Incident>;
  resolveFeedback(input: ResolutionInput): Promise<Incident>;
  /** GET /handoff-draft — the platform's deterministic draft for the current revision. */
  getHandoffDraft(): Promise<HandoffDraft>;
  approveHandoff(input: ApproveInput): Promise<Incident>;
  assistantStatus(): Promise<AssistantStatus>;
  /** Demo control (POST /api/demo/assistant). */
  setAssistantEnabled(enabled: boolean): Promise<AssistantStatus>;
}
