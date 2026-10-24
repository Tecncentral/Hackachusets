// DEVELOPMENT STUB — deterministic phrase/record rules used only by the opt-in development adapter
// so the feedback UI can be exercised before the assistant service is integrated. It is not the
// assistant service, not a model, and not clinical reasoning. References were checked against the
// NATA 2015 position statement PDF (nata.org) on 2026-10-24; passages are short excerpts and have
// NOT been reviewed by a qualified clinician. No thresholds or treatments are encoded here.
import type { Feedback, KnowledgeReference, WorkspaceIncident } from './boundary';
import { clock } from './time';

export const DEV_REFERENCES: KnowledgeReference[] = [
  {
    id: 'nata-2015-rec25-sweating', title: 'NATA Position Statement: Exertional Heat Illnesses (Casa et al., J Athl Train 2015;50(9):986-1000) — Recommendation 25',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC4639891/', version: '2015-09 (erratum 2017)',
    passage: '“Most patients with EHS have hot, sweaty skin as opposed to those with the classical type of heat stroke … who present with dry skin.”',
    applicability: 'Consensus background for athletic trainers; not the responder’s local EMS protocol.', reviewStatus: 'Not clinically reviewed (development stub)'
  },
  {
    id: 'nata-2015-rec8-temperature-method', title: 'NATA Position Statement: Exertional Heat Illnesses (2015) — Recommendation 8',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC4639891/', version: '2015-09 (erratum 2017)',
    passage: '“The assessment of rectal temperature is the clinical gold standard for obtaining core body temperature of patients with EHS … No other field-expedient methods … are valid or reliable after intense exercise in the heat.”',
    applicability: 'Consensus background; measurement method under local protocol is the crew’s decision.', reviewStatus: 'Not clinically reviewed (development stub)'
  },
  {
    id: 'nata-2015-rec22-passive-cooling', title: 'NATA Position Statement: Exertional Heat Illnesses (2015) — Recommendation 22',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC4639891/', version: '2015-09 (erratum 2017)',
    passage: '“After initial collapse, recognition is often delayed, and the patient may begin to cool passively … A delay in accurately assessing temperature … may also explain a body temperature that is lower than expected.”',
    applicability: 'Consensus background; does not reconstruct an earlier temperature.', reviewStatus: 'Not clinically reviewed (development stub)'
  }
];

const SKIN = /skin[- ]?temp|wearable temp|watch temp/i;
const CORE_CLAIM = /core|confirm|fever|hyperthermi|definitely (hot|high)/i;
const SWEAT = /sweat/i;
const EXCLUDES = /can(?:not|'t| ?not)\s+be|rules? out|ruled out|exclude|isn'?t|is not|not\s+(?:a\s+)?heat\s*stroke|no\s+heat\s*stroke/i;
const HEAT = /heat|ehs/i;
const AFTER_COOL = /(after|post)[- ]?cool/i;
const REASSURE = /normal|fine|rules? out|ruled out|not (?:a )?heat|never|wasn'?t/i;
const INTERVAL = /\b(minutes?|mins?)\b.*\bago\b|\bdropped\b|\bcollapsed\b|\bwent down\b/i;

export function devEvaluate(incident: WorkspaceIncident): Feedback[] {
  const out: Feedback[] = [];
  const add = (f: Omit<Feedback, 'revision' | 'mode' | 'status' | 'resolution'>) => {
    if (incident.feedback.some(x => x.id === f.id) || out.some(x => x.id === f.id)) return;
    out.push({ ...f, revision: incident.revision, mode: 'development-stub', status: 'open', resolution: null });
  };
  const wearable = incident.sources.filter(s => s.type === 'wearable').map(s => s.id);
  const timing = incident.sources.filter(s => ['workout', 'fall', 'dispatch'].includes(s.id)).map(s => s.id);
  const knownCollapse = incident.timelineEvents.some(t => t.kind === 'collapse' && t.time !== null);
  const knownDiscovery = incident.timelineEvents.some(t => t.kind === 'discovery' && t.time !== null);

  for (const o of incident.observations.filter(x => x.status === 'active')) {
    if (SKIN.test(o.text) && CORE_CLAIM.test(o.text)) add({
      id: `dev-skin-core-${o.id}`, kind: 'unsupported_inference', observationIds: [o.id],
      evidenceSourceIds: [...incident.measurements.filter(m => m.kind === 'skinTemperatureDeviation').map(m => m.sourceId), ...wearable],
      knowledgeReferenceIds: ['nata-2015-rec8-temperature-method'],
      message: 'A consumer skin-temperature reading does not establish core body temperature. The record has no clinical temperature with a method yet.',
      suggestedQuestion: 'Has a clinical temperature been taken? If so, by what method or site, and at what time?',
      spokenSummary: 'Skin temperature from a wearable is not core temperature. Is there a clinical temperature, with method and time?'
    });
    if (SWEAT.test(o.text) && EXCLUDES.test(o.text) && HEAT.test(o.text)) add({
      id: `dev-sweat-${o.id}`, kind: 'unsupported_inference', observationIds: [o.id], evidenceSourceIds: [],
      knowledgeReferenceIds: ['nata-2015-rec25-sweating'],
      message: 'Sweating does not exclude exertional heat stroke; the cited consensus statement notes most patients with EHS have hot, sweaty skin. This is a reference point, not a diagnosis.',
      suggestedQuestion: 'What is his current mental status, and is there a clinical temperature with method and time?',
      spokenSummary: 'Sweating does not rule out exertional heat stroke. Consider mental status and a clinical temperature with method and time.'
    });
    if (AFTER_COOL.test(o.text) && REASSURE.test(o.text)) add({
      id: `dev-postcool-${o.id}`, kind: 'unsupported_inference', observationIds: [o.id],
      evidenceSourceIds: incident.measurements.filter(m => m.kind === 'temperature').map(m => m.sourceId),
      knowledgeReferenceIds: ['nata-2015-rec22-passive-cooling'],
      message: 'A lower temperature after cooling does not by itself show what the temperature was earlier.',
      suggestedQuestion: 'Was a temperature recorded before cooling began, and when?',
      spokenSummary: 'A lower reading after cooling does not show the earlier temperature. Was one taken before cooling?'
    });
    if (o.category === 'account' && INTERVAL.test(o.text) && !knownCollapse && !knownDiscovery) add({
      id: `dev-timing-${o.id}`, kind: 'missing_context', observationIds: [o.id], evidenceSourceIds: timing, knowledgeReferenceIds: [],
      message: 'The account gives an interval but not whether the collapse was witnessed. The available records (workout start, device-reported fall, emergency call) do not establish collapse time.',
      suggestedQuestion: 'Did you see him collapse, or did you find him afterward? About what time?',
      spokenSummary: 'The timing could mean collapse or discovery. Ask whether the friend saw him collapse or found him afterward.'
    });
  }
  for (const m of incident.measurements.filter(x => x.kind === 'temperature' && x.status === 'obtained')) {
    if (!m.method) add({
      id: `dev-temp-method-${m.id}`, kind: 'missing_context', observationIds: [], evidenceSourceIds: [m.sourceId],
      knowledgeReferenceIds: ['nata-2015-rec8-temperature-method'],
      message: `The temperature at ${clock(m.eventTime)} has no method or site recorded, so it cannot be compared reliably with later readings.`,
      suggestedQuestion: `How was the ${clock(m.eventTime)} temperature measured?`,
      spokenSummary: `The ${clock(m.eventTime)} temperature has no method recorded.`
    });
  }
  return out;
}
