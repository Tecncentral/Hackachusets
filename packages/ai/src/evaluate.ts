import { CLINICAL_RULES, type ClinicalRule, referenceById } from './knowledge.js';
import type {
  EvaluateRequest,
  EvaluateResponse,
  FeedbackItem,
  ObservationInput,
} from './evaluate.types.js';

// Deterministic EHS evaluator.
//
// Two independent passes, per the contract:
//   1. Factual reconciliation  — compares statements with the source/measurement
//      record. A conflict is a MISMATCH to confirm, never proof the EMT is wrong.
//   2. Clinical-knowledge pass — flags UNSUPPORTED INFERENCES against curated rules.
//
// Design constraints enforced here:
//   - never invents vitals, sources, treatment, or a diagnosis;
//   - only emits knowledgeReferenceIds / evidenceSourceIds that exist in the input
//     or the registry;
//   - treats observation text as untrusted DATA, never as instructions;
//   - matches paraphrases/negations via token-level cues, not one canned sentence;
//   - de-duplicates so the same clarification is not repeated.

const MAX_FEEDBACK = 6;

/** Lowercased, punctuation-normalized text for cue matching. */
function norm(text: string): string {
  return ` ${text.toLowerCase().replace(/[^a-z0-9%.\s]/g, ' ').replace(/\s+/g, ' ').trim()} `;
}

function hasAny(haystack: string, cues: string[]): boolean {
  return cues.some((c) => haystack.includes(` ${c} `) || haystack.includes(` ${c}`));
}

// --- cue vocabularies (kept small and auditable) ---
const SWEAT_CUES = ['sweat', 'sweating', 'sweaty', 'diaphoretic', 'perspir', 'wet skin', 'drenched'];
// "rules out / excludes / so it cannot be / not heat stroke" style negation of EHS
const EXCLUSION_CUES = [
  'rules out',
  'rule out',
  'ruled out',
  'excludes',
  'exclude',
  'cannot be',
  'can not be',
  'cant be',
  'not heat stroke',
  'isnt heat stroke',
  'is not heat stroke',
  'no heat stroke',
  'not ehs',
];
const SKIN_TEMP_CUES = ['skin temp', 'skin temperature', 'wearable temp', 'watch temp', 'device temp', 'wrist temp'];
const CORE_CLAIM_CUES = ['core temp', 'core temperature', 'core is', 'confirmed high', 'confirms', 'confirmed', 'is high', 'establishes', 'proves', 'means core'];
const COOLING_CUES = ['cool', 'cooled', 'cooling', 'ice', 'immersion', 'cold water', 'misting', 'fan'];
const DEVICE_ONSET_CUES = ['fall', 'fell', 'pace dropped', 'stopped moving', 'watch', 'wearable', 'device'];
const ONSET_CLAIM_CUES = ['collapse', 'collapsed', 'passed out', 'unconscious', 'onset', 'started at', 'went down at', 'loss of consciousness'];
const ARRHYTHMIA_CUES = ['no afib', 'no irregular', 'no arrhythmia', 'rhythm was normal', 'no rhythm alert', 'heart was fine', 'not cardiac', 'rules out cardiac', 'no cardiac'];
// a hedged inference is softer; we still ask but don't call it a conflict
const HEDGE_CUES = ['maybe', 'might', 'possibly', 'i think', 'probably', 'about', 'roughly', 'guess', 'seems'];

/** Is there a clinical core-temperature measurement with a real method? */
function hasClinicalCoreTemp(req: EvaluateRequest): boolean {
  return req.measurements.some(
    (m) =>
      m.kind === 'temperature' &&
      m.method != null &&
      !/skin|wearable|watch|wrist|consumer/i.test(m.method),
  );
}

type Candidate = Omit<FeedbackItem, 'id'>;

function makeId(obsIds: string[], tag: string): string {
  return `fb-${tag}-${obsIds.join('_') || 'none'}`;
}

/** Clinical-knowledge pass: unsupported inferences against curated EHS rules. */
function clinicalInferenceChecks(
  req: EvaluateRequest,
  obs: ObservationInput,
): Candidate[] {
  const t = norm(obs.text);
  const out: Candidate[] = [];
  const cite = (rule: ClinicalRule) => ({
    knowledgeReferenceIds: rule.referenceIds.filter((id) => referenceById(id)),
  });

  // 1. Sweating used to EXCLUDE EHS. Plain "patient is sweating" must NOT trip this.
  if (hasAny(t, SWEAT_CUES) && hasAny(t, EXCLUSION_CUES)) {
    const rule = CLINICAL_RULES.find((r) => r.id === 'rule-sweating-not-exclusionary')!;
    out.push({
      kind: 'unsupported_inference',
      message:
        'Sweating does not rule out exertional heat stroke; EHS can occur with intact sweating. This is a background-evidence point, not a diagnosis.',
      suggestedQuestion:
        'Can we document the core temperature (with method and time) and mental status rather than using sweating to exclude EHS?',
      observationIds: [obs.id],
      evidenceSourceIds: [],
      spokenSummary: 'Sweating alone does not rule out heat stroke.',
      ...cite(rule),
    });
  }

  // 2. Skin/wearable temperature asserted to establish core temperature.
  if (hasAny(t, SKIN_TEMP_CUES) && hasAny(t, CORE_CLAIM_CUES) && !hasClinicalCoreTemp(req)) {
    const rule = CLINICAL_RULES.find((r) => r.id === 'rule-skin-not-core')!;
    out.push({
      kind: 'unsupported_inference',
      message:
        'A consumer skin-temperature reading cannot establish core body temperature. Core temperature needs a clinical core method.',
      suggestedQuestion:
        'What was the core temperature by a clinical method (e.g., rectal), and at what time?',
      observationIds: [obs.id],
      evidenceSourceIds: [],
      spokenSummary: 'Skin temperature is not core temperature.',
      ...cite(rule),
    });
  }

  // 3. Device fall/pace used to assert collapse time / unconsciousness.
  if (hasAny(t, DEVICE_ONSET_CUES) && hasAny(t, ONSET_CLAIM_CUES)) {
    const rule = CLINICAL_RULES.find((r) => r.id === 'rule-device-not-onset')!;
    const hedged = hasAny(t, HEDGE_CUES);
    out.push({
      kind: hedged ? 'missing_context' : 'unsupported_inference',
      message:
        'A wearable fall or pace event is context only; it cannot establish collapse time or how long the patient was unconscious.',
      suggestedQuestion:
        'Is there a witnessed time for collapse or last-known-normal, separate from the device event?',
      observationIds: [obs.id],
      evidenceSourceIds: [],
      spokenSummary: 'A device event does not establish collapse time.',
      ...cite(rule),
    });
  }

  // 4. Absence of a rhythm alert used to exclude a cardiac cause.
  if (hasAny(t, ARRHYTHMIA_CUES) && hasAny(t, EXCLUSION_CUES.concat(['fine', 'normal', 'not cardiac']))) {
    const rule = CLINICAL_RULES.find((r) => r.id === 'rule-no-arrhythmia-alert-not-exclusion')!;
    out.push({
      kind: 'unsupported_inference',
      message:
        'No wearable irregular-rhythm alert is not evidence that excludes a cardiac cause.',
      suggestedQuestion:
        'Can we record an actual cardiac assessment (e.g., monitor/ECG findings) rather than relying on the absence of a wearable alert?',
      observationIds: [obs.id],
      evidenceSourceIds: [],
      spokenSummary: 'A missing rhythm alert does not rule out a cardiac cause.',
      ...cite(rule),
    });
  }

  return out;
}

/** Factual reconciliation pass: statement vs. the measurement/source record. */
function factualChecks(req: EvaluateRequest, obs: ObservationInput): Candidate[] {
  const t = norm(obs.text);
  const out: Candidate[] = [];

  // Post-cooling temperature cited to characterize the earlier (pre-cooling) state.
  const mentionsCooling = hasAny(t, COOLING_CUES);
  const mentionsTemp = t.includes('temp') || t.includes('degrees') || /\d\s?(c|f)\b/.test(t);
  const hasPreCoolingTemp = req.measurements.some(
    (m) => m.kind === 'temperature' && m.beforeCooling === true,
  );
  if (mentionsCooling && mentionsTemp && !hasPreCoolingTemp) {
    const rule = CLINICAL_RULES.find((r) => r.id === 'rule-postcooling-not-precooling')!;
    out.push({
      kind: 'missing_context',
      message:
        'A temperature taken after cooling does not reconstruct the pre-cooling temperature. The record has no temperature marked before cooling.',
      suggestedQuestion:
        'Was a temperature taken before cooling began? If so, what was its value, method, and time?',
      observationIds: [obs.id],
      evidenceSourceIds: req.measurements
        .filter((m) => m.kind === 'temperature')
        .map((m) => m.sourceId)
        .filter((s): s is string => !!s && req.sources.some((src) => src.id === s)),
      knowledgeReferenceIds: rule.referenceIds.filter((id) => referenceById(id)),
      spokenSummary: 'A post-cooling temperature is not the pre-cooling temperature.',
    });
  }

  return out;
}

/** De-duplicate by (kind + primary rule/subject), keeping the first occurrence. */
function dedupe(items: Candidate[]): Candidate[] {
  const seen = new Set<string>();
  const kept: Candidate[] = [];
  for (const it of items) {
    const key = `${it.kind}|${it.knowledgeReferenceIds.join(',')}|${it.spokenSummary}`;
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(it);
  }
  return kept;
}

/**
 * Deterministic evaluation. Always available, no network, no API key.
 * Bounded output. Never throws on bad observation text (treated as inert data).
 */
export function evaluateRules(req: EvaluateRequest): EvaluateResponse {
  const candidates: Candidate[] = [];
  for (const obs of req.observations) {
    candidates.push(...factualChecks(req, obs));
    candidates.push(...clinicalInferenceChecks(req, obs));
  }
  const feedback: FeedbackItem[] = dedupe(candidates)
    .slice(0, MAX_FEEDBACK)
    .map((c, i) => ({ ...c, id: makeId(c.observationIds, `${c.kind}${i}`) }));

  return {
    incidentId: req.incidentId,
    revision: req.revision,
    mode: 'rules-only',
    feedback,
    warnings: [],
  };
}
