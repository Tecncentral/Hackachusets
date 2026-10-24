// Maps a response from the current platform (main @ 2f622d4: claims + voice sources, no
// observations/measurements) into the workspace view. Applied only when the response lacks the new
// collections. It derives records from what the platform stored; it never adds facts.
import { WorkspaceIncidentSchema, type WorkspaceIncident } from './boundary';
import { zoneDate, zoneTimeToIso } from './time';
import { fromCanonicalIncident, isCanonicalIncident } from './canonical';

type Raw = Record<string, unknown> & { sources?: Array<Record<string, any>>; claims?: Array<Record<string, any>>; corrections?: Array<Record<string, any>> };

export function isLegacy(raw: unknown): boolean {
  return typeof raw === 'object' && raw !== null && !('observations' in raw);
}

export function normalizeIncident(raw: unknown): WorkspaceIncident {
  // The current core platform returns the canonical incident (docs/core-api-contract.md).
  if (isCanonicalIncident(raw)) return fromCanonicalIncident(raw);
  const base = WorkspaceIncidentSchema.parse(raw);
  if (!isLegacy(raw)) return base;
  const r = raw as Raw;
  const claims = base.claims;
  const claimBySource = (id: string) => claims.find(c => c.sourceIds.includes(id));

  const observations = base.sources.filter(s => s.type === 'voice').map(s => {
    const claim = claimBySource(s.id);
    return {
      id: s.id, text: s.text, category: 'account' as const, observedAt: s.eventTime, capturedAt: s.capturedAt, sourceId: s.id,
      author: 'crew', inputMode: 'legacy' as const, status: claim?.status === 'superseded' ? 'clarified' as const : 'active' as const, baseRevision: null
    };
  });

  const timelineEvents: WorkspaceIncident['timelineEvents'] = [];
  for (const s of base.sources) {
    if (s.id === 'fall' && s.eventTime) timelineEvents.push({ id: `src-${s.id}`, kind: 'deviceFall', time: s.eventTime, certainty: 'recorded', note: s.text, sourceIds: [s.id], capturedAt: s.capturedAt });
    if (s.type === 'dispatch' && s.eventTime) timelineEvents.push({ id: `src-${s.id}`, kind: 'call', time: s.eventTime, certainty: 'recorded', note: s.text, sourceIds: [s.id], capturedAt: s.capturedAt });
    if (s.id === 'workout' && s.eventTime) timelineEvents.push({ id: `src-${s.id}`, kind: 'activityStart', time: s.eventTime, certainty: 'recorded', note: s.text, sourceIds: [s.id], capturedAt: s.capturedAt });
  }
  for (const c of claims) {
    if (c.field === 'account') continue;
    const kind = c.field === 'discoveryTime' ? 'discovery' : 'collapse';
    const hhmm = c.value?.match(/\b(\d{2}):(\d{2})\b/)?.[0] ?? null;
    const time = c.status === 'unknown' || !hhmm ? null : zoneTimeToIso(zoneDate(c.recordedAt), hhmm);
    timelineEvents.push({ id: `claim-${c.id}`, kind, time, certainty: time === null ? 'unknown' : 'reported', note: c.value, sourceIds: c.sourceIds, capturedAt: c.recordedAt });
  }

  const observationCorrections = (r.corrections ?? []).flatMap(k => {
    const from = claims.find(c => c.id === k.originalClaimId)?.sourceIds[0];
    const to = claims.find(c => c.id === k.replacementClaimId)?.sourceIds[0];
    return from && to ? [{ id: String(k.id), originalObservationId: from, replacementObservationId: to, feedbackId: null, author: String(k.author), recordedAt: String(k.recordedAt) }] : [];
  });

  return { ...base, observations, timelineEvents, observationCorrections };
}
