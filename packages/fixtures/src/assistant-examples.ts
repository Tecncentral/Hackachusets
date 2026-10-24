import type { AssistantFeedbackItem, KnowledgeReference } from '@scenebrief/contracts';

// Representative assistant fixtures used by the platform's MOCK assistant (exact-text replay).
// This is a test double for independent development, not clinical reasoning. The real assistant is workstream 02.
// Clinical statements below were checked against the cited passage on 2026-10-24 and still require qualified review.

export const ExampleStatements = {
  witnessAccount: 'Friend says he went for a run and dropped maybe five minutes ago. Not sure exactly.',
  skinTemperatureInference: 'The wearable skin temperature is elevated, so core temperature is confirmed high.',
  sweatingInference: 'He is sweating, so this cannot be heat stroke.',
} as const;

const NATA = {
  title: 'National Athletic Trainers\u2019 Association Position Statement: Exertional Heat Illnesses (Casa DJ et al., J Athl Train 2015;50(9):986\u20131000)',
  url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC4639891/',
  versionDate: '2015-09',
  applicability: 'Consensus background for athletic trainers. Not the responder\u2019s applicable local EMS protocol.',
  reviewStatus: 'unreviewed',
} as const;

export const MockKnowledgeReferences: KnowledgeReference[] = [
  { id: 'mock-kr-nata-2015-sweating', ...NATA, section: 'Recognition \u2014 Exertional Heat Stroke, recommendation 25', passage: '\u201cMost patients with EHS have hot, sweaty skin as opposed to those with the classical type of heat stroke\u201d' },
  { id: 'mock-kr-nata-2015-rectal', ...NATA, section: 'Recognition \u2014 Exertional Heat Stroke, recommendation 22', passage: '\u201cRectal temperature thermometry is the only method of obtaining an immediate and accurate measurement of core body temperature.\u201d' },
];

export interface MockRule {
  key: string;
  /** Exact statement (compared case- and whitespace-insensitively). */
  trigger: string;
  /** Feedback template; id and observationIds are filled in per observation. */
  item: Omit<AssistantFeedbackItem, 'id' | 'observationIds'>;
}

export const MockRules: MockRule[] = [
  {
    key: 'witness-timing',
    trigger: ExampleStatements.witnessAccount,
    item: {
      kind: 'missing_context',
      message: 'The account estimates timing but does not say whether the friend saw the collapse or found him afterward. Collapse time stays unknown until clarified.',
      suggestedQuestion: 'Did you see him collapse, or did you find him afterward? About what time?',
      evidenceSourceIds: ['dispatch', 'fall', 'workout'],
      knowledgeReferenceIds: [],
      spokenSummary: 'Collapse timing is unclear. Ask whether the friend saw the collapse.',
    },
  },
  {
    key: 'skin-vs-core',
    trigger: ExampleStatements.skinTemperatureInference,
    item: {
      kind: 'unsupported_inference',
      message: 'A consumer wearable skin-temperature reading does not establish core body temperature. No clinical temperature measurement is linked to this statement.',
      suggestedQuestion: 'Has a clinical temperature been measured? If so, record the value, method or site, and time.',
      evidenceSourceIds: ['whoop-overnight'],
      knowledgeReferenceIds: ['mock-kr-nata-2015-rectal'],
      spokenSummary: 'Skin temperature is not core temperature. Record a clinical temperature with method and time.',
    },
  },
  {
    key: 'sweating-does-not-exclude',
    trigger: ExampleStatements.sweatingInference,
    item: {
      kind: 'unsupported_inference',
      message: 'Sweating does not exclude exertional heat stroke. Consider recording the skin finding without using it to rule heat illness in or out.',
      suggestedQuestion: null,
      evidenceSourceIds: [],
      knowledgeReferenceIds: ['mock-kr-nata-2015-sweating'],
      spokenSummary: 'Sweating does not rule out exertional heat stroke.',
    },
  },
];

export function normalizeStatement(text: string): string {
  return text.toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/\s+/g, ' ').trim().replace(/[.!?]+$/, '');
}
