// Deterministic grouping of the stored record into handoff sections. Used by the development
// adapter, and by the HTTP adapter only when GET /handoff-draft is unavailable (labeled
// "website-grouped"). It copies stored records into sections; it adds no clinical interpretation.
import type { CareEvent, DraftSection, HandoffDraft, Measurement, Observation, TimelineEvent, WorkspaceIncident } from './boundary';
import { clock } from './time';

export const MEASUREMENT_LABEL: Record<Measurement['kind'], string> = {
  temperature: 'Temperature', heartRate: 'Heart rate', bloodPressure: 'Blood pressure', respiratoryRate: 'Respiratory rate',
  spo2: 'SpO₂', glucose: 'Glucose', ambientTemperature: 'Ambient temperature', humidity: 'Humidity', skinTemperatureDeviation: 'Skin-temperature deviation'
};
export const CLINICAL_KINDS: Measurement['kind'][] = ['temperature', 'heartRate', 'bloodPressure', 'respiratoryRate', 'spo2', 'glucose'];
export const TIME_LABEL: Record<TimelineEvent['kind'], string> = {
  activityStart: 'Activity started', activityEnd: 'Activity stopped', symptomOnset: 'Symptom onset', lastKnownWell: 'Last known well',
  discovery: 'Found by witness', collapse: 'Collapse', deviceFall: 'Device-reported fall', call: 'Emergency call', arrival: 'Crew arrival',
  transport: 'Transport', handoff: 'Handoff'
};
export const COOLING_LABEL: Record<Measurement['coolingPhase'], string> = { before: 'before cooling', during: 'during cooling', after: 'after cooling', unknown: 'cooling phase not documented' };
export const OBS_LABEL: Record<Observation['category'], string> = {
  account: 'Witness / account', mental_status: 'Mental status', skin: 'Skin', exertion: 'Exertion', environment: 'Environment', history: 'History', general: 'General'
};

const byTime = <T,>(get: (x: T) => string | null) => (a: T, b: T) => (get(a) ?? '9999').localeCompare(get(b) ?? '9999');

export function formatValue(m: Measurement): string {
  if (m.status === 'not_obtained') return 'Not performed';
  if (m.value === null) return 'Value not documented';
  return m.kind === 'bloodPressure' ? `${m.value}/${m.value2 ?? '?'} ${m.unit}` : `${m.value} ${m.unit}`;
}

export type PhaseLabel = { phase: Measurement['coolingPhase'] | 'no-time'; label: string; derived: boolean };

/**
 * Cooling phase of a reading. The crew's explicit entry wins. Otherwise it is placed relative to
 * documented cooling care events by time ("from cooling times"); without a time it cannot be placed.
 */
export function phaseOf(m: Measurement, care: CareEvent[] = []): PhaseLabel {
  if (m.coolingPhase !== 'unknown') return { phase: m.coolingPhase, label: cap(COOLING_LABEL[m.coolingPhase]), derived: false };
  const cooling = care.filter(c => c.category === 'cooling' && c.startedAt).sort(byTime(c => c.startedAt));
  if (cooling.length === 0) return { phase: 'unknown', label: 'Cooling phase not documented', derived: false };
  if (!m.eventTime) return { phase: 'no-time', label: 'Time not documented', derived: false };
  const t = m.eventTime, first = cooling[0].startedAt!, last = cooling.at(-1)!;
  const derived = (p: Measurement['coolingPhase']) => ({ phase: p, label: `${cap(COOLING_LABEL[p])} (from cooling times)`, derived: true });
  if (t < first) return derived('before');
  if (!last.endedAt || t <= last.endedAt) return derived('during');
  return derived('after');
}
const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);

export function describeMeasurement(m: Measurement, care: CareEvent[] = []): string {
  const parts = [`${MEASUREMENT_LABEL[m.kind]} ${formatValue(m)}`];
  if (m.kind === 'temperature') parts.push(m.method ? `method/site: ${m.method}` : 'method/site not documented');
  parts.push(m.eventTime ? `at ${clock(m.eventTime)}` : 'time not documented');
  if (CLINICAL_KINDS.includes(m.kind)) { const p = phaseOf(m, care); if (m.kind === 'temperature' || p.phase !== 'unknown') parts.push(p.label.toLowerCase()); }
  parts.push(m.sourceKind === 'manual' ? `entered manually by ${m.recordedBy}${m.device ? ` (${m.device})` : ''}` : m.sourceKind === 'wearable' ? `consumer wearable${m.synthetic ? ', synthetic' : ''}` : 'reference source');
  if (m.note) parts.push(m.note);
  return parts.join(' · ');
}

export function describeCare(c: CareEvent): string {
  const span = c.startedAt ? `${clock(c.startedAt)}–${c.endedAt ? clock(c.endedAt) : 'ongoing / stop not documented'}` : 'start not documented';
  return `${c.action} (${span})${c.note ? ` · ${c.note}` : ''} · recorded by ${c.recordedBy}`;
}

export function describeTime(t: TimelineEvent): string {
  return `${TIME_LABEL[t.kind]}: ${t.time ? `${t.certainty === 'recorded' ? '' : '≈'}${clock(t.time)} (${t.certainty})` : 'Unknown'}${t.note ? ` · ${t.note}` : ''}`;
}

/** Latest entry per kind for a timeline-ish list, preferring entries that have a time. */
export function latestTime(events: TimelineEvent[], kind: TimelineEvent['kind']): TimelineEvent | undefined {
  return events.filter(e => e.kind === kind).at(-1);
}

export function buildDraft(incident: WorkspaceIncident): HandoffDraft {
  const obs = incident.observations;
  const active = obs.filter(o => o.status === 'active');
  const clinical = incident.measurements.filter(m => CLINICAL_KINDS.includes(m.kind)).sort(byTime(m => m.eventTime));
  const context = incident.measurements.filter(m => !CLINICAL_KINDS.includes(m.kind));
  const care = [...incident.careEvents].sort(byTime(c => c.startedAt));
  const item = (text: string, sourceIds: string[] = [], note: string | null = null) => ({ text, sourceIds, note });
  const obsItems = (cats: Observation['category'][]) => active.filter(o => cats.includes(o.category)).map(o => item(`${OBS_LABEL[o.category]}: “${o.text}”${o.observedAt ? ` (observed ${clock(o.observedAt)})` : ''}`, [o.sourceId]));

  const ctx = incident.patient.context;
  const history = [
    ctx?.age ? item(`Age: ${ctx.age}`) : null,
    ctx?.history ? item(`History: ${ctx.history}`) : null,
    ctx?.allergies ? item(`Allergies: ${ctx.allergies}`) : null,
    ctx?.medications ? item(`Medications: ${ctx.medications}`) : null
  ].filter((x): x is NonNullable<typeof x> => x !== null);

  const temps = clinical.filter(m => m.kind === 'temperature' && m.status === 'obtained');
  const missingKinds = CLINICAL_KINDS.filter(k => !clinical.some(m => m.kind === k));
  const changes = incident.observationCorrections.flatMap(k => {
    const a = obs.find(o => o.id === k.originalObservationId), b = obs.find(o => o.id === k.replacementObservationId);
    return a && b ? [item(`Original kept: “${a.text}” · Clarification: “${b.text}”`, [a.sourceId, b.sourceId])] : [];
  });
  const sections: DraftSection[] = [
    { id: 'summary', title: 'Summary', items: [...obsItems(['account', 'general']), ...obsItems(['mental_status', 'skin'])] },
    { id: 'times', title: 'Times', items: [...incident.timelineEvents].sort(byTime(t => t.time)).map(t => item(describeTime(t), t.sourceIds, t.kind === 'discovery' ? 'Discovery time, not collapse time.' : null)) },
    { id: 'measurements', title: 'Measurements', items: [
      ...clinical.map(m => item(describeMeasurement(m, care), [m.sourceId])),
      ...(missingKinds.length ? [item(`Not documented: ${missingKinds.map(k => MEASUREMENT_LABEL[k]).join(', ')}`)] : [])
    ] },
    { id: 'care', title: 'Care performed', items: care.map(c => item(describeCare(c), [c.sourceId])) },
    { id: 'observations', title: 'EMT observations and clarifications', items: changes },
    { id: 'exertion', title: 'Exertion and environment', items: [...obsItems(['exertion', 'environment']), ...context.map(m => item(describeMeasurement(m), [m.sourceId], m.kind === 'ambientTemperature' ? 'Environmental reading, not body temperature.' : m.kind === 'skinTemperatureDeviation' ? 'Consumer skin-temperature deviation, not core temperature.' : null))] },
    { id: 'history', title: 'Relevant history', items: [...history, ...obsItems(['history'])] },
    { id: 'device', title: 'Wearable background — consumer device, not clinical', items: incident.sources.filter(s => s.type === 'wearable').map(s => item(`${s.label}${s.eventTime ? ` · device time ${clock(s.eventTime)}` : ''}: ${s.text}`, [s.id])) }
  ];

  const uncertainties: HandoffDraft['uncertainties'] = [];
  for (const kind of ['collapse', 'symptomOnset'] as const) {
    const t = latestTime(incident.timelineEvents, kind);
    if (!t || t.time === null) uncertainties.push({ label: TIME_LABEL[kind], state: t ? 'unknown' : 'not_documented', detail: t?.note ?? null });
  }
  if (!active.some(o => o.category === 'mental_status')) uncertainties.push({ label: 'Mental status', state: 'not_documented', detail: null });
  const tempNotObtained = clinical.find(m => m.kind === 'temperature' && m.status === 'not_obtained');
  if (temps.length === 0) uncertainties.push({ label: 'Clinical temperature', state: tempNotObtained ? 'not_obtained' : 'not_documented', detail: tempNotObtained?.note ?? (tempNotObtained ? null : 'Not yet measured.') });
  for (const m of temps) if (!m.method) uncertainties.push({ label: `Temperature at ${clock(m.eventTime)}`, state: 'not_documented', detail: 'Measurement method/site not documented.' });
  for (const m of temps) if (phaseOf(m, care).phase === 'unknown' || phaseOf(m, care).phase === 'no-time') uncertainties.push({ label: `Temperature at ${clock(m.eventTime)}`, state: 'not_documented', detail: 'Whether taken before or after cooling is not documented.' });
  for (const f of incident.feedback.filter(f => f.status === 'open' || f.status === 'deferred')) {
    const about = obs.find(o => f.observationIds.includes(o.id));
    uncertainties.push({ label: f.status === 'deferred' ? 'Deferred clarification' : 'Open clarification', state: 'unresolved', detail: about ? `“${about.text}” — ${f.suggestedQuestion ?? f.message}` : f.suggestedQuestion ?? f.message });
  }

  const sourceIds = [...new Set(sections.flatMap(s => s.items.flatMap(i => i.sourceIds)))];
  return { revision: incident.revision, sections, sourceIds, uncertainties, mode: 'website-grouped' };
}

/** Plain-text rendering of a draft, used for the shared handoff text and the export. */
export function draftText(draft: HandoffDraft): string {
  const lines = ['TRAUMA LLAMA — ER HANDOFF', 'SYNTHETIC DEMO — NOT A REAL PATIENT. Crew review does not clinically verify reported information.', `Revision ${draft.revision}`];
  for (const s of draft.sections) {
    lines.push('', s.title.toUpperCase());
    if (s.items.length === 0) lines.push('  Not documented');
    for (const i of s.items) lines.push(`  - ${i.text}${i.note ? ` [${i.note}]` : ''}${i.sourceIds.length ? ` [sources: ${i.sourceIds.map(x => x.slice(0, 8)).join(', ')}]` : ''}`);
  }
  lines.push('', 'UNRESOLVED / UNCERTAIN / NOT DOCUMENTED');
  if (draft.uncertainties.length === 0) lines.push('  None listed');
  for (const u of draft.uncertainties) lines.push(`  - ${u.label}: ${({ unknown: 'Unknown', not_documented: 'Not documented', not_obtained: 'Not performed', unresolved: 'Unresolved' } as const)[u.state]}${u.detail ? ` — ${u.detail}` : ''}`);
  return lines.join('\n');
}
