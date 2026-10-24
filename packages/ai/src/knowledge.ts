// Versioned EHS knowledge registry.
//
// SCOPE: a small, curated set of sources that back the assistant's clarifications.
// This is NOT a general medical corpus and NOT the responder's applicable local
// protocol. Consensus/position statements are BACKGROUND evidence. Every clinical
// rule below is marked `reviewStatus` and MUST be reviewed by a qualified clinician
// and reconciled with the crew's own agency protocol before any operational use.
//
// Source verification: `verified: true` means the citation (title, authors, journal,
// date, DOI) was retrieved from the NCBI E-utilities API during development and the
// quoted passage is taken verbatim from that record's abstract. `verified: false`
// means the URL is a known primary source but its full text could not be machine-
// retrieved from the build host (bot/WAF wall, no JS browser available); the citation
// metadata is recorded from the prompt and must be re-verified by a human.

export type ReviewStatus =
  | 'requires-clinical-review' // clinical rule; not cleared for operational use
  | 'background-evidence' // consensus/position statement, not local protocol
  | 'unverified-url'; // primary source, full text not machine-verified here

export interface KnowledgeReference {
  id: string;
  title: string;
  url: string;
  publisher: string;
  /** Publication or version date, ISO where known. */
  publishedOn: string;
  /** Verbatim or near-verbatim passage actually relied upon. */
  passage: string;
  /** Where in the source the passage lives (abstract, section, etc.). */
  locator: string;
  /** How this source may be used. Consensus docs are background, not local protocol. */
  applicability: string;
  reviewStatus: ReviewStatus;
  /** True only when citation + passage were machine-retrieved and checked here. */
  verified: boolean;
  /** Stable identifier (DOI/PMID) when available. */
  identifier?: string;
}

/**
 * Registry version. Bump when references or passages change so that stored
 * feedback can be traced to the knowledge set that produced it.
 */
export const KNOWLEDGE_VERSION = '2026-10-24.2';

export const KNOWLEDGE: readonly KnowledgeReference[] = [
  {
    id: 'acsm-2023-ehi-consensus',
    title:
      'ACSM Expert Consensus Statement on Exertional Heat Illness: Recognition, Management, and Return to Activity',
    url: 'https://pubmed.ncbi.nlm.nih.gov/37036463/',
    publisher: 'American College of Sports Medicine — Current Sports Medicine Reports',
    publishedOn: '2023-04-01',
    passage:
      'Exertional heat stroke is a true medical emergency with potential for organ injury and death. Identifying the athlete with suspected exertional heat stroke early in the course, stopping activity (body heat generation), and providing rapid total body cooling are essential for survival ... outcomes are likely related to the duration of severe hyperthermia.',
    locator: 'Abstract (Curr Sports Med Rep. 2023 Apr 1;22(4):134-149)',
    applicability:
      'National expert consensus (background evidence). Supports: EHS is a time-critical emergency; rapid cooling and early recognition drive outcome. Not a local EMS protocol.',
    reviewStatus: 'background-evidence',
    verified: true,
    identifier: 'doi:10.1249/JSR.0000000000001058 / PMID:37036463',
  },
  {
    id: 'nata-2015-ehi-position',
    title:
      "National Athletic Trainers' Association Position Statement: Exertional Heat Illnesses",
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC4639891/',
    publisher: "National Athletic Trainers' Association — Journal of Athletic Training",
    publishedOn: '2015-09-01',
    passage:
      'Best-practice recommendations for the prevention, recognition, and treatment of exertional heat illnesses (EHIs) ... exertional heat stroke remains one of the leading causes of sudden death during sport. Recommendations provide an integrated scientific and clinically applicable approach to the prevention, recognition, treatment of, and return-to-activity guidelines for EHIs.',
    locator: 'Abstract (J Athl Train. 2015 Sep;50(9):986-1000; erratum 2017;52(4):401)',
    applicability:
      'Position statement (background evidence). Supports: structured recognition and treatment of EHI; EHS is a leading cause of exertional sudden death. Not a local EMS protocol.',
    reviewStatus: 'background-evidence',
    verified: true,
    identifier: 'doi:10.4085/1062-6050-50.9.07 / PMID:26381473 / PMC4639891',
  },
  // --- NATA 2015 recommendation-level passages ---
  // IDs match the website session's (Member 1) reference IDs so feedback renders the
  // same reference in the UI. Member 1 recorded these as checked against the nata.org
  // PDF on 2026-10-24. This build host could NOT retrieve the full text (PMC/NCBI do
  // not allow full-text download for this article), so `verified` stays false here
  // until a human re-checks the quoted wording.
  {
    id: 'nata-2015-rec25-sweating',
    title: 'NATA Position Statement: Exertional Heat Illnesses (2015) — Recommendation 25',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC4639891/',
    publisher: "National Athletic Trainers' Association — Journal of Athletic Training",
    publishedOn: '2015-09-01',
    passage:
      'Most patients with EHS have hot, sweaty skin as opposed to those with the classical type of heat stroke … who present with dry skin.',
    locator: 'Recommendation 25 (cross-session check against nata.org PDF, 2026-10-24)',
    applicability: 'Consensus background for athletic trainers; not the responder’s local EMS protocol.',
    reviewStatus: 'background-evidence',
    verified: false,
    identifier: 'doi:10.4085/1062-6050-50.9.07',
  },
  {
    id: 'nata-2015-rec8-temperature-method',
    title: 'NATA Position Statement: Exertional Heat Illnesses (2015) — Recommendation 8',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC4639891/',
    publisher: "National Athletic Trainers' Association — Journal of Athletic Training",
    publishedOn: '2015-09-01',
    passage:
      'The assessment of rectal temperature is the clinical gold standard for obtaining core body temperature of patients with EHS … No other field-expedient methods … are valid or reliable after intense exercise in the heat.',
    locator: 'Recommendation 8 (cross-session check against nata.org PDF, 2026-10-24)',
    applicability: 'Consensus background; the measurement method under local protocol is the crew’s decision.',
    reviewStatus: 'background-evidence',
    verified: false,
    identifier: 'doi:10.4085/1062-6050-50.9.07',
  },
  {
    id: 'nata-2015-rec22-passive-cooling',
    title: 'NATA Position Statement: Exertional Heat Illnesses (2015) — Recommendation 22',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC4639891/',
    publisher: "National Athletic Trainers' Association — Journal of Athletic Training",
    publishedOn: '2015-09-01',
    passage:
      'After initial collapse, recognition is often delayed, and the patient may begin to cool passively … A delay in accurately assessing temperature … may also explain a body temperature that is lower than expected.',
    locator: 'Recommendation 22 (cross-session check against nata.org PDF, 2026-10-24)',
    applicability: 'Consensus background; does not reconstruct an earlier temperature.',
    reviewStatus: 'background-evidence',
    verified: false,
    identifier: 'doi:10.4085/1062-6050-50.9.07',
  },
  {
    id: 'cdc-yellowbook-heat-cold',
    title: 'Heat and Cold Illness in Travelers (CDC Yellow Book, HCP)',
    url: 'https://www.cdc.gov/yellow-book/hcp/environmental-hazards-risks/heat-and-cold-illness-in-travelers.html',
    publisher: 'U.S. Centers for Disease Control and Prevention',
    publishedOn: 'unknown (CDC Yellow Book, current edition)',
    passage:
      'NOT MACHINE-VERIFIED ON BUILD HOST: the CDC page returned HTTP 403 to automated fetch (WAF). Cited as a primary background source on heat illness recognition and management; a human must open the URL and record the exact passage before this reference backs operational feedback.',
    locator: 'HCP section — heat illness (to be confirmed by a human reviewer)',
    applicability:
      'Public-health guidance (background evidence). Pending human verification of the exact passage.',
    reviewStatus: 'unverified-url',
    verified: false,
  },
  {
    id: 'mass-ems-statewide-protocols',
    title: 'Massachusetts EMS Statewide Treatment Protocols',
    url: 'https://www.mass.gov/lists/emergency-medical-services-statewide-treatment-protocols',
    publisher: 'Commonwealth of Massachusetts — Office of Emergency Medical Services',
    publishedOn: 'unknown (versioned PDF set; confirm edition/date)',
    passage:
      'NOT MACHINE-VERIFIED ON BUILD HOST: the mass.gov page returned HTTP 403 to automated fetch (WAF). This is the candidate APPLICABLE LOCAL PROTOCOL for a Massachusetts crew. Applicability, edition, and the specific hyperthermia/heat-emergency protocol must be confirmed by the responding agency; do not treat any threshold or dosing as applicable until a human verifies it against the current protocol edition.',
    locator: 'Statewide Treatment Protocols — hyperthermia/heat emergency (to be confirmed)',
    applicability:
      'Candidate local protocol. Applicability and current edition REQUIRE agency confirmation before operational reliance.',
    reviewStatus: 'unverified-url',
    verified: false,
  },
];

/** Clinical decision rules the evaluator may cite. Each requires qualified review. */
export interface ClinicalRule {
  id: string;
  statement: string;
  referenceIds: string[];
  reviewStatus: ReviewStatus;
}

export const CLINICAL_RULES: readonly ClinicalRule[] = [
  {
    id: 'rule-sweating-not-exclusionary',
    statement:
      'Sweating does not exclude exertional heat stroke. Presence of sweat is not a reliable rule-out; EHS can occur with intact sweating.',
    referenceIds: ['nata-2015-rec25-sweating', 'nata-2015-ehi-position', 'acsm-2023-ehi-consensus'],
    reviewStatus: 'requires-clinical-review',
  },
  {
    id: 'rule-skin-not-core',
    statement:
      'Consumer/skin temperature cannot establish core body temperature. Core temperature for EHS is obtained by a clinical core method (e.g., rectal), with method and site documented.',
    referenceIds: ['nata-2015-rec8-temperature-method', 'acsm-2023-ehi-consensus'],
    reviewStatus: 'requires-clinical-review',
  },
  {
    id: 'rule-temp-needs-method-timing',
    statement:
      'A temperature reading is only interpretable with its measurement method/site, event time, unit, and whether it was taken before or after cooling.',
    referenceIds: ['nata-2015-rec8-temperature-method', 'acsm-2023-ehi-consensus'],
    reviewStatus: 'requires-clinical-review',
  },
  {
    id: 'rule-postcooling-not-precooling',
    statement:
      'A lower temperature measured after cooling cannot by itself reconstruct the pre-cooling temperature or exclude an earlier heat emergency; outcomes relate to duration of severe hyperthermia.',
    referenceIds: ['nata-2015-rec22-passive-cooling', 'acsm-2023-ehi-consensus'],
    reviewStatus: 'requires-clinical-review',
  },
  {
    id: 'rule-device-not-onset',
    statement:
      'Wearable pace, workout, or fall events provide context only; they cannot establish symptom onset, collapse time, or duration of unconsciousness.',
    referenceIds: ['acsm-2023-ehi-consensus'],
    reviewStatus: 'requires-clinical-review',
  },
  {
    id: 'rule-no-arrhythmia-alert-not-exclusion',
    statement:
      'Absence of a wearable irregular-rhythm alert is not evidence excluding a cardiac cause.',
    referenceIds: ['acsm-2023-ehi-consensus'],
    reviewStatus: 'requires-clinical-review',
  },
];

export function referenceById(id: string): KnowledgeReference | undefined {
  return KNOWLEDGE.find((r) => r.id === id);
}

export function ruleById(id: string): ClinicalRule | undefined {
  return CLINICAL_RULES.find((r) => r.id === id);
}
