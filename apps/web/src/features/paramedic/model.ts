// Pure derivations for the EMT workspace. Everything is computed from the platform incident; no
// clinical interpretation is added. Unknown and not-documented values stay explicit.
import type { CareEvent, Feedback, Measurement, Observation, TimelineEvent, WorkspaceIncident } from '../../platform';
import { CLINICAL_KINDS, MEASUREMENT_LABEL, TIME_LABEL, latestTime, phaseOf, type PhaseLabel } from '../../platform/draft';
import { zoneDate } from '../../platform/time';


/** Narrative date used for HH:MM time inputs (from the dispatch/source records; falls back to today). */
export function incidentDate(incident: WorkspaceIncident): string {
  const anchor = incident.sources.find(s => s.type === 'dispatch')?.eventTime ?? incident.sources[0]?.capturedAt ?? new Date().toISOString();
  return zoneDate(anchor);
}

export function latestMentalStatus(incident: WorkspaceIncident): Observation | undefined {
  // Most recently recorded entry. Observed (event) time and capture time are different clocks, so they are not mixed for ordering.
  return incident.observations.filter(o => o.category === 'mental_status' && o.status === 'active').sort((a, b) => a.capturedAt.localeCompare(b.capturedAt)).at(-1);
}

export function clinicalTemperatures(incident: WorkspaceIncident): Measurement[] {
  return incident.measurements.filter(m => m.kind === 'temperature').sort((a, b) => (a.eventTime ?? a.capturedAt).localeCompare(b.eventTime ?? b.capturedAt));
}

export interface TemperatureSummary { latest: Measurement | undefined; firstBeforeCooling: Measurement | undefined; count: number; notObtained: Measurement | undefined }
export function temperatureSummary(incident: WorkspaceIncident): TemperatureSummary {
  const temps = clinicalTemperatures(incident);
  const obtained = temps.filter(t => t.status === 'obtained');
  return {
    latest: obtained.at(-1),
    // Only a reading explicitly documented as before cooling is called the pre-cooling reading.
    firstBeforeCooling: obtained.find(t => t.coolingPhase === 'before'),
    count: obtained.length,
    notObtained: obtained.length === 0 ? temps.find(t => t.status === 'not_obtained') : undefined
  };
}

/** Latest obtained value per other clinical vital. */
export function latestVitals(incident: WorkspaceIncident): Measurement[] {
  return CLINICAL_KINDS.filter(k => k !== 'temperature').flatMap(k => {
    const m = incident.measurements.filter(x => x.kind === k).sort((a, b) => (a.eventTime ?? a.capturedAt).localeCompare(b.eventTime ?? b.capturedAt)).at(-1);
    return m ? [m] : [];
  });
}

export interface Unknown { label: string; state: 'Unknown' | 'Not documented' | 'Not obtained' }
export function keyUnknowns(incident: WorkspaceIncident): Unknown[] {
  const out: Unknown[] = [];
  const collapse = latestTime(incident.timelineEvents, 'collapse');
  if (!collapse?.time) out.push({ label: 'Collapse time', state: collapse ? 'Unknown' : 'Not documented' });
  const onset = latestTime(incident.timelineEvents, 'symptomOnset');
  if (!onset?.time) out.push({ label: 'Symptom onset', state: onset ? 'Unknown' : 'Not documented' });
  const temp = temperatureSummary(incident);
  if (!temp.latest) out.push({ label: 'Clinical temperature', state: temp.notObtained ? 'Not obtained' : 'Not documented' });
  else if (!temp.latest.method) out.push({ label: 'Temperature method/site', state: 'Not documented' });
  if (!latestMentalStatus(incident)) out.push({ label: 'Mental status', state: 'Not documented' });
  return out;
}

export function isStale(f: Feedback, incident: WorkspaceIncident): boolean {
  return (f.status === 'open' || f.status === 'deferred') && f.revision < incident.revision;
}
export const openFeedback = (incident: WorkspaceIncident) => incident.feedback.filter(f => f.status === 'open');

export type StepId = 'capture' | 'feedback' | 'temperature' | 'care' | 'review' | 'shared';
export interface NextStep { id: StepId; title: string; action: string; detail: string }

/** One suggested next task. Suggestions never gate care, transport, or any other action. */
export function nextStep(incident: WorkspaceIncident): NextStep {
  if (incident.observations.length === 0) return { id: 'capture', title: 'Capture what you see and hear', action: 'Add observation', detail: 'Witness account, mental status, skin, exertion — short notes are enough.' };
  if (openFeedback(incident).length > 0) return { id: 'feedback', title: 'Review a question from the assistant', action: 'Review feedback', detail: 'Clarify, dismiss, or defer. Nothing changes until you choose.' };
  if (!temperatureSummary(incident).latest && !temperatureSummary(incident).notObtained) return { id: 'temperature', title: 'Record a clinical temperature when obtained', action: 'Add measurement', detail: 'Include method/site, time, and whether before or after cooling.' };
  if (incident.careEvents.length === 0) return { id: 'care', title: 'Document care and reassessment', action: 'Add care event', detail: 'Record actions performed with start/stop times, then repeat measurements.' };
  const latest = incident.handoffs.at(-1);
  if (latest && latest.revision === incident.revision) return { id: 'shared', title: `Handoff version ${latest.version} shared`, action: 'Open receiving view', detail: 'New information will need a fresh review before an amendment is shared.' };
  return { id: 'review', title: latest ? 'Review the amendment' : 'Review the ER handoff', action: latest ? 'Review amendment' : 'Review handoff', detail: latest ? `Version ${latest.version} is outdated: information was added after it was shared.` : 'See the full draft, then approve and share.' };
}

export type ChronoItem = { kind: 'measurement'; at: string | null; m: Measurement } | { kind: 'care'; at: string | null; c: CareEvent };
/** Clinical measurements interleaved with care events, chronological; undated entries last. */
export function careChronology(incident: WorkspaceIncident): ChronoItem[] {
  const items: ChronoItem[] = [
    ...incident.measurements.filter(m => CLINICAL_KINDS.includes(m.kind)).map(m => ({ kind: 'measurement' as const, at: m.eventTime, m })),
    ...incident.careEvents.map(c => ({ kind: 'care' as const, at: c.startedAt, c }))
  ];
  return items.sort((a, b) => (a.at ?? '9999').localeCompare(b.at ?? '9999'));
}

export const KEY_TIMES: TimelineEvent['kind'][] = ['activityStart', 'symptomOnset', 'lastKnownWell', 'deviceFall', 'discovery', 'collapse', 'call', 'arrival', 'transport'];
export function keyTimes(incident: WorkspaceIncident): Array<{ kind: TimelineEvent['kind']; label: string; event: TimelineEvent | undefined; history: TimelineEvent[] }> {
  return KEY_TIMES.map(kind => {
    const history = incident.timelineEvents.filter(t => t.kind === kind);
    return { kind, label: TIME_LABEL[kind], event: history.at(-1), history };
  }).filter(k => k.event || k.kind === 'collapse' || k.kind === 'discovery');
}

export interface ChangeRow { id: string; original: Observation; replacement: Observation; feedback: Feedback | undefined; recordedAt: string }
export function changes(incident: WorkspaceIncident): ChangeRow[] {
  return incident.observationCorrections.flatMap(k => {
    const original = incident.observations.find(o => o.id === k.originalObservationId);
    const replacement = incident.observations.find(o => o.id === k.replacementObservationId);
    return original && replacement ? [{ id: k.id, original, replacement, feedback: incident.feedback.find(f => f.id === k.feedbackId), recordedAt: k.recordedAt }] : [];
  });
}

export function hasWearableData(incident: WorkspaceIncident): boolean {
  return incident.sources.some(s => s.type === 'wearable') || incident.measurements.some(m => m.sourceKind === 'wearable');
}

/**
 * Scenario-level working concern from the incident brief. Not established by the app; replace with
 * a platform field when one exists.
 */
export const WORKING_CONCERN = 'Suspected exertional heat stroke';

/** Most recent active witness/account observation. */
export function witnessAccount(incident: WorkspaceIncident): Observation | undefined {
  return incident.observations.filter(o => o.category === 'account' && o.status === 'active').sort((a, b) => a.capturedAt.localeCompare(b.capturedAt)).at(-1);
}

export function initialMentalStatus(incident: WorkspaceIncident): Observation | undefined {
  const all = incident.observations.filter(o => o.category === 'mental_status').sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
  return all.length > 1 ? all[0] : undefined;
}

export interface ReadingRow { kind: Measurement['kind']; label: string; initial: Measurement; latest: Measurement | null; initialPhase: PhaseLabel; latestPhase: PhaseLabel | null }
/** Per clinical measurement type: first and latest entry (by event time; undated last), with cooling phase labels. */
export function readings(incident: WorkspaceIncident): ReadingRow[] {
  return CLINICAL_KINDS.flatMap(kind => {
    const list = incident.measurements.filter(m => m.kind === kind).sort((a, b) => (a.eventTime ?? '9999').localeCompare(b.eventTime ?? '9999') || a.capturedAt.localeCompare(b.capturedAt));
    if (list.length === 0) return [];
    const initial = list[0], latest = list.length > 1 ? list.at(-1)! : null;
    return [{ kind, label: MEASUREMENT_LABEL[kind], initial, latest, initialPhase: phaseOf(initial, incident.careEvents), latestPhase: latest ? phaseOf(latest, incident.careEvents) : null }];
  });
}
export function undocumentedKinds(incident: WorkspaceIncident): string[] {
  return CLINICAL_KINDS.filter(k => !incident.measurements.some(m => m.kind === k)).map(k => MEASUREMENT_LABEL[k]);
}

/** Feedback attached to an observation (by observationIds). */
export function feedbackFor(incident: WorkspaceIncident, observationId: string): Feedback[] {
  return incident.feedback.filter(f => f.observationIds.includes(observationId));
}
/** Feedback not tied to any observation (e.g. a measurement missing its method). */
export function recordFeedback(incident: WorkspaceIncident): Feedback[] {
  return incident.feedback.filter(f => f.observationIds.length === 0);
}

/**
 * Observations needing attention: those with open or deferred feedback, plus the newest observation.
 * Everything else (including dismissed/clarified items) is in "Earlier observations & resolved feedback".
 */
export function partitionObservations(incident: WorkspaceIncident): { attention: Observation[]; earlier: Observation[] } {
  // Clarifications are shown inside the card of the statement they clarify, not as separate cards.
  const replacementOf = new Map(incident.observationCorrections.map(k => [k.replacementObservationId, k.originalObservationId]));
  const cards = [...incident.observations].filter(o => !replacementOf.has(o.id)).sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
  const newestAny = [...incident.observations].sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))[0];
  const newestCardId = newestAny ? replacementOf.get(newestAny.id) ?? newestAny.id : null;
  const pending = (o: Observation) => feedbackFor(incident, o.id).some(f => f.status === 'open' || f.status === 'deferred');
  const attention = cards.filter(o => (o.status === 'active' && pending(o)) || o.id === newestCardId);
  return { attention, earlier: cards.filter(o => !attention.includes(o)) };
}
