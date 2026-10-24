import { evaluateRules } from './evaluate.js';
import { evaluateIncidentSnapshot } from './bridge.js';
import { transcribe } from './transcribe.js';
import {
  evaluateRequestSkinTemp,
  evaluateRequestSweating,
  evaluateRequestPostCooling,
  platformIncidentFixture,
} from './fixtures.js';

/** Real request/response pairs, produced by the real code. SYNTHETIC data only. */
export async function buildExamples(): Promise<Record<string, unknown>> {
  return {
    'evaluate-skin-temp.request': evaluateRequestSkinTemp,
    'evaluate-skin-temp.response': evaluateRules(evaluateRequestSkinTemp),
    'evaluate-sweating.request': evaluateRequestSweating,
    'evaluate-sweating.response': evaluateRules(evaluateRequestSweating),
    'evaluate-post-cooling.request': evaluateRequestPostCooling,
    'evaluate-post-cooling.response': evaluateRules(evaluateRequestPostCooling),
    'platform-incident.snapshot': platformIncidentFixture,
    'platform-incident.result': await evaluateIncidentSnapshot(platformIncidentFixture),
    'platform-incident.assistant-off.result': await evaluateIncidentSnapshot(platformIncidentFixture, { disabled: true }),
    'transcribe.unavailable.response': await transcribe({ bytes: new Uint8Array([1]), mimeType: 'audio/webm' }),
  };
}
