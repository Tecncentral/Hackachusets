# Handoff — Core platform (EHS)

Branch `feat/core-platform-ehs` · base `2f622d4c419f43408428564029d427d88cb511ee` (`origin/main`, scaffold merged via PR #2) · worked in the main clone, not a separate worktree.

## Run

```bash
npm ci
npm run dev                                   # API :3001 (correction assistant in-process) + web :5173
SCENEBRIEF_ASSISTANT_MODE=unavailable npm run dev -w @scenebrief/api
npm run dev -w @scenebrief/assistant          # optional assistant service :3002 (/evaluate, /transcribe)
SCENEBRIEF_ASSISTANT_MODE=http SCENEBRIEF_ASSISTANT_URL=http://127.0.0.1:3002 npm run dev -w @scenebrief/api
SCENEBRIEF_API_PORT=3101 npm run dev -w @scenebrief/api   # alternate port
npm run sample:handoff -w @scenebrief/api     # regenerates docs/samples/* from the real store
npm run check                                 # typecheck + tests + web build
```

The contract, routes, curl examples and semantics are in [core-api-contract.md](../core-api-contract.md).

## Integration with `feat/emt-website-ehs` (EMT website)

Branch `integrate/emt-website` merges `origin/feat/emt-website-ehs` (`5ff7f33`) onto `integrate/session-2`. With `npm run dev` the website's default "Platform API" mode now runs the whole flow against the real platform and the real assistant. The web shell also launches the assistant service on :3002.

- **One translation point in the website:** `apps/web/src/platform/canonical.ts` maps the canonical incident to the website's view model. Outgoing requests go the other way.
  - `legacy.ts` sends canonical responses through this mapper; the old scaffold shape still works.
  - `http.ts` maps every request. It sends air temperature and humidity to `/environment-readings` and turns a dismissal reason into the resolution `note`. It maps the platform's recorded evaluation outcome (`unavailable` / `failed` / `stale`) to the errors the workspace already handles, and uses the platform's `/handoff-draft`.
  - The website's schemas in `boundary.ts` no longer extend the full canonical `IncidentSchema`. They now describe the view model only, so the dev adapter and its tests still work.
- **Audio:** the website posts recordings to `/assistant/transcribe`, which Vite proxies to `apps/assistant`'s `/transcribe`. The transcript returns to the crew for review and is saved through `/observations`. The platform has no audio route.
- **Platform changes the website needed:**
  - `obtained: false` measurements, recorded as not done and shown as "not obtained" / "not performed";
  - observation categories `exertion`, `environment`, `history`, and input mode `example`;
  - body-temperature site `other`;
  - uncertainty state `not_performed`;
  - re-evaluation moves still-open feedback to the new revision. Without that, the website's "Re-check current revision" could never clear stale items.
- **Mapping choices worth knowing:**
  - website time certainty `reported` → platform `approximate`, reported by `other`;
  - website care `transport` → platform care `other` with a "Transport:" prefix, and platform `oxygen` → website "Airway / breathing";
  - stale feedback is hidden in the website;
  - the website's "Unresolved" list is the platform draft's uncertainties. Open assistant feedback is not counted there, because assistant text is kept out of the handoff.
- **Verified:**
  - `apps/web/src/platform/platform-integration.test.ts` drives the website's HTTP adapter against a real API server and a real assistant server. It covers capture, feedback, clarify/dismiss, re-check, readings before and after cooling, not-obtained BP, humidity as context, key times, the draft, approval and amendment, transcription unavailable, and the assistant switched off.
  - `npm run dev` was run through the Vite proxy.
  - Headless Chrome screenshots against the live stack are in [integration-screenshots/](integration-screenshots/). The workspace shows real assistant feedback and readings before/after cooling, and the receiving view shows the approved structured handoff.
- **Not verified:** interactive browser clicks (no browser automation is installed; the screenshots are of data entered through the API), real microphone transcription (no provider key), screen readers.

## Integration with `session-2` (correction assistant)

Branch `integrate/session-2` merges `origin/session-2` (`4102e50`) into `main` (`22eebdf`) and wires the assistant into the platform.

- **Default assistant:** `SCENEBRIEF_ASSISTANT_MODE=local` runs `@scenebrief/ai`'s `evaluateHybrid` in-process. Use `http` to reach `apps/assistant`. `mock` is now only for tests.
- **Adapter:** `apps/api/src/assistant-bridge.ts` maps the canonical snapshot to the assistant's `/evaluate` contract and maps the response back. It is the only place field names are translated. The platform keeps its own validation, stale handling, ID checks, duplicate suppression and storage. The assistant's `evaluateIncidentSnapshot` bridge is not used, because it targets the website's proposed shape and the scaffold `claims[]`, not the canonical schema.
- **Assistant change (owned by 02, one line):** `norm()` in `packages/ai/src/evaluate.ts` now drops apostrophes before cue matching. Before, "can't be heat stroke" became "can t be" and missed the `cant be` cue, so contractions were silently ignored.
- **Verified:** `assistant-integration.test.ts` runs paraphrases, a plain fact ("Patient is sweating" → no feedback) and an injected instruction, both in-process and over HTTP to a real `apps/assistant` server. The acceptance scenario now runs against the real assistant. A live smoke test ran the API on :3101 in `http` mode against the assistant on :3002; `/transcribe` returned `mode: "unavailable"`, as expected with no key.
- **Observed assistant behavior to know about:**
  - The post-cooling rule fires only when an observation's text mentions cooling and a temperature. A structured post-cooling reading alone does not trigger it; the platform's handoff covers that case ("No body temperature before cooling is documented").
  - The assistant de-duplicates by rule, so two observations making the same sweating claim get one feedback item, linked to the first.

## Implemented

- Typed record in `packages/contracts`: observations, measurements (unit/site/time/device/phase validation), care events, timeline events, context facts, environment readings, consumer wearable records. Also stored assistant evaluations, feedback, resolutions, knowledge references, generalized corrections, and an integrity checker.
- Fixtures: `ehs-runner` (editable; HR 140 bpm at arrival, no clinical temperature) and `ehs-runner-no-wearable`. All fixture data is labeled synthetic.
- Store: atomic mutations on a validated copy, one idempotency map across all routes, and append-vs-edit revision rules. Corrections keep the original record and its sources.
- Assistant gateway: `local` (default, real correction assistant in-process), `http` (`apps/assistant`), `mock` (exact-text fixture replay for tests) and `unavailable` modes, a timeout, response size and schema validation, and a runtime on/off switch. Evaluation runs outside the mutation queue; late results are stored as `stale`. Unknown IDs are discarded and duplicates suppressed.
- Resolutions: `clarify` stores the crew's own wording and supersedes the referenced observations through corrections. `dismiss` and `defer` record provenance only.
- Deterministic handoff: nine sections plus uncertainties, pre/during/after-cooling distinction with conflict detection, exclusion of profile and wearable data until the patient is matched, versioned review with amendment change summaries, and printable HTML (escaped, strict CSP).
- Legacy routes and the current web demo are unchanged.

Sample output (generated, not hand-written): [handoff-v1.txt](../samples/handoff-v1.txt), [handoff-v2-amendment.txt](../samples/handoff-v2-amendment.txt), [handoff-v2-amendment.html](../samples/handoff-v2-amendment.html), [handoff-draft.json](../samples/handoff-draft.json), [incident-after-scenario.json](../samples/incident-after-scenario.json). Source IDs in the samples are random UUIDs and change on each regeneration.

## Checks actually run

- `npm run check` (after integration): typecheck, 85 tests in 10 files (platform, assistant and assistant service), and the web build all pass. The 9 original scaffold tests still pass. One assertion changed on purpose: the handoff text now contains `Collapse time: unknown` instead of `collapseTime: Unknown`.
- `apps/api/src/acceptance.test.ts` runs the shared acceptance scenario over HTTP: witness account, skin-temperature and sweating inferences, real assistant feedback, clarify/defer/dismiss, rectal temperature before and after cold-water immersion, reassessment, assistant disabled, review, and print.
- `apps/api/src/ehs.test.ts` covers fixtures, measurement validation, idempotency, revision rules, corrections, cooling phase and conflicts, missing ≠ normal, matching exclusion, amendments, HTML escaping, stale/invalid/unavailable assistant results, the HTTP client (timeout, bad JSON, 503, unreachable), and resolutions.
- The curl sequence in the contract was run against a live server on port 3101.
- This workstream ran tests manually; its session did not use the `scenebrief` agent. The hook *is* defined (`.kiro/agents/scenebrief.json`, `postToolUse` → `.kiro/hooks/scenario-check.mjs`) and only fires in sessions started with `kiro-cli chat --agent scenebrief`. See `docs/kiro-usage.md`.

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

- **Assistant (02):** integrated (see above). Keep `@scenebrief/ai`'s `EvaluateRequest`/`EvaluateResponse` stable, or update `apps/api/src/assistant-bridge.ts` with any change. Cite only IDs in the request or in your registry; anything else is discarded. Keep echoing `incidentId` and `revision`.
- **Website (03):** use one API adapter. Generate a new `requestId` per deliberate action and reuse it on retry. Send `baseRevision` from the last fetched incident; on `409`, refetch and retry. Show `feedback` with `status: "open"` or `"deferred"` only, and show `evaluations.at(-1).status` (pending, unavailable, failed or stale) explicitly. Never display stale feedback as current. Link `handoffs/:version/print`. The existing paramedic page still uses `/transcripts`.

## Known limitations

- In-memory only: a restart loses all state. No auth, access control, consent enforcement or persistence. Do not deploy.
- The correction assistant's rules use keyword cues; unusual wording can be missed, and it fails quietly. Its clinical rules are marked `requires-clinical-review`. The `mock` mode matches only three exact sentences.
- The platform does not parse free text. Timeline, measurements and care must be entered as structured records; times mentioned inside an observation's text do not update the timeline.
- Legacy `/transcripts` claims are not sent for evaluation and cannot be corrected through `/corrections`.
- Duplicate suppression compares IDs, not wording, so a reworded item about the same observation and references is suppressed.
- The amendment change summary is a set difference on rendered item text. Reordering is ignored, and a change in a time label shows as an added item plus a removed one.
- Clinical text in the mock fixtures is unreviewed. No agency protocol is configured (`protocolContext.applicability: "not_configured"`).
- No Repository seam yet. The spec defers it.
