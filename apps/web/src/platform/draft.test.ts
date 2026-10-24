// Behaviour tests for the deterministic handoff-draft builder (draft.ts). buildDraft copies stored
// records into sections and lists uncertainties; it adds no clinical interpretation. These tests
// assert the grouping, labelling, and the explicit unknown / not_documented / not_obtained states.
import { describe, expect, it } from 'vitest';
import { buildDraft, draftText } from './draft';
import { WorkspaceIncidentSchema, type Measurement, type TimelineEvent, type WorkspaceIncident } from './boundary';

const ISO = '2026-10-24T14:43:00Z';

function incident(overrides: Partial<WorkspaceIncident> = {}): WorkspaceIncident {
  return WorkspaceIncidentSchema.parse({
    id: 'runner-found-down', revision: 3, synthetic: true,
    patient: { id: 'patient-demo-01', name: 'Alex Morgan (fictional)', sharing: true, matched: true },
    sources: [], claims: [], corrections: [], handoffs: [],
    observations: [], measurements: [], careEvents: [], timelineEvents: [],
    feedback: [], knowledgeReferences: [], observationCorrections: [],
    ...overrides
  });
}

function temp(partial: Partial<Measurement>): Measurement {
  return {
    id: partial.id ?? 't1', kind: 'temperature', status: 'obtained', value: 41, value2: null, unit: '°C',
    method: 'rectal', eventTime: ISO, capturedAt: ISO, coolingPhase: 'before', sourceKind: 'manual',
    device: null, recordedBy: 'crew', note: null, sourceId: partial.sourceId ?? 'src-t1', synthetic: false,
    ...partial
  };
}

describe('buildDraft measurements', () => {
  it('lists clinical measurements chronologically with cooling-phase labels and method', () => {
    const inc = incident({
      measurements: [
        temp({ id: 'after', sourceId: 's-after', eventTime: '2026-10-24T15:00:00Z', coolingPhase: 'after', value: 39, method: 'rectal' }),
        temp({ id: 'before', sourceId: 's-before', eventTime: '2026-10-24T14:30:00Z', coolingPhase: 'before', value: 41, method: 'rectal' })
      ]
    });
    const draft = buildDraft(inc);
    const measurements = draft.sections.find(s => s.id === 'measurements')!;
    expect(measurements.items).toHaveLength(2);
    // Chronological: the 14:30 "before cooling" reading precedes the 15:00 "after cooling" one.
    expect(measurements.items[0].text).toContain('before cooling');
    expect(measurements.items[0].text).toContain('method/site: rectal');
    expect(measurements.items[1].text).toContain('after cooling');
    const beforeIdx = measurements.items[0].text.indexOf('before cooling');
    expect(measurements.items[0].sourceIds).toEqual(['s-before']);
    expect(measurements.items[1].sourceIds).toEqual(['s-after']);
    expect(beforeIdx).toBeGreaterThanOrEqual(0);
  });

  it('flags a temperature with no method as "Measurement method/site not documented."', () => {
    const inc = incident({ measurements: [temp({ method: null })] });
    const draft = buildDraft(inc);
    const u = draft.uncertainties.find(x => x.detail === 'Measurement method/site not documented.');
    expect(u).toBeDefined();
    expect(u!.state).toBe('not_documented');
  });

  it('reports no clinical temperature as not_documented', () => {
    const draft = buildDraft(incident());
    const u = draft.uncertainties.find(x => x.label === 'Clinical temperature');
    expect(u).toMatchObject({ label: 'Clinical temperature', state: 'not_documented' });
  });

  it('reports a not_obtained temperature as not_obtained', () => {
    const inc = incident({
      measurements: [temp({ status: 'not_obtained', value: null, method: null, note: 'Patient declined / no probe on scene.' })]
    });
    const draft = buildDraft(inc);
    const u = draft.uncertainties.find(x => x.label === 'Clinical temperature');
    expect(u).toMatchObject({ state: 'not_obtained', detail: 'Patient declined / no probe on scene.' });
  });
});

describe('buildDraft timeline uncertainties', () => {
  function collapse(time: string | null): TimelineEvent {
    return {
      id: 'c1', kind: 'collapse', time, certainty: time === null ? 'unknown' : 'reported', note: null,
      sourceIds: [], capturedAt: ISO
    };
  }

  it('marks a collapse event with a null time as "unknown"', () => {
    const inc = incident({ timelineEvents: [collapse(null)] });
    const u = buildDraft(inc).uncertainties.find(x => x.label === 'Collapse');
    expect(u).toMatchObject({ label: 'Collapse', state: 'unknown' });
  });

  it('marks an absent collapse event as "not_documented"', () => {
    const u = buildDraft(incident()).uncertainties.find(x => x.label === 'Collapse');
    expect(u).toMatchObject({ label: 'Collapse', state: 'not_documented' });
  });
});

describe('buildDraft context and feedback', () => {
  it('notes that an ambient-temperature reading is not body temperature', () => {
    const ambient: Measurement = {
      id: 'a1', kind: 'ambientTemperature', status: 'obtained', value: 32, value2: null, unit: '°C',
      method: null, eventTime: ISO, capturedAt: ISO, coolingPhase: 'unknown', sourceKind: 'reference',
      device: null, recordedBy: 'weather', note: null, sourceId: 'src-amb', synthetic: false
    };
    const inc = incident({ measurements: [ambient] });
    const exertion = buildDraft(inc).sections.find(s => s.id === 'exertion')!;
    const item = exertion.items.find(i => i.note);
    expect(item).toBeDefined();
    expect(item!.note).toBe('Environmental reading, not body temperature.');
  });

  it('surfaces open feedback as an unresolved uncertainty', () => {
    const inc = incident({
      feedback: [{
        id: 'f1', revision: 3, kind: 'missing_context', message: 'Collapse time unclear.',
        suggestedQuestion: 'Did anyone witness the collapse?', observationIds: [], evidenceSourceIds: [],
        knowledgeReferenceIds: [], spokenSummary: null, mode: 'development-stub', status: 'open', resolution: null
      }]
    });
    const u = buildDraft(inc).uncertainties.find(x => x.state === 'unresolved');
    expect(u).toBeDefined();
    expect(u!.detail).toBe('Did anyone witness the collapse?');
  });
});

describe('draftText', () => {
  it('always includes the UNCERTAIN / NOT DOCUMENTED section', () => {
    expect(draftText(buildDraft(incident()))).toContain('UNCERTAIN / NOT DOCUMENTED');
  });
});
