import type { Incident, HandoffDraft, Handoff, HandoffItem, HandoffSection, Uncertainty, Measurement, CorrectableTypeValue, SourceRecord } from '@scenebrief/contracts';
import { visibleRecord } from './visibility.js';
import { formatTime, localDay, describeMeasurement, describeCareEvent, describeTimelineEvent, describeFact, describeEnvironment, describeObservation, MEASUREMENT_LABEL, PHASE_LABEL, TIMELINE_LABEL, FACT_LABEL } from './describe.js';

// Deterministic ER handoff: a structured rendering of the stored record. No model is involved.
// Missing information is reported as "not documented" and never rendered as a normal finding.

const item = (text: string, state: HandoffItem['state'], recordIds: string[] = [], sourceIds: string[] = []): HandoffItem => ({ text, state, recordIds, sourceIds });
const sentence = (s: string) => (/[.!?]$/.test(s) ? s : `${s}.`);
const current = <T extends { status: string }>(records: T[]) => records.filter(r => r.status === 'current');
const byTime = <T>(get: (r: T) => string | null) => (a: T, b: T) => {
  const x = get(a), y = get(b);
  return x === y ? 0 : x === null ? 1 : y === null ? -1 : Date.parse(x) - Date.parse(y);
};
const CORE_VITALS: Measurement['kind'][] = ['body_temperature', 'heart_rate', 'blood_pressure', 'respiratory_rate', 'spo2', 'glucose'];

type Phase = Exclude<Measurement['coolingPhase'], 'unknown'>;
function coolingRelation(time: string | null, intervals: { start: number; end: number | null }[]): Phase | null {
  if (!time || intervals.length === 0) return null;
  const t = Date.parse(time);
  if (t < Math.min(...intervals.map(i => i.start))) return 'before_cooling';
  if (intervals.some(i => t >= i.start && (i.end === null || t <= i.end))) return 'during_cooling';
  return 'after_cooling';
}

function referenceDay(incident: Incident): string | null {
  const anchor = incident.timelineEvents.find(t => t.status === 'current' && t.time && ['emergency_call', 'crew_arrival', 'patient_contact'].includes(t.kind));
  return anchor?.time ? localDay(anchor.time) : null;
}

export function buildHandoffDraft(incident: Incident, now: Date): HandoffDraft {
  const view = visibleRecord(incident);
  const day = referenceDay(view);
  const matched = view.patient.matched;
  const observations = current(view.observations).sort(byTime(o => o.observedAt));
  const facts = current(view.contextFacts);
  const measurements = current(view.measurements);
  const care = current(view.careEvents).sort(byTime(c => c.startedAt));
  const timeline = current(view.timelineEvents);
  const legacyClaims = view.claims.filter(c => c.status !== 'superseded');
  const uncertainties: Uncertainty[] = [];
  const unsure = (topic: string, state: Uncertainty['state'], text: string, sourceIds: string[] = []) => uncertainties.push({ topic, state, text, sourceIds });
  const obsItem = (o: typeof observations[number]) => item(describeObservation(o, day), o.reportedBy === 'crew' ? 'documented' : 'reported', [o.id], o.sourceIds);
  const factItem = (f: typeof facts[number]) => item(describeFact(f), f.state === 'unknown' ? 'unknown' : f.reportedBy === 'crew' ? 'documented' : 'reported', [f.id], f.sourceIds);
  const orEmpty = (items: HandoffItem[], text: string) => (items.length ? items : [item(text, 'not_documented')]);

  // Presentation
  const presentation = [
    ...view.sources.filter(s => s.type === 'dispatch').map(s => item(`Dispatch: ${s.text}`, 'reported', [], [s.id])),
    ...legacyClaims.filter(c => c.field === 'account').map(c => item(`Reported account (legacy transcript): \u201c${c.value}\u201d`, 'reported', [c.id], c.sourceIds)),
    ...observations.filter(o => o.category === 'account' || o.category === 'general').map(obsItem),
  ];

  // Exertion and environment
  const exertionFacts = facts.filter(f => ['activity', 'exertion_duration', 'exertion_intensity', 'location', 'clothing_equipment', 'acclimatization'].includes(f.category));
  const environment = current(view.environmentReadings).sort(byTime(e => e.measuredAt));
  const exertionEnvironment = [
    ...(exertionFacts.length ? exertionFacts.map(factItem) : [item('Exertion details: not documented.', 'not_documented')]),
    ...(environment.length ? environment.map(e => item(describeEnvironment(e, day), 'documented', [e.id], e.sourceIds)) : [item('Environmental conditions: not documented.', 'not_documented')]),
  ];

  // Neurological and skin observations
  const loc = facts.filter(f => f.category === 'loss_of_consciousness');
  const neurological = [...observations.filter(o => o.category === 'neurological' || o.category === 'skin').map(obsItem), ...loc.map(factItem)];

  // Measurements, with cooling relation checked against care-event times
  const intervals = care.filter(c => c.kind === 'cooling' && c.performance === 'performed' && c.startedAt).map(c => ({ start: Date.parse(c.startedAt!), end: c.endedAt ? Date.parse(c.endedAt) : null }));
  const measurementItems: HandoffItem[] = [];
  for (const kind of [...CORE_VITALS, 'skin_temperature'] as const) {
    const readings = measurements.filter(m => m.kind === kind).sort(byTime(m => m.measuredAt));
    if (!readings.length) { if (kind !== 'skin_temperature') measurementItems.push(item(`${MEASUREMENT_LABEL[kind]}: not documented.`, 'not_documented')); continue; }
    for (const m of readings) {
      const derived = coolingRelation(m.measuredAt, intervals);
      let text = describeMeasurement(m, day);
      if (m.coolingPhase === 'unknown' && derived) text += ` (care-event times place this reading ${PHASE_LABEL[derived]})`;
      if (m.coolingPhase !== 'unknown' && derived && derived !== m.coolingPhase) unsure(`${MEASUREMENT_LABEL[kind]} timing`, 'conflicting', `${MEASUREMENT_LABEL[kind]} at ${formatTime(m.measuredAt, day)} is recorded as ${PHASE_LABEL[m.coolingPhase]}, but care-event times place it ${PHASE_LABEL[derived]}. Verify.`, m.sourceIds);
      if (m.coolingPhase === 'unknown' && !derived && intervals.length) unsure(`${MEASUREMENT_LABEL[kind]} timing`, 'unknown', `${MEASUREMENT_LABEL[kind]} ${m.measuredAt ? `at ${formatTime(m.measuredAt, day)}` : '(time unknown)'}: relation to cooling unknown.`, m.sourceIds);
      if (!m.measuredAt) unsure(`${MEASUREMENT_LABEL[kind]} time`, 'unknown', `${MEASUREMENT_LABEL[kind]} ${m.value} ${m.unit}: measurement time unknown.`, m.sourceIds);
      if (m.site === 'unknown') unsure('Temperature method', 'unknown', `Body temperature ${m.value} ${m.unit} at ${formatTime(m.measuredAt, day)}: measurement site/method unknown.`, m.sourceIds);
      measurementItems.push(item(text, 'documented', [m.id], m.sourceIds));
    }
  }
  const bodyTemps = measurements.filter(m => m.kind === 'body_temperature');
  // A reading counts as pre-cooling only if its recorded phase and the care-event times agree (or one is unknown).
  const effectivePhase = (m: Measurement) => {
    const derived = coolingRelation(m.measuredAt, intervals);
    if (m.coolingPhase === 'unknown') return derived;
    return derived && derived !== m.coolingPhase ? null : m.coolingPhase;
  };
  if (!bodyTemps.length) unsure('Clinical body temperature', 'not_documented', `No clinical body temperature documented.${measurements.some(m => m.kind === 'skin_temperature') || view.wearableRecords.some(w => w.metric === 'skin_temperature_deviation') ? ' Skin or wearable temperature readings do not substitute for it.' : ''}`);
  else if (intervals.length && !bodyTemps.some(m => effectivePhase(m) === 'before_cooling')) {
    unsure('Pre-cooling temperature', 'not_documented', 'No body temperature before cooling is documented. Readings taken after cooling started do not show the pre-cooling temperature.');
  }
  const missingVitals = CORE_VITALS.filter(k => k !== 'body_temperature' && !measurements.some(m => m.kind === k)).map(k => MEASUREMENT_LABEL[k].toLowerCase().replace('spo2', 'SpO2'));
  if (missingVitals.length) unsure('Vital signs', 'not_documented', `Not documented: ${missingVitals.join(', ')}.`);

  // Care and response
  const careItems = [
    ...care.map(c => item(describeCareEvent(c, day), c.performance === 'unknown' ? 'unknown' : 'documented', [c.id], c.sourceIds)),
    ...observations.filter(o => o.category === 'care_response' || o.category === 'reassessment').map(obsItem),
  ];
  for (const c of care) if (c.kind === 'cooling' && c.performance === 'performed' && !c.startedAt) unsure('Cooling start', 'unknown', `Cooling (${c.description}): start time unknown.`, c.sourceIds);

  // Relevant history
  const historyFacts = facts.filter(f => ['age', 'sex', 'relevant_history', 'allergy', 'medication', 'witness_contact', 'other'].includes(f.category));
  const history = [
    ...(!matched ? [item('Patient association not confirmed: profile history is excluded.', 'not_documented')] : []),
    ...historyFacts.map(factItem),
    ...(['age', 'relevant_history', 'allergy', 'medication'] as const).filter(k => !historyFacts.some(f => f.category === k)).map(k => item(`${FACT_LABEL[k]}: not documented.`, 'not_documented')),
  ];

  // Device context (consumer wearable, background only)
  const sourceById = new Map(view.sources.map(s => [s.id, s]));
  const device = !matched
    ? [item('Not shown: patient association not confirmed.', 'not_documented')]
    : view.wearableStatus.availability === 'unavailable' || !view.wearableRecords.length
      ? [item(`No wearable data available. ${view.wearableStatus.note}`, 'not_documented')]
      : [item(`Consumer wearable data — background only. ${view.wearableStatus.note}`, 'reported'),
        ...view.wearableRecords.map(w => item(`${w.summary} ${w.limitation}${w.gaps ? ` Gaps: ${w.gaps}` : ''}${sourceById.get(w.sourceId)?.origin === 'synthetic_fixture' ? ' (synthetic fixture)' : ''}`, 'reported', [w.id], [w.sourceId]))];

  // Timeline (legacy claims are shown only when no structured event of the same kind exists)
  const hasKind = (k: string) => timeline.some(t => t.kind === k);
  const timelineItems = [
    ...[...timeline].sort(byTime(t => t.time)).map(t => item(describeTimelineEvent(t, day), t.certainty === 'unknown' ? 'unknown' : t.reportedBy === 'crew' || t.reportedBy === 'dispatch' || t.reportedBy === 'device' ? 'documented' : 'reported', [t.id], t.sourceIds)),
    ...legacyClaims.filter(c => c.field === 'discoveryTime' && !hasKind('discovery')).map(c => item(`Discovery (reported): ${c.value}`, 'reported', [c.id], c.sourceIds)),
    ...legacyClaims.filter(c => c.field === 'collapseTime' && !hasKind('collapse')).map(c => item(`Collapse time: ${c.value ?? 'unknown'}`, c.value ? 'reported' : 'unknown', [c.id], c.sourceIds)),
  ];
  for (const kind of ['symptom_onset', 'collapse', 'discovery', 'last_known_normal'] as const) {
    const label = kind === 'discovery' ? 'Discovery time' : `${TIMELINE_LABEL[kind]}${kind === 'last_known_normal' ? '' : ' time'}`;
    const events = timeline.filter(t => t.kind === kind);
    const claim = legacyClaims.find(c => c.field === (kind === 'collapse' ? 'collapseTime' : kind === 'discovery' ? 'discoveryTime' : ''));
    const ids = [...events.flatMap(e => e.sourceIds), ...(claim?.sourceIds ?? [])];
    if (events.some(e => e.certainty === 'recorded')) continue;
    const approx = events.find(e => e.certainty === 'approximate');
    if (approx) unsure(label, 'approximate', sentence(`${label}: approximate (~${formatTime(approx.time, day)}, ${approx.reportedBy})${approx.note ? ` — ${approx.note}` : ''}`), ids);
    else if (!events.length && claim?.value) unsure(label, 'approximate', `${label}: reported as \u201c${claim.value}\u201d`, ids);
    else if (events.length || claim) unsure(label, 'unknown', `${label}: unknown.${events.find(e => e.note)?.note ? ` ${events.find(e => e.note)!.note}` : ''}`, ids);
    else unsure(label, 'not_documented', `${label}: not documented.`);
  }
  if (!loc.length) unsure('Loss of consciousness', 'not_documented', 'Duration of any loss of consciousness: not documented.');
  else if (loc.every(f => f.state === 'unknown')) unsure('Loss of consciousness', 'unknown', 'Duration of any loss of consciousness: unknown.', loc.flatMap(f => f.sourceIds));
  if (!matched) unsure('Patient association', 'not_documented', 'Patient association not confirmed; profile history and wearable context are excluded.');

  // Changes
  const changes = [...incident.corrections].sort(byTime(c => c.recordedAt)).flatMap(c => {
    const original = findRecord(view, c.targetType, c.originalId, day), replacement = findRecord(view, c.targetType, c.replacementId, day);
    if (!original || !replacement) return [];
    const how = c.feedbackId ? ' \u2014 crew clarification after assistant feedback' : '';
    return [item(`${TYPE_LABEL[c.targetType]} corrected at ${formatTime(c.recordedAt, day)} by ${c.author}: ${original.text} \u2192 ${replacement.text}${c.reason ? ` \u2014 reason: ${c.reason}` : ''}${how}`, 'documented', [c.originalId, c.replacementId], [...new Set([...original.sourceIds, ...replacement.sourceIds])])];
  });

  const sections: HandoffSection[] = [
    { id: 'presentation', title: 'Presentation', items: orEmpty(presentation, 'No presentation details documented.') },
    { id: 'exertion_environment', title: 'Exertion and environment', items: exertionEnvironment },
    { id: 'neurological', title: 'Neurological and skin observations', items: orEmpty(neurological, 'No neurological or skin observations documented.') },
    { id: 'measurements', title: 'Clinical measurements', items: measurementItems },
    { id: 'care', title: 'Care and response', items: orEmpty(careItems, 'No care actions documented. Not documented does not mean not performed.') },
    { id: 'history', title: 'Relevant history', items: history },
    { id: 'device_context', title: 'Device context (consumer wearable, background only)', items: device },
    { id: 'timeline', title: 'Timeline (source-linked)', items: orEmpty(timelineItems, 'No timeline events documented.') },
    { id: 'changes', title: 'Changes and corrections', items: changes.length ? changes : [item('No corrections recorded.', 'documented')] },
  ];
  const sourceIds = [...new Set([...sections.flatMap(s => s.items.flatMap(i => i.sourceIds)), ...uncertainties.flatMap(u => u.sourceIds)])];
  const header = [`HANDOFF DRAFT \u2014 not yet reviewed \u00b7 incident ${incident.id} \u00b7 revision ${incident.revision}`];
  return { incidentId: incident.id, revision: incident.revision, status: 'draft', synthetic: true, generatedAt: now.toISOString(), patientMatched: matched, sections, sourceIds, uncertainties, text: renderText(header, sections, uncertainties, []) };
}

const TYPE_LABEL: Record<CorrectableTypeValue, string> = { claim: 'Claim', observation: 'Observation', measurement: 'Measurement', careEvent: 'Care event', timelineEvent: 'Timeline event', contextFact: 'Context', environmentReading: 'Environment reading' };

function findRecord(incident: Incident, type: CorrectableTypeValue, id: string, day: string | null): { text: string; sourceIds: string[] } | undefined {
  const quote = (s: string) => `\u201c${s}\u201d`;
  switch (type) {
    case 'claim': { const r = incident.claims.find(x => x.id === id); return r && { text: quote(`${r.field}: ${r.value ?? 'unknown'}`), sourceIds: r.sourceIds }; }
    case 'observation': { const r = incident.observations.find(x => x.id === id); return r && { text: quote(r.text), sourceIds: r.sourceIds }; }
    case 'measurement': { const r = incident.measurements.find(x => x.id === id); return r && { text: quote(describeMeasurement(r, day)), sourceIds: r.sourceIds }; }
    case 'careEvent': { const r = incident.careEvents.find(x => x.id === id); return r && { text: quote(describeCareEvent(r, day)), sourceIds: r.sourceIds }; }
    case 'timelineEvent': { const r = incident.timelineEvents.find(x => x.id === id); return r && { text: quote(describeTimelineEvent(r, day)), sourceIds: r.sourceIds }; }
    case 'contextFact': { const r = incident.contextFacts.find(x => x.id === id); return r && { text: quote(describeFact(r)), sourceIds: r.sourceIds }; }
    case 'environmentReading': { const r = incident.environmentReadings.find(x => x.id === id); return r && { text: quote(describeEnvironment(r, day)), sourceIds: r.sourceIds }; }
  }
}

const DISCLAIMER = 'SYNTHETIC DEMO RECORD \u2014 not for clinical use. Generated deterministically from the crew-entered record; supports, not replaces, the verbal handoff.';

function renderText(header: string[], sections: HandoffSection[], uncertainties: Uncertainty[], changeSummary: string[]): string {
  const lines = [DISCLAIMER, ...header];
  if (changeSummary.length) lines.push('', 'CHANGES SINCE PREVIOUS VERSION', ...changeSummary.map(c => `- ${c}`));
  for (const s of sections) {
    lines.push('', s.title.toUpperCase());
    for (const i of s.items) lines.push(`- ${i.text}${i.sourceIds.length ? ` [sources: ${i.sourceIds.join(', ')}]` : ''}`);
  }
  lines.push('', 'UNCERTAIN OR NOT DOCUMENTED', ...(uncertainties.length ? uncertainties.map(u => `- ${u.text}`) : ['- None identified from the structured record.']));
  return lines.join('\n');
}

function itemKeys(sections: HandoffSection[]): Map<string, string> {
  return new Map(sections.flatMap(s => s.items.map(i => [`${s.title}: ${i.text}`, s.title] as const)));
}

/** Freeze a reviewed version. Later versions are amendments with a change summary against the previous one. */
export function reviewSnapshot(draft: HandoffDraft, reviewer: string, reviewedAt: Date, previous: Handoff | undefined): Handoff {
  const version = (previous?.version ?? 0) + 1;
  let changeSummary: string[] = [];
  if (previous) {
    const before = itemKeys(previous.sections), after = itemKeys(draft.sections);
    const added = [...after.keys()].filter(k => !before.has(k)).map(k => `Added \u2014 ${k}`);
    const removed = [...before.keys()].filter(k => !after.has(k)).map(k => `No longer current \u2014 ${k}`);
    changeSummary = [...added, ...removed];
    if (changeSummary.length > 30) changeSummary = [...changeSummary.slice(0, 30), `\u2026and ${changeSummary.length - 30} more changes.`];
    if (!changeSummary.length) changeSummary = ['No content changes in the structured sections.'];
  }
  const header = [`REVIEWED HANDOFF v${version}${previous ? ` (amends v${previous.version})` : ''} \u00b7 incident ${draft.incidentId} \u00b7 revision ${draft.revision} \u00b7 reviewed by ${reviewer} at ${formatTime(reviewedAt.toISOString())}`];
  return {
    version, revision: draft.revision, reviewedAt: reviewedAt.toISOString(), reviewedBy: reviewer,
    text: renderText(header, draft.sections, draft.uncertainties, changeSummary),
    kind: previous ? 'amendment' : 'initial', amendsVersion: previous?.version ?? null, patientMatched: draft.patientMatched,
    sections: draft.sections, sourceIds: draft.sourceIds, uncertainties: draft.uncertainties, changeSummary,
  };
}

const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Printable, self-contained HTML. All record text is escaped. */
export function renderHandoffHtml(doc: HandoffDraft | Handoff, sources: SourceRecord[], incidentId: string): string {
  const isDraft = 'status' in doc;
  const title = isDraft ? `Handoff draft \u2014 revision ${doc.revision} (not reviewed)` : `Reviewed handoff v${doc.version}${doc.amendsVersion ? ` (amends v${doc.amendsVersion})` : ''}`;
  const meta = isDraft
    ? `Generated ${formatTime(doc.generatedAt)} \u00b7 incident revision ${doc.revision}`
    : `Reviewed by ${doc.reviewedBy} at ${formatTime(doc.reviewedAt)} \u00b7 incident revision ${doc.revision}`;
  const used = sources.filter(s => doc.sourceIds.includes(s.id));
  const li = (i: HandoffItem) => `<li class="${i.state}">${escape(i.text)}${i.sourceIds.length ? ` <span class="src">[${i.sourceIds.map(escape).join(', ')}]</span>` : ''}</li>`;
  const changes = !isDraft && doc.changeSummary.length ? `<section><h2>Changes since previous version</h2><ul>${doc.changeSummary.map(c => `<li>${escape(c)}</li>`).join('')}</ul></section>` : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escape(title)}</title><style>
body{font:14px/1.45 system-ui,sans-serif;max-width:52rem;margin:1.5rem auto;padding:0 1rem;color:#111}
.banner{border:2px solid #b00;color:#b00;padding:.4rem .6rem;font-weight:600}
h1{font-size:1.3rem;margin:.8rem 0 .2rem}h2{font-size:1rem;border-bottom:1px solid #999;margin:1.1rem 0 .3rem}
ul{margin:.2rem 0;padding-left:1.2rem}.not_documented,.unknown{color:#8a4b00}.src{color:#555;font-size:.85em}
table{border-collapse:collapse;width:100%;font-size:.85em}td,th{border:1px solid #bbb;padding:.2rem .35rem;text-align:left;vertical-align:top}
@media print{.banner{border-color:#000;color:#000}body{margin:0}}
</style></head><body>
<div class="banner">${escape(DISCLAIMER)}</div>
<h1>${escape(title)}</h1><p>${escape(meta)} \u00b7 incident ${escape(incidentId)}</p>
${changes}
${doc.sections.map(s => `<section><h2>${escape(s.title)}</h2><ul>${s.items.map(li).join('')}</ul></section>`).join('\n')}
<section><h2>Uncertain or not documented</h2><ul>${doc.uncertainties.length ? doc.uncertainties.map(u => `<li class="${u.state}">${escape(u.text)}</li>`).join('') : '<li>None identified from the structured record.</li>'}</ul></section>
<section><h2>Sources</h2><table><tr><th>ID</th><th>Type</th><th>Label</th><th>Event time</th><th>Captured</th><th>Limitation</th></tr>${used.map(s => `<tr><td>${escape(s.id)}</td><td>${escape(s.type)}</td><td>${escape(s.label)}</td><td>${escape(formatTime(s.eventTime))}</td><td>${escape(formatTime(s.capturedAt))}</td><td>${escape(s.limitation ?? '')}</td></tr>`).join('')}</table></section>
</body></html>`;
}
