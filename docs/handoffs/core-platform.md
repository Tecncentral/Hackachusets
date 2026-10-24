# Handoff — Core platform (EHS)

Branch `feat/core-platform-ehs` · base `2f622d4c419f43408428564029d427d88cb511ee` (`origin/main`, scaffold merged via PR #2) · worked in the main clone, not a separate worktree.

## Run

```bash
npm ci
npm run dev                                   # API :3001 (mock assistant) + web :5173
SCENEBRIEF_ASSISTANT_MODE=unavailable npm run dev -w @scenebrief/api
SCENEBRIEF_ASSISTANT_MODE=http SCENEBRIEF_ASSISTANT_URL=http://127.0.0.1:3002 npm run dev -w @scenebrief/api
SCENEBRIEF_API_PORT=3101 npm run dev -w @scenebrief/api   # alternate port
npm run sample:handoff -w @scenebrief/api     # regenerates docs/samples/* from the real store
npm run check                                 # typecheck + tests + web build
```

The contract, routes, curl examples and semantics are in [core-api-contract.md](../core-api-contract.md).

## Implemented

- Typed record in `packages/contracts`: observations, measurements (unit/site/time/device/phase validation), care events, timeline events, context facts, environment readings, consumer wearable records. Also stored assistant evaluations, feedback, resolutions, knowledge references, generalized corrections, and an integrity checker.
- Fixtures: `ehs-runner` (editable; HR 140 bpm at arrival, no clinical temperature) and `ehs-runner-no-wearable`. All fixture data is labeled synthetic.
- Store: atomic mutations on a validated copy, one idempotency map across all routes, and append-vs-edit revision rules. Corrections keep the original record and its sources.
- Assistant gateway: `mock` (default, exact-text fixture replay), `unavailable` and `http` modes, a timeout, response size and schema validation, and a runtime on/off switch. Evaluation runs outside the mutation queue; late results are stored as `stale`. Unknown IDs are discarded and duplicates suppressed.
- Resolutions: `clarify` stores the crew's own wording and supersedes the referenced observations through corrections. `dismiss` and `defer` record provenance only.
- Deterministic handoff: nine sections plus uncertainties, pre/during/after-cooling distinction with conflict detection, exclusion of profile and wearable data until the patient is matched, versioned review with amendment change summaries, and printable HTML (escaped, strict CSP).
- Legacy routes and the current web demo are unchanged.

Sample output (generated, not hand-written): [handoff-v1.txt](../samples/handoff-v1.txt), [handoff-v2-amendment.txt](../samples/handoff-v2-amendment.txt), [handoff-v2-amendment.html](../samples/handoff-v2-amendment.html), [handoff-draft.json](../samples/handoff-draft.json), [incident-after-scenario.json](../samples/incident-after-scenario.json). Source IDs in the samples are random UUIDs and change on each regeneration.

## Checks actually run

- `npm run check`: typecheck, 36 tests in 4 files, and the web build all pass. The 9 original scaffold tests still pass. One assertion changed on purpose: the handoff text now contains `Collapse time: unknown` instead of `collapseTime: Unknown`.
- `apps/api/src/acceptance.test.ts` runs the shared acceptance scenario over HTTP: witness account, skin-temperature and sweating inferences, mock feedback, clarify/defer/dismiss, rectal temperature before and after cold-water immersion, reassessment, assistant disabled, review, and print.
- `apps/api/src/ehs.test.ts` covers fixtures, measurement validation, idempotency, revision rules, corrections, cooling phase and conflicts, missing ≠ normal, matching exclusion, amendments, HTML escaping, stale/invalid/unavailable assistant results, the HTTP client (timeout, bad JSON, 503, unreachable), and resolutions.
- The curl sequence in the contract was run against a live server on port 3101.
- No Kiro hook was registered. `.kiro/hooks/scenario-check.mjs` exists but has no hook definition file; tests were run manually.

## Interface delta for the integration session

- **New routes:** observations, measurements, care-events, timeline-events, context-facts, environment-readings, corrections, evaluations, resolutions, handoff-draft (+ print), handoffs/:version (+ print), `GET /assistant`, `POST /demo/assistant`. `POST /demo/reset` accepts an optional `variant`.
- **Not implemented (by decision):** `POST /incidents/:id/audio/transcriptions`. The assistant transcribes audio; the UI shows the transcript for review and submits the edited text to `/observations` with `inputMode: "transcribed"`.
- **Additions to the shared logical boundary:**
  - The observation body accepts optional `category`, `reportedBy`, `inputMode`, `sourceIds` and `recordedBy`.
  - The resolution body accepts optional `note`, `recordedBy`, `category`, `reportedBy`, `inputMode` and `observedAt`.
  - `EvaluateRequest` adds `patientMatched`, `timelineEvents`, `contextFacts`, `environmentReadings` and `wearableRecords`.
  - `EvaluateResponse` adds optional `knowledgeReferences`, so the platform can store title, URL, version, passage and review status for every reference ID used.
  - `mode` is an enum: `deterministic`, `model`, `hybrid` or `mock`.
  - The draft carries `text` and `patientMatched` in addition to `{ revision, sections, sourceIds, uncertainties }`.
- **Schema changes to existing types:** `Source` +`origin`, +`limitation`, and new types `crew`, `patient_profile`, `weather`. `Correction` is generalized (legacy claim fields kept). `Handoff` gains structured fields. `Incident` gains the new collections. Review no longer requires patient matching; `/transcripts` still does.

## Notes for the other workstreams

- **Assistant (02):** implement `POST /evaluate` against `EvaluateRequestSchema` and `EvaluateResponseSchema`, and use `docs/samples/assistant-evaluate-*.json` as the real exchange. Only reference IDs present in the request (or in your `knowledgeReferences`), or the item is discarded. Echo `incidentId` and `revision` exactly. Return 503 when your provider is unavailable. The mock's two NATA citations (recommendations 22 and 25, verified against the PMC text on 2026-10-24) are placeholders for your registry.
- **Website (03):** use one API adapter. Generate a new `requestId` per deliberate action and reuse it on retry. Send `baseRevision` from the last fetched incident; on `409`, refetch and retry. Show `feedback` with `status: "open"` or `"deferred"` only, and show `evaluations.at(-1).status` (pending, unavailable, failed or stale) explicitly. Never display stale feedback as current. Link `handoffs/:version/print`. The existing paramedic page still uses `/transcripts`.

## Known limitations

- In-memory only: a restart loses all state. No auth, access control, consent enforcement or persistence. Do not deploy.
- The mock assistant matches only three exact statements. It is not reasoning, and paraphrases produce no feedback.
- The platform does not parse free text. Timeline, measurements and care must be entered as structured records; times mentioned inside an observation's text do not update the timeline.
- Legacy `/transcripts` claims are not sent for evaluation and cannot be corrected through `/corrections`.
- Duplicate suppression compares IDs, not wording, so a reworded item about the same observation and references is suppressed.
- The amendment change summary is a set difference on rendered item text. Reordering is ignored, and a change in a time label shows as an added item plus a removed one.
- Clinical text in the mock fixtures is unreviewed. No agency protocol is configured (`protocolContext.applicability: "not_configured"`).
- No Repository seam yet. The spec defers it.
