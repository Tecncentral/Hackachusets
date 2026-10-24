import type { EvaluateRequest } from './evaluate.types.js';

// Representative request fixtures for the assistant service. These let the UI and
// platform work against a stable seam without a live incident store. They mirror
// the shared acceptance scenario (synthetic runner incident).

export const FIXTURE_INCIDENT_ID = 'runner-found-down';

/** Step 1: skin-temp-establishes-core inference. */
export const evaluateRequestSkinTemp: EvaluateRequest = {
  incidentId: FIXTURE_INCIDENT_ID,
  revision: 1,
  observations: [
    {
      id: 'obs-skin-temp',
      text: 'The wearable skin temperature is elevated, so core temperature is confirmed high.',
      observedAt: '2026-10-24T15:02:00Z',
      sourceIds: ['src-wearable'],
    },
  ],
  measurements: [],
  sources: [{ id: 'src-wearable', type: 'wearable', label: 'Consumer wearable (synthetic)', text: 'Skin temperature trend elevated.' }],
  careEvents: [],
  protocolContext: { agency: null, protocolConfirmed: false },
};

/** Step 2: sweating-excludes-EHS inference. */
export const evaluateRequestSweating: EvaluateRequest = {
  incidentId: FIXTURE_INCIDENT_ID,
  revision: 2,
  observations: [
    {
      id: 'obs-sweating',
      text: 'He is sweating, so this cannot be heat stroke.',
      observedAt: '2026-10-24T15:05:00Z',
      sourceIds: [],
    },
  ],
  measurements: [],
  sources: [],
  careEvents: [],
};

/** Step 3: post-cooling temperature with no pre-cooling value recorded. */
export const evaluateRequestPostCooling: EvaluateRequest = {
  incidentId: FIXTURE_INCIDENT_ID,
  revision: 3,
  observations: [
    {
      id: 'obs-postcool',
      text: 'We started cold-water cooling and the temperature now reads 38.1 C.',
      observedAt: '2026-10-24T15:20:00Z',
      sourceIds: ['src-temp-post'],
    },
  ],
  measurements: [
    {
      id: 'm-temp-post',
      kind: 'temperature',
      value: '38.1',
      unit: 'C',
      method: 'rectal',
      site: 'rectal',
      eventTime: '2026-10-24T15:20:00Z',
      beforeCooling: false,
      sourceId: 'src-temp-post',
    },
  ],
  sources: [{ id: 'src-temp-post', type: 'clinical', label: 'Rectal temperature (synthetic)', text: '38.1 C after cooling.' }],
  careEvents: [{ id: 'care-cooling', action: 'Cold-water cooling', startedAt: '2026-10-24T15:12:00Z', stoppedAt: null }],
};

export const fixtureTranscriptText =
  'Found him near the running trail, confused and not making sense. Friend says it was a short run. I am not sure when he went down.';
