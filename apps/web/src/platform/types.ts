// The single frontend platform interface. Every network call from the website goes through an
// implementation of this interface (http.ts for the real platform; dev.ts for an opt-in,
// labeled in-browser development adapter with the same shape).
import type { ApproveInput, CareEventInput, HandoffDraft, MeasurementInput, ObservationInput, ResolutionInput, TimelineEventInput, Transcription, WorkspaceIncident } from './boundary';

export interface AdapterInfo {
  kind: 'http' | 'dev';
  label: string;
  /** Short description shown in the shell banner. */
  description: string;
}

export interface Platform {
  info: AdapterInfo;
  getIncident(): Promise<WorkspaceIncident>;
  reset(): Promise<WorkspaceIncident>;
  setSharing(sharing: boolean): Promise<WorkspaceIncident>;
  match(patientId: string): Promise<WorkspaceIncident>;
  addObservation(input: ObservationInput): Promise<{ incident: WorkspaceIncident; compatibility: string | null }>;
  addMeasurement(input: MeasurementInput): Promise<WorkspaceIncident>;
  addCareEvent(input: CareEventInput): Promise<WorkspaceIncident>;
  addTimelineEvent(input: TimelineEventInput): Promise<WorkspaceIncident>;
  transcribe(audio: Blob, requestId: string): Promise<Transcription>;
  evaluate(input: { requestId: string; baseRevision: number }): Promise<WorkspaceIncident>;
  resolveFeedback(input: ResolutionInput): Promise<WorkspaceIncident>;
  getHandoffDraft(incident: WorkspaceIncident): Promise<HandoffDraft>;
  approveHandoff(input: ApproveInput): Promise<WorkspaceIncident>;
}
