import { IncidentSchema, IncidentId, type Incident, type ScenarioVariantValue } from '@scenebrief/contracts';
export * from './assistant-examples.js';

// Synthetic suspected-EHS runner scenario. Story time is October 24, 2026, America/New_York (EDT, UTC-4).
// All timestamps are UTC. Every value is fictional and labeled synthetic. Consistent with docs/user-journey.md.
const CAPTURED = '2026-10-24T14:43:00Z'; // profile and wearable data shared with the incident
const FIXTURE = { status: 'current', recordedAt: '2026-10-24T14:57:00Z', recordedBy: 'synthetic fixture', addedAtRevision: 0, baseRevision: 0 } as const;
const WEARABLE_SOURCES = new Set(['whoop-overnight', 'workout', 'wearable-hr', 'fall']);

function ehsRunner(): Incident {
  return {
    id: IncidentId, revision: 0, synthetic: true,
    scenario: { variant: 'ehs-runner', title: 'Runner found confused near a trail after exertion in hot conditions (synthetic)', note: 'Suspected exertional heat stroke is a clinical concern, not a diagnosis established by any data here.' },
    patient: { id: 'patient-demo-01', name: 'Alex Morgan (fictional)', sharing: false, matched: false },
    wearableStatus: { availability: 'available', note: 'Synthetic consumer wearable fixtures. Integration unverified; not clinical measurements.' },
    sources: [
      { id: 'profile', type: 'patient_profile', label: 'Synthetic emergency profile', capturedAt: CAPTURED, eventTime: '2026-09-12T16:00:00Z', text: 'Fictional self-reported profile, last reviewed 2026-09-12. Age 24. No known drug allergies. No regular medications or relevant history listed.', origin: 'synthetic_fixture', limitation: 'Self-reported and not verified on scene. Medication list may be out of date.' },
      { id: 'whoop-overnight', type: 'wearable', label: 'Synthetic overnight recovery summary', capturedAt: CAPTURED, eventTime: '2026-10-24T10:30:00Z', text: 'Recovery 18%. Resting heart rate 9 bpm above personal baseline. Skin-temperature deviation +0.8 °C from baseline.', origin: 'synthetic_fixture', limitation: 'Consumer background context. Skin-temperature deviation is not core temperature.' },
      { id: 'workout', type: 'wearable', label: 'Synthetic workout', capturedAt: CAPTURED, eventTime: '2026-10-24T13:05:00Z', text: 'Workout record begins at 09:05 EDT. Does not establish illness onset.', origin: 'synthetic_fixture', limitation: 'Start of recorded workout, not illness onset. Pace changes do not establish symptoms.' },
      { id: 'wearable-hr', type: 'wearable', label: 'Synthetic workout heart-rate samples', capturedAt: CAPTURED, eventTime: '2026-10-24T13:05:00Z', text: 'Optical heart-rate samples 09:05–10:34 EDT rising from 122 to 166 bpm. No samples after 10:34 EDT.', origin: 'synthetic_fixture', limitation: 'Consumer optical sensor. Gap after 10:34 EDT. Not a clinical measurement.' },
      { id: 'fall', type: 'wearable', label: 'Synthetic fall fixture — integration unverified', capturedAt: CAPTURED, eventTime: '2026-10-24T14:42:00Z', text: 'Device-reported fall at 10:42 EDT. Collapse and loss of consciousness unconfirmed.', origin: 'synthetic_fixture', limitation: 'Does not establish collapse, unconsciousness or downtime.' },
      { id: 'weather', type: 'weather', label: 'Synthetic weather record near the route', capturedAt: CAPTURED, eventTime: '2026-10-24T14:00:00Z', text: 'Air temperature 88 °F, relative humidity 70% at 10:00 EDT near the trail.', origin: 'synthetic_fixture', limitation: 'Environmental estimate. Not body temperature.' },
      { id: 'dispatch', type: 'dispatch', label: 'Simulated dispatch', capturedAt: '2026-10-24T14:44:00Z', eventTime: '2026-10-24T14:44:00Z', text: 'Emergency call at 10:44 EDT: person found down near running trail.', origin: 'synthetic_fixture', limitation: null },
      { id: 'crew-arrival', type: 'crew', label: 'Synthetic crew record at arrival', capturedAt: '2026-10-24T14:57:00Z', eventTime: '2026-10-24T14:55:00Z', text: 'Crew arrival 10:55 EDT. Patient confused, slow to answer. Skin hot and sweaty. Heart rate 140 bpm on monitor at 10:57 EDT.', origin: 'synthetic_fixture', limitation: null },
    ],
    claims: [{ id: 'collapse-unknown', field: 'collapseTime', value: null, sourceIds: [], status: 'unknown', recordedAt: '2026-10-24T14:55:00Z' }],
    corrections: [],
    observations: [
      { ...FIXTURE, id: 'obs-arrival-neuro', sourceIds: ['crew-arrival'], text: 'Confused; slow to answer questions; responds to voice.', observedAt: '2026-10-24T14:56:00Z', category: 'neurological', reportedBy: 'crew', inputMode: 'typed', clarifiesFeedbackId: null },
      { ...FIXTURE, id: 'obs-arrival-skin', sourceIds: ['crew-arrival'], text: 'Skin hot and sweaty to touch.', observedAt: '2026-10-24T14:56:00Z', category: 'skin', reportedBy: 'crew', inputMode: 'typed', clarifiesFeedbackId: null },
    ],
    measurements: [
      { ...FIXTURE, id: 'meas-hr-arrival', sourceIds: ['crew-arrival'], kind: 'heart_rate', obtained: true, value: 140, diastolic: null, unit: 'bpm', site: null, device: 'Cardiac monitor (synthetic)', observer: 'Crew', deviceClass: 'clinical', measuredAt: '2026-10-24T14:57:00Z', coolingPhase: 'before_cooling', note: null },
    ],
    careEvents: [],
    timelineEvents: [
      { ...FIXTURE, id: 'tl-workout-start', sourceIds: ['workout'], kind: 'exertion_start', time: '2026-10-24T13:05:00Z', certainty: 'recorded', reportedBy: 'device', note: 'Start of recorded workout; not illness onset.' },
      { ...FIXTURE, id: 'tl-device-fall', sourceIds: ['fall'], kind: 'device_fall_event', time: '2026-10-24T14:42:00Z', certainty: 'recorded', reportedBy: 'device', note: 'Device-reported; does not establish collapse or downtime.' },
      { ...FIXTURE, id: 'tl-emergency-call', sourceIds: ['dispatch'], kind: 'emergency_call', time: '2026-10-24T14:44:00Z', certainty: 'recorded', reportedBy: 'dispatch', note: null },
      { ...FIXTURE, id: 'tl-crew-arrival', sourceIds: ['crew-arrival'], kind: 'crew_arrival', time: '2026-10-24T14:55:00Z', certainty: 'recorded', reportedBy: 'crew', note: null },
    ],
    contextFacts: [
      { ...FIXTURE, id: 'fact-age', sourceIds: ['profile'], category: 'age', value: '24 years', state: 'documented', reportedBy: 'patient', note: 'Profile; not verified on scene.' },
      { ...FIXTURE, id: 'fact-allergies', sourceIds: ['profile'], category: 'allergy', value: 'No known drug allergies', state: 'documented', reportedBy: 'patient', note: 'Self-reported in profile.' },
      { ...FIXTURE, id: 'fact-medications', sourceIds: ['profile'], category: 'medication', value: 'None listed', state: 'documented', reportedBy: 'patient', note: 'Profile list; current use not confirmed.' },
      { ...FIXTURE, id: 'fact-history', sourceIds: ['profile'], category: 'relevant_history', value: 'None listed', state: 'documented', reportedBy: 'patient', note: 'Profile list; not verified.' },
      { ...FIXTURE, id: 'fact-activity', sourceIds: ['workout'], category: 'activity', value: 'Outdoor run', state: 'documented', reportedBy: 'device', note: 'From workout record.' },
    ],
    environmentReadings: [
      { ...FIXTURE, id: 'env-air-temp', sourceIds: ['weather'], kind: 'ambient_temperature', value: 88, unit: '°F', measuredAt: '2026-10-24T14:00:00Z', location: 'Weather station near the trail (synthetic)', method: 'weather_service' },
      { ...FIXTURE, id: 'env-humidity', sourceIds: ['weather'], kind: 'relative_humidity', value: 70, unit: '%', measuredAt: '2026-10-24T14:00:00Z', location: 'Weather station near the trail (synthetic)', method: 'weather_service' },
    ],
    wearableRecords: [
      { id: 'wr-recovery', sourceId: 'whoop-overnight', metric: 'recovery', startTime: '2026-10-24T03:00:00Z', endTime: '2026-10-24T10:30:00Z', value: 18, unit: '%', samples: [], summary: 'Overnight recovery score 18%.', limitation: 'Proprietary consumer score; background only.', gaps: null, consumerDevice: true },
      { id: 'wr-resting-hr', sourceId: 'whoop-overnight', metric: 'resting_heart_rate_deviation', startTime: '2026-10-24T03:00:00Z', endTime: '2026-10-24T10:30:00Z', value: 9, unit: 'bpm above baseline', samples: [], summary: 'Resting heart rate 9 bpm above personal baseline overnight.', limitation: 'Background only.', gaps: null, consumerDevice: true },
      { id: 'wr-skin-temp', sourceId: 'whoop-overnight', metric: 'skin_temperature_deviation', startTime: '2026-10-24T03:00:00Z', endTime: '2026-10-24T10:30:00Z', value: 0.8, unit: '°C from baseline', samples: [], summary: 'Overnight skin-temperature deviation +0.8 °C from baseline.', limitation: 'Skin-temperature deviation is not core temperature.', gaps: null, consumerDevice: true },
      { id: 'wr-workout', sourceId: 'workout', metric: 'workout', startTime: '2026-10-24T13:05:00Z', endTime: null, value: null, unit: null, samples: [], summary: 'Outdoor run recorded from 09:05 EDT; end not recorded.', limitation: 'Start of recorded workout, not illness onset.', gaps: 'Workout end not recorded.', consumerDevice: true },
      { id: 'wr-hr', sourceId: 'wearable-hr', metric: 'heart_rate', startTime: '2026-10-24T13:05:00Z', endTime: '2026-10-24T14:34:00Z', value: null, unit: 'bpm', samples: [{ time: '2026-10-24T13:05:00Z', value: 122 }, { time: '2026-10-24T13:35:00Z', value: 141 }, { time: '2026-10-24T14:05:00Z', value: 152 }, { time: '2026-10-24T14:34:00Z', value: 166 }], summary: 'Heart rate rose from 122 to 166 bpm during the recorded workout.', limitation: 'Consumer optical sensor; cause of change unknown.', gaps: 'No samples after 10:34 EDT.', consumerDevice: true },
      { id: 'wr-pace', sourceId: 'workout', metric: 'pace', startTime: '2026-10-24T14:34:00Z', endTime: null, value: null, unit: null, samples: [], summary: 'Recorded pace becomes variable from 10:34 EDT.', limitation: 'Does not establish neurological symptoms or illness onset.', gaps: null, consumerDevice: true },
      { id: 'wr-fall', sourceId: 'fall', metric: 'fall_event', startTime: '2026-10-24T14:42:00Z', endTime: null, value: null, unit: null, samples: [], summary: 'Device-reported fall at 10:42 EDT.', limitation: 'Does not establish collapse, unconsciousness or downtime.', gaps: null, consumerDevice: true },
    ],
    evaluations: [], feedback: [], resolutions: [], knowledgeReferences: [], handoffs: [],
  };
}

function withoutWearable(base: Incident): Incident {
  const keep = (ids: string[]) => !ids.some(id => WEARABLE_SOURCES.has(id));
  return {
    ...base,
    scenario: { ...base.scenario, variant: 'ehs-runner-no-wearable', title: 'Runner found confused near a trail after exertion in hot conditions — no wearable data (synthetic)' },
    wearableStatus: { availability: 'unavailable', note: 'No wearable data connected for this patient.' },
    sources: base.sources.filter(s => !WEARABLE_SOURCES.has(s.id)),
    timelineEvents: base.timelineEvents.filter(t => keep(t.sourceIds)),
    contextFacts: base.contextFacts.filter(f => keep(f.sourceIds)),
    wearableRecords: [],
  };
}

export function createIncidentFixture(variant: ScenarioVariantValue = 'ehs-runner'): Incident {
  const incident = ehsRunner();
  return IncidentSchema.parse(variant === 'ehs-runner' ? incident : withoutWearable(incident));
}

/** The default scenario (kept for scaffold compatibility). */
export function createDemoIncident(): Incident { return createIncidentFixture('ehs-runner'); }
