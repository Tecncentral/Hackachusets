// Pure derivations for the EMT workspace. Everything is computed from the canonical platform
// incident; no clinical interpretation is added. Unknown and not-documented values stay explicit.
import type { CareEvent, Correction, Feedback, Incident, Measurement, Observation, Resolution, TimelineEvent } from '../../platform';
import { CLINICAL_KINDS, MEASUREMENT_LABEL, TIME_LABEL, current, latestTime, phaseOf, type PhaseLabel } from '../../platform/labels';
import { zoneDate } from '../../platform/time';

/** Narrative date used for HH:MM time inputs (from the dispatch record; falls back to today). */
export function incidentDate(incident: Incident): string {
  const anchor = incident.sources.find(s => s.type === 'dispatch')?.eventTime ?? incident.sources[0]?.capturedAt ?? new Date().toISOString();
  return zoneDate(anchor);
}

const byRecorded = (a: { recordedAt: string }, b: { recordedAt: string }) => a.recordedAt.localeCompare(b.recordedAt);
const byMeasured = (a: Measurement, b: Measurement) => (a.measuredAt ?? '9999').localeCompare(b.measuredAt ?? '9999') || a.recordedAt.localeCompare(b.recordedAt);

/** All mental-status observations (category "neurological"), current first entries in record order. */
const neuro = (incident: Incident) => incident.observations.filter(o => o.category === 'neurological').sort(byRecorded);

export function latestMentalStatus(incident: Incident): Observation | undefined {
  // Most recently recorded current entry. Observed (event) time and record time are different clocks, so they are not mixed for ordering.
  return neuro(incident).filter(o => o.status === 'current').at(-1);
}
export function initialMentalStatus(incident: Incident): Observation | undefined {
  const all = neuro(incident);
  return all.length > 1 ? all[0] : undefined;
}

export function clinicalTemperatures(incident: Incident): Measurement[] {
  return current(incident.measurements).filter(m => m.kind === 'body_temperature').sort(byMeasured);
}

export interface TemperatureSummary { latest: Measurement | undefined; firstBeforeCooling: Measurement | undefined; count: number }
export function temperatureSummary(incident: Incident): TemperatureSummary {
  const temps = clinicalTemperatures(incident);
  // Only a reading explicitly documented as before cooling is called the pre-cooling reading.
  return { latest: temps.at(-1), firstBeforeCooling: temps.find(t => t.coolingPhase === 'before_cooling'), count: temps.length };
}

export interface Unknown { label: string; state: 'Unknown' | 'Not documented' }
export function keyUnknowns(incident: Incident): Unknown[] {
  const out: Unknown[] = [];
  const collapse = latestTime(incident.timelineEvents, 'collapse');
  if (!collapse?.time) out.push({ label: 'Collapse time', state: collapse ? 'Unknown' : 'Not documented' });
  const onset = latestTime(incident.timelineEvents, 'symptom_onset');
  if (!onset?.time) out.push({ label: 'Symptom onset', state: onset ? 'Unknown' : 'Not documented' });
  const temp = temperatureSummary(incident);
  if (!temp.latest) out.push({ label: 'Clinical temperature', state: 'Not documented' });
  else if (temp.latest.site === 'unknown') out.push({ label: 'Temperature method/site', state: 'Unknown' });
  if (!latestMentalStatus(incident)) out.push({ label: 'Mental status', state: 'Not documented' });
  return out;
}

/** Platform-marked stale: produced for a revision that changed during evaluation. Cannot be resolved; re-evaluate. */
export const isStale = (f: Feedback) => f.status === 'stale';
/** Open/deferred feedback generated before the latest change. Still resolvable; the crew should read it against the current record. */
export const isBehind = (f: Feedback, incident: Incident) => (f.status === 'open' || f.status === 'deferred') && f.revision < incident.revision;
export const openFeedback = (incident: Incident) => incident.feedback.filter(f => f.status === 'open');
export const resolutionOf = (incident: Incident, f: Feedback): Resolution | undefined => incident.resolutions.filter(r => r.feedbackId === f.id).at(-1);

export type StepId = 'capture' | 'feedback' | 'temperature' | 'care' | 'review' | 'shared';
export interface NextStep { id: StepId; title: string; action: string; detail: string }

/** One suggested next task. Suggestions never gate care, transport, or any other action. */
export function nextStep(incident: Incident): NextStep {
  const crewObs = incident.observations.filter(o => o.recordedBy !== 'synthetic fixture');
  if (crewObs.length === 0) return { id: 'capture', title: 'Capture what you see and hear', action: 'Add observation', detail: 'Witness account, mental status, skin, exertion — short notes are enough.' };
  if (openFeedback(incident).length > 0) return { id: 'feedback', title: 'Review a question from the assistant', action: 'Review feedback', detail: 'Clarify, dismiss, or defer. Nothing changes until you choose.' };
  if (!temperatureSummary(incident).latest) return { id: 'temperature', title: 'Record a clinical temperature when obtained', action: 'Add measurement', detail: 'Include method/site, time, and whether before or after cooling.' };
  if (current(incident.careEvents).length === 0) return { id: 'care', title: 'Document care and reassessment', action: 'Add care event', detail: 'Record actions performed with start/stop times, then repeat measurements.' };
  const latest = incident.handoffs.at(-1);
  if (latest && latest.revision === incident.revision) return { id: 'shared', title: `Handoff version ${latest.version} shared`, action: 'Open receiving view', detail: 'New information will need a fresh review before an amendment is shared.' };
  return { id: 'review', title: latest ? 'Review the amendment' : 'Review the ER handoff', action: latest ? 'Review amendment' : 'Review handoff', detail: latest ? `Version ${latest.version} is outdated: information was added after it was shared.` : 'See the full draft, then approve and share.' };
}

export type ChronoItem = { kind: 'measurement'; at: string | null; m: Measurement } | { kind: 'care'; at: string | null; c: CareEvent };
/** Current clinical measurements interleaved with care events, chronological; undated entries last. */
export function careChronology(incident: Incident): ChronoItem[] {
  const items: ChronoItem[] = [
    ...current(incident.measurements).filter(m => CLINICAL_KINDS.includes(m.kind)).map(m => ({ kind: 'measurement' as const, at: m.measuredAt, m })),
    ...current(incident.careEvents).map(c => ({ kind: 'care' as const, at: c.startedAt, c }))
  ];
  return items.sort((a, b) => (a.at ?? '9999').localeCompare(b.at ?? '9999'));
}

export const KEY_TIMES: TimelineEvent['kind'][] = ['exertion_start', 'symptom_onset', 'last_known_normal', 'device_fall_event', 'discovery', 'collapse', 'emergency_call', 'crew_arrival', 'transport_start'];
/** Kinds the crew can record in the key-time form (device events come from devices, not the crew). */
export const CREW_TIME_KINDS = KEY_TIMES.filter(k => k !== 'device_fall_event');
export function keyTimes(incident: Incident): Array<{ kind: TimelineEvent['kind']; label: string; event: TimelineEvent | undefined; history: TimelineEvent[] }> {
  return KEY_TIMES.map(kind => {
    const history = incident.timelineEvents.filter(t => t.kind === kind);
    return { kind, label: TIME_LABEL[kind], event: latestTime(incident.timelineEvents, kind), history };
  }).filter(k => k.event || k.kind === 'collapse' || k.kind === 'discovery');
}

export interface ChangeRow { id: string; original: Observation; replacement: Observation; feedback: Feedback | undefined; correction: Correction }
/** Observation corrections (including clarifications after assistant feedback). The original stays in the record, superseded. */
export function changes(incident: Incident): ChangeRow[] {
  return incident.corrections.filter(c => c.targetType === 'observation').flatMap(c => {
    const original = incident.observations.find(o => o.id === c.originalId);
    const replacement = incident.observations.find(o => o.id === c.replacementId);
    return original && replacement ? [{ id: c.id, original, replacement, feedback: incident.feedback.find(f => f.id === c.feedbackId), correction: c }] : [];
  });
}

export function hasWearableData(incident: Incident): boolean {
  return incident.wearableRecords.length > 0 || incident.sources.some(s => s.type === 'wearable');
}

/**
 * Scenario-level working concern from the incident brief. Not established by the app; replace with
 * a platform field when one exists.
 */
export const WORKING_CONCERN = 'Suspected exertional heat stroke';

/** Most recent current witness/account observation. */
export function witnessAccount(incident: Incident): Observation | undefined {
  return current(incident.observations).filter(o => o.category === 'account').sort(byRecorded).at(-1);
}

export interface ReadingRow { kind: Measurement['kind']; label: string; initial: Measurement; latest: Measurement | null; initialPhase: PhaseLabel; latestPhase: PhaseLabel | null }
/** Per clinical measurement type: first and latest current entry (by measured time; undated last), with cooling phase labels. */
export function readings(incident: Incident): ReadingRow[] {
  return CLINICAL_KINDS.flatMap(kind => {
    const list = current(incident.measurements).filter(m => m.kind === kind).sort(byMeasured);
    if (list.length === 0) return [];
    const initial = list[0], latest = list.length > 1 ? list.at(-1)! : null;
    return [{ kind, label: MEASUREMENT_LABEL[kind], initial, latest, initialPhase: phaseOf(initial, incident.careEvents), latestPhase: latest ? phaseOf(latest, incident.careEvents) : null }];
  });
}
export function undocumentedKinds(incident: Incident): string[] {
  return CLINICAL_KINDS.filter(k => !current(incident.measurements).some(m => m.kind === k)).map(k => MEASUREMENT_LABEL[k]);
}

/** Feedback attached to an observation (by observationIds). */
export function feedbackFor(incident: Incident, observationId: string): Feedback[] {
  return incident.feedback.filter(f => f.observationIds.includes(observationId));
}
/** Feedback not tied to any observation (e.g. about a measurement). */
export function recordFeedback(incident: Incident): Feedback[] {
  return incident.feedback.filter(f => f.observationIds.length === 0);
}

/**
 * Observations needing attention: those with open or deferred feedback, plus the newest observation.
 * Everything else (including dismissed/clarified items) is in "Earlier observations & resolved feedback".
 */
export function partitionObservations(incident: Incident): { attention: Observation[]; earlier: Observation[] } {
  // Clarifications are shown inside the card of the statement they clarify, not as separate cards.
  const replacementOf = new Map(changes(incident).map(k => [k.replacement.id, k.original.id]));
  const rootOf = (id: string): string => { let at = id; const seen = new Set<string>(); while (replacementOf.has(at) && !seen.has(at)) { seen.add(at); at = replacementOf.get(at)!; } return at; };
  const cards = [...incident.observations].filter(o => !replacementOf.has(o.id)).sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
  const newestAny = [...incident.observations].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))[0];
  const newestCardId = newestAny ? rootOf(newestAny.id) : null;
  const pending = (o: Observation) => feedbackFor(incident, o.id).some(f => f.status === 'open' || f.status === 'deferred' || f.status === 'stale');
  const attention = cards.filter(o => (o.status === 'current' && pending(o)) || o.id === newestCardId);
  return { attention, earlier: cards.filter(o => !attention.includes(o)) };
}
