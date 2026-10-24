// Shared test helpers: a fresh development adapter around the platform's own IncidentStore, and
// canonical request bodies. Each call gets an isolated store (no shared module state).
import { IncidentStore } from '../../api/src/store';
import { createDevPlatform } from './platform/dev';
import type { CareEventInput, Incident, MeasurementInput, ObservationInput, TimelineEventInput } from './platform';

export function makePlatform(opts: ConstructorParameters<typeof IncidentStore>[0] = {}) {
  const store = new IncidentStore(opts);
  return { store, platform: createDevPlatform({ store }) };
}

export async function matched(p = makePlatform()) {
  await p.platform.setSharing(true);
  return { ...p, incident: await p.platform.match('patient-demo-01') };
}

let n = 0;
const rid = (prefix: string) => `${prefix}-${++n}`;

export const obs = (inc: Incident, text: string, over: Partial<ObservationInput> = {}): ObservationInput =>
  ({ requestId: rid('obs'), baseRevision: inc.revision, text, observedAt: null, ...over });

export const temp = (inc: Incident, value: number, measuredAt: string | null, coolingPhase: MeasurementInput['coolingPhase'] = 'unknown', over: Partial<MeasurementInput> = {}): MeasurementInput =>
  ({ requestId: rid('temp'), baseRevision: inc.revision, kind: 'body_temperature', value, unit: '°C', site: 'rectal', measuredAt, coolingPhase, deviceClass: 'clinical', ...over });

export const hr = (inc: Incident, value: number, measuredAt: string | null): MeasurementInput =>
  ({ requestId: rid('hr'), baseRevision: inc.revision, kind: 'heart_rate', value, unit: 'bpm', measuredAt });

export const cooling = (inc: Incident, startedAt: string | null, endedAt: string | null = null): CareEventInput =>
  ({ requestId: rid('care'), baseRevision: inc.revision, kind: 'cooling', description: 'Cold-water immersion', coolingMethod: 'cold_water_immersion', startedAt, endedAt });

export const time = (inc: Incident, kind: TimelineEventInput['kind'], at: string | null, over: Partial<TimelineEventInput> = {}): TimelineEventInput =>
  ({ requestId: rid('tl'), baseRevision: inc.revision, kind, time: at, certainty: at ? 'approximate' : 'unknown', reportedBy: 'witness', ...over });

/** Visible text of server-rendered markup. */
export const textOf = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').replace(/ ([.;,])/g, '$1');
