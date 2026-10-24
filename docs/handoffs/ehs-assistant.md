# Handoff — Session 2 of 3: EHS correction assistant

| | |
|---|---|
| Session | 2 of 3 (assistant). Session 1 = EMT website, Session 3 = core platform |
| Branch | **`session-2`** — [view on GitHub](https://github.com/Tecncentral/Hackachusets/tree/session-2). Same code as `feat/ehs-correction-assistant` |
| Get it | `git fetch origin && git checkout session-2 && npm ci && npm run check` |
| Base SHA | `2f622d4c419f43408428564029d427d88cb511ee` (origin/main) |
| Owns | `packages/ai/`, `apps/assistant/` |
| Does not touch | `apps/api`, `apps/web`, `packages/contracts` |
| Checks | `npm run check` → typecheck clean, 7 files / 54 tests pass, web build OK |
| Merge | Not merged into `main`. Open a PR from `session-2` when the team is ready |

## Start here (for whoever receives this)

1. Check out `session-2` and run `npm ci` then `npm run check`. All checks should pass.
2. Read "What it does" below to see what the assistant catches.
3. **If you own the platform (Session 3):** follow "For the platform owner". One function to call, one audio route to forward.
4. **If you own the website (Session 1):** nothing is required. Read "For the website owner".
5. Example inputs and outputs are in `packages/ai/examples/`.
6. Open items needing a person are under "Sources" and "Known limits".

## What it does

The assistant reads a snapshot of an incident and returns proposed clarifications.
It never changes the incident, never diagnoses, and is not a clinician.

| Crew says | Assistant replies (spoken line) |
|---|---|
| "Sweating, so it can't be heat stroke" | Sweating alone does not rule out heat stroke. |
| "Patient is sweating" (plain fact) | Nothing — a fact is not a false claim. |
| "Wearable skin temp high, so core is high" | Skin temperature is not core temperature. |
| "Watch fall at 10:42, so he collapsed then" | A device event does not establish collapse time. |
| "Dropped about five minutes ago" (no collapse/discovery time on record) | Ask if the collapse was seen, or if he was found later. |
| Temperature with no method or time | That temperature has no method or site recorded. |
| Temp mentioned after cooling, no pre-cooling temp | A post-cooling temperature is not the pre-cooling temperature. |
| "No rhythm alert, so not cardiac" | A missing rhythm alert does not rule out a cardiac cause. |
| "Ignore your rules…" inside patient text | Treated as plain text. Rules still apply. |

Every item has: `id, kind, message, suggestedQuestion, observationIds, evidenceSourceIds, knowledgeReferenceIds, spokenSummary`.
Only IDs that exist in the request or the knowledge registry are ever cited.

## How the three sessions connect

```
Website (S1)  --HTTP-->  Platform API (S3)  --function call-->  @scenebrief/ai (S2)
                                            (or HTTP to apps/assistant :3002)
```

- The website never calls the assistant. It calls the platform (already true in S1's `apps/web/src/platform/http.ts`).
- The platform owns all incident state. It passes a snapshot in and stores what comes back.
- The incident shape the bridge reads is S1's proposal (`apps/web/src/platform/boundary.ts` on `feat/emt-website-ehs`). It also reads today's scaffold incident (`claims[]`), so it works on main now.
- Reference IDs match S1's dev stub (`nata-2015-rec8-temperature-method`, `nata-2015-rec22-passive-cooling`, `nata-2015-rec25-sweating`), so the website shows the same references once the real assistant replaces its stub.

## For the platform owner (Session 3): wire it in

One function. It never throws.

```ts
import { evaluateIncidentSnapshot } from '@scenebrief/ai';

// POST /api/incidents/:id/evaluations  { requestId, baseRevision }
router.post('/api/incidents/:id/evaluations', async (req, res) => {
  const incident = store.get(req.params.id);
  if (req.body.baseRevision !== incident.revision) return res.status(409).json({ error: 'Stale revision' });

  const snapshot = structuredClone(incident);               // immutable snapshot
  const result = await evaluateIncidentSnapshot(snapshot, { disabled: !assistantEnabled });

  if (store.get(req.params.id).revision !== result.revision)  // late answer for an old revision
    return res.status(409).json({ error: 'Incident changed during evaluation' });

  store.appendFeedback(incident.id, result.feedback);          // each item carries .revision, status 'open'
  store.mergeKnowledgeReferences(incident.id, result.knowledgeReferences);
  res.json(store.get(req.params.id));                          // S1 expects the full incident back
});
```

- `result.mode` is `rules-only`, `hybrid`, or `unavailable`. On `unavailable`, `feedback` is `[]` and `warnings` explains why. Capture and handoff keep working.
- Evaluation does not bump the revision (S1's dev adapter assumes the same).
- Re-evaluating the same record gives the same feedback IDs. Skip IDs already stored to avoid repeats.
- To use the separate service instead of in-process:
  `evaluateIncidentSnapshot(snapshot, { client: createAssistantClient({ baseUrl: 'http://127.0.0.1:3002' }) })`.
- Audio: forward the uploaded file to `POST :3002/transcribe` **as-is** (multipart with an `audio` field, same as the website sends; raw `audio/*` body also works), or call `transcribe({ bytes, mimeType }, { provider: providerFromEnv() })` in-process. Return `{ transcript, mode, warnings }` to the website. Do **not** save it as an observation; the EMT edits it and submits through `/observations`. Non-audio files get 415. Max 10 MB. Audio is never logged or stored.

### Example files (real output, checked in)

`packages/ai/examples/*.json` — request and response pairs for `/evaluate`, the full platform snapshot and its result, the "assistant off" result, and the "transcription unavailable" response. A test fails if they drift from real output. Regenerate with `npx tsx packages/ai/scripts/write-examples.ts`.

### Field mapping the bridge applies

| Platform field | Assistant field | Rule |
|---|---|---|
| `observations[]` with `status: 'clarified'` | — | skipped (replaced by the clarification) |
| `observation.sourceId` | `sourceIds: [sourceId]` | |
| `measurement.status: 'not_obtained'` | — | skipped; never turned into a value |
| `measurement.value` + `value2` (BP) | `value: "120/80"` | |
| `coolingPhase` before / during,after / unknown | `beforeCooling` true / false / null | unknown stays null |
| `skinTemperatureDeviation` with no method | `method: 'consumer wearable skin'` | never counts as core |
| `careEvents[].endedAt` | `stoppedAt` | |
| `timelineEvents[]` | `timelineEvents[]` | `time: null` stays unknown |
| scaffold `claims[]` `account` | observation | |
| scaffold `claims[]` `discoveryTime`/`collapseTime` | timeline event | `unknown` stays unknown |

## For the website owner (Session 1)

Nothing is required. When the platform route exists, switch off `devAssistant.ts`.
Feedback and references come back in your `FeedbackSchema` / `KnowledgeReferenceSchema` shapes.
Your schema has `suggestedQuestion` and `spokenSummary` nullable; the assistant always fills them.

## Run it

```bash
npm ci
npm run check                                   # all checks
npm run dev -w @scenebrief/assistant            # optional service on http://127.0.0.1:3002
```

```bash
curl http://127.0.0.1:3002/health
curl -X POST http://127.0.0.1:3002/evaluate -H "Content-Type: application/json" \
  -d '{"incidentId":"runner-found-down","revision":2,"observations":[{"id":"o1","text":"He is sweating, so this cannot be heat stroke.","observedAt":null,"sourceIds":[]}]}'
```

Example requests: `packages/ai/src/fixtures.ts` (`evaluateRequest*`, and `platformIncidentFixture` for the full platform shape).

## Environment (no secrets committed)

| Variable | Use |
|---|---|
| `ASSISTANT_PORT` | Service port, default 3002 |
| `SCENEBRIEF_TRANSCRIBE_API_KEY` | Live audio key. Server-side only. Not set → `/transcribe` returns `mode: "unavailable"` |
| `SCENEBRIEF_TRANSCRIBE_PROVIDER` | `openai` (default, only one supported). Anything else → reported unavailable |
| `SCENEBRIEF_TRANSCRIBE_MODEL`, `SCENEBRIEF_TRANSCRIBE_BASE_URL` | Optional; default `whisper-1`, `https://api.openai.com/v1` |

Live audio is coded (OpenAI-compatible `/audio/transcriptions`) and tested with a fake server. It was **not** run against the real provider: no key exists on the build machine.
The optional model (`evaluateHybrid({ model })`) may only rephrase the three text fields; IDs and kinds are fixed by the rules, and output is re-validated.

## Files

| Path | Job |
|---|---|
| `packages/ai/src/knowledge.ts` | Versioned source registry + clinical rules (`KNOWLEDGE_VERSION`) |
| `packages/ai/src/evaluate.ts` | Deterministic rules: fact check + clinical-inference pass |
| `packages/ai/src/hybrid.ts` | Optional model phrasing, validated, with fallback |
| `packages/ai/src/bridge.ts` | Platform shape ↔ assistant; `evaluateIncidentSnapshot`; HTTP client |
| `packages/ai/src/transcribe.ts` | Audio adapter: live / fixture / unavailable |
| `packages/ai/src/*.test.ts` | Evaluation set (paraphrases, negations, injection, stale revision) |
| `apps/assistant/` | Optional Express service: `/health`, `/evaluate`, `/transcribe` |
| `.kiro/specs/evidence-extraction-and-handoff/` | Requirements, design, tasks |

## Sources

| ID | State |
|---|---|
| `acsm-2023-ehi-consensus` | Citation + abstract verified via NCBI API |
| `nata-2015-ehi-position` | Citation + abstract verified via NCBI API |
| `nata-2015-rec8/22/25-*` | Passages checked by Session 1 against nata.org PDF; not re-verified here (full text blocked) |
| `cdc-yellowbook-heat-cold` | Blocked (403). Human must copy the passage |
| `mass-ems-statewide-protocols` | Blocked (403). Agency must confirm edition and applicability |

All rules are marked `requires-clinical-review`. A clinician must review them before real use.
Consensus papers are background, not the crew's local protocol.

## Known limits

- Rules use keyword cues. Unusual wording can be missed; it fails quiet, not loud.
- Live audio needs a provider key; not run against the real provider.
- Final schema names are Session 3's call. If they differ, only `packages/ai/src/bridge.ts` needs to change.
