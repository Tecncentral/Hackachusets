import type { Incident } from './incident.js';

/** Referential-integrity problems in an incident. An empty list means every reference resolves. */
export function findIntegrityProblems(incident: Incident): string[] {
  const problems: string[] = [];
  const sources = new Set(incident.sources.map(s => s.id));
  const seen = new Set<string>();
  const unique = (kind: string, id: string) => { if (seen.has(id)) problems.push(`Duplicate ${kind} id ${id}`); seen.add(id); };
  const linked = (kind: string, id: string, ids: string[]) => { for (const s of ids) if (!sources.has(s)) problems.push(`${kind} ${id} references missing source ${s}`); };

  incident.sources.forEach(s => unique('source', s.id));
  const collections = {
    claim: incident.claims, observation: incident.observations, measurement: incident.measurements, careEvent: incident.careEvents,
    timelineEvent: incident.timelineEvents, contextFact: incident.contextFacts, environmentReading: incident.environmentReadings,
  } as const;
  const byType = new Map<string, Set<string>>();
  for (const [kind, records] of Object.entries(collections)) {
    byType.set(kind, new Set(records.map(r => r.id)));
    for (const r of records) { unique(kind, r.id); linked(kind, r.id, r.sourceIds); }
  }
  for (const w of incident.wearableRecords) { unique('wearableRecord', w.id); linked('wearableRecord', w.id, [w.sourceId]); }

  for (const c of incident.corrections) {
    const ids = byType.get(c.targetType)!;
    if (!ids.has(c.originalId)) problems.push(`Correction ${c.id} references missing ${c.targetType} ${c.originalId}`);
    if (!ids.has(c.replacementId)) problems.push(`Correction ${c.id} references missing ${c.targetType} ${c.replacementId}`);
  }
  const observations = byType.get('observation')!;
  const evaluations = new Set(incident.evaluations.map(e => e.id));
  const references = new Set(incident.knowledgeReferences.map(k => k.id));
  const feedback = new Set(incident.feedback.map(f => f.id));
  for (const f of incident.feedback) {
    if (!evaluations.has(f.evaluationId)) problems.push(`Feedback ${f.id} references missing evaluation ${f.evaluationId}`);
    for (const o of f.observationIds) if (!observations.has(o)) problems.push(`Feedback ${f.id} references missing observation ${o}`);
    linked('Feedback', f.id, f.evidenceSourceIds);
    for (const k of f.knowledgeReferenceIds) if (!references.has(k)) problems.push(`Feedback ${f.id} references missing knowledge reference ${k}`);
  }
  for (const e of incident.evaluations) for (const id of e.feedbackIds) if (!feedback.has(id)) problems.push(`Evaluation ${e.id} references missing feedback ${id}`);
  for (const r of incident.resolutions) {
    if (!feedback.has(r.feedbackId)) problems.push(`Resolution ${r.id} references missing feedback ${r.feedbackId}`);
    if (r.clarificationObservationId && !observations.has(r.clarificationObservationId)) problems.push(`Resolution ${r.id} references missing observation ${r.clarificationObservationId}`);
  }
  for (const o of incident.observations) if (o.clarifiesFeedbackId && !feedback.has(o.clarifiesFeedbackId)) problems.push(`Observation ${o.id} references missing feedback ${o.clarifiesFeedbackId}`);
  return problems;
}
