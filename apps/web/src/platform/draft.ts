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
  if (m.status === 'not_obtained') return 'Not obtained';
  if (m.value === null) return 'Value not documented';
  return m.kind === 'bloodPressure' ? `${m.value}/${m.value2 ?? '?'} ${m.unit}` : `${m.value} ${m.unit}`;
}

export function describeMeasurement(m: Measurement): string {
  const parts = [`${MEASUREMENT_LABEL[m.kind]} ${formatValue(m)}`];
  if (m.kind === 'temperature') parts.push(m.method ? `method/site: ${m.method}` : 'method/site not documented');
  parts.push(m.eventTime ? `at ${clock(m.eventTime)}` : 'time not documented');
  if (m.kind === 'temperature' || m.coolingPhase !== 'unknown') parts.push(COOLING_LABEL[m.coolingPhase]);
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
  const sections: DraftSection[] = [
    { id: 'presentation', title: 'Presentation and account', items: obsItems(['account', 'general']) },
    { id: 'neuro', title: 'Mental status and clinical observations', items: obsItems(['mental_status', 'skin']) },
    { id: 'measurements', title: 'Clinical measurements (chronological)', items: clinical.map(m => item(describeMeasurement(m), [m.sourceId])) },
    { id: 'care', title: 'Care performed and response', items: care.map(c => item(describeCare(c), [c.sourceId])) },
    { id: 'exertion', title: 'Exertion and environment', items: [...obsItems(['exertion', 'environment']), ...context.map(m => item(describeMeasurement(m), [m.sourceId], m.kind === 'ambientTemperature' ? 'Environmental reading, not body temperature.' : m.kind === 'skinTemperatureDeviation' ? 'Consumer skin-temperature deviation, not core temperature.' : null))] },
    { id: 'history', title: 'Relevant history', items: [...history, ...obsItems(['history'])] },
    { id: 'timeline', title: 'Timeline (source-linked)', items: [...incident.timelineEvents].sort(byTime(t => t.time)).map(t => item(describeTime(t), t.sourceIds)) },
    { id: 'changes', title: 'Changed during this incident', items: incident.observationCorrections.flatMap(k => {
      const a = obs.find(o => o.id === k.originalObservationId), b = obs.find(o => o.id === k.replacementObservationId);
      return a && b ? [item(`Earlier: “${a.text}” → clarified: “${b.text}”`, [a.sourceId, b.sourceId])] : [];
    }) },
    { id: 'device', title: 'Device context (secondary)', items: incident.sources.filter(s => s.type === 'wearable').map(s => item(`${s.label}${s.eventTime ? ` · ${clock(s.eventTime)}` : ''}: ${s.text}`, [s.id])) }
  ];

  const uncertainties: HandoffDraft['uncertainties'] = [];
  for (const kind of ['collapse', 'symptomOnset'] as const) {
    const t = latestTime(incident.timelineEvents, kind);
    if (!t || t.time === null) uncertainties.push({ label: TIME_LABEL[kind], state: t ? 'unknown' : 'not_documented', detail: t?.note ?? null });
  }
  if (!active.some(o => o.category === 'mental_status')) uncertainties.push({ label: 'Mental status', state: 'not_documented', detail: null });
  const tempNotObtained = clinical.find(m => m.kind === 'temperature' && m.status === 'not_obtained');
  if (temps.length === 0) uncertainties.push({ label: 'Clinical temperature', state: tempNotObtained ? 'not_obtained' : 'not_documented', detail: tempNotObtained?.note ?? null });
  for (const m of temps) if (!m.method) uncertainties.push({ label: `Temperature at ${clock(m.eventTime)}`, state: 'not_documented', detail: 'Measurement method/site not documented.' });
  for (const m of temps) if (m.coolingPhase === 'unknown') uncertainties.push({ label: `Temperature at ${clock(m.eventTime)}`, state: 'not_documented', detail: 'Whether taken before or after cooling is not documented.' });
  for (const f of incident.feedback.filter(f => f.status === 'open' || f.status === 'deferred')) uncertainties.push({ label: 'Open assistant question', state: 'unresolved', detail: f.suggestedQuestion ?? f.message });

  const sourceIds = [...new Set(sections.flatMap(s => s.items.flatMap(i => i.sourceIds)))];
  return { revision: incident.revision, sections, sourceIds, uncertainties, mode: 'website-grouped' };
}

/** Plain-text rendering of a draft, used for the shared handoff text and the export. */
export function draftText(draft: HandoffDraft): string {
  const lines = ['SYNTHETIC DEMO — crew-reviewed handoff. Review does not clinically verify reported information.', `Revision ${draft.revision}`];
  for (const s of draft.sections) {
    lines.push('', s.title.toUpperCase());
    if (s.items.length === 0) lines.push('  Not documented');
    for (const i of s.items) lines.push(`  - ${i.text}${i.note ? ` [${i.note}]` : ''}${i.sourceIds.length ? ` [sources: ${i.sourceIds.map(x => x.slice(0, 8)).join(', ')}]` : ''}`);
  }
  lines.push('', 'UNCERTAIN / NOT DOCUMENTED');
  if (draft.uncertainties.length === 0) lines.push('  None listed');
  for (const u of draft.uncertainties) lines.push(`  - ${u.label}: ${u.state.replace('_', ' ')}${u.detail ? ` — ${u.detail}` : ''}`);
  return lines.join('\n');
}
