# Core platform API contract (EHS)

Canonical contract for the core platform. Runtime schemas and types: `@scenebrief/contracts` (`packages/contracts/src`). This supersedes the route table in [api-contract.md](api-contract.md); legacy routes remain and are listed at the end.

The platform is the sole owner of incident state. The assistant returns proposals; the website calls only the platform. Everything is synthetic, in memory, unauthenticated and local-only.

## Conventions

- **Times** are UTC ISO 8601 with `Z`. `null` means *unknown*. Story time is 2026-10-24, America/New_York (EDT, UTC-4).
- **States.** *Unknown* = someone recorded that it is unknown (`time: null` with `certainty: "unknown"`, or `state: "unknown"`). *Not documented* = no record exists. *Not performed* = care event `performance: "not_performed"`. The handoff never renders missing data as a normal finding.
- **Every mutation** takes `requestId` (client-generated, unique per deliberate action) and `baseRevision` (the revision the client last saw), plus optional `recordedBy` (default `"crew"`). Every mutation returns the full validated `Incident`.
- **Idempotency.** Same `requestId` + same body → current state, no duplicate. Same `requestId` with a different body or route → `409`. Retries are checked before revision rules, so a retried request still succeeds.
- **Revision rules.**
  - Appends (observations, measurements, care, timeline, context, environment) accept `baseRevision ≤ revision`. Crew documentation is never blocked by another crew member's change. `baseRevision > revision` → `409`. The record keeps `baseRevision` and `addedAtRevision`.
  - Corrections, `clarify`, evaluations and reviews require `baseRevision === revision` (reviews use `revision`) → otherwise `409`.
  - Content changes increment `revision`. Sharing, matching, storing feedback, `dismiss` and `defer` do not.
- **Sources.** Each crew entry creates a `crew` source (`origin: "crew_entry"`) whose text describes the entry. Optional `sourceIds` link existing evidence and must exist (else `400`).
- **Atomicity.** Each mutation is applied to a copy, schema-validated and integrity-checked before it replaces state. A failed request changes nothing.
- **Errors:** `{ "error": string }`. `400` invalid payload (readable Zod message) · `403` legacy demo gate · `404` unknown incident/record/feedback/version · `409` idempotency conflict, stale or future revision, already resolved/superseded · `500` internal.
- **Patient matching.** New capture routes and review do not require matching. Until the patient is matched, profile (`patient_profile`) and wearable sources and the records that rely only on them are excluded from the handoff and from the snapshot sent to the assistant. `GET /incidents/:id` still returns everything (scaffold boundary).

## Routes

| Method | Path | Body | Notes |
| --- | --- | --- | --- |
| GET | `/api/health` | — | `{ ok, mode: "synthetic-demo", assistant: { configuredMode, enabled, effectiveMode, baseUrl } }` |
| GET | `/api/assistant` | — | Assistant status plus `health: { reachable, detail }` |
| POST | `/api/demo/reset` | `{ variant?: "ehs-runner" \| "ehs-runner-no-wearable" }` | Fresh fixture; clears request IDs. In-flight evaluations are discarded (`409`). |
| POST | `/api/demo/assistant` | `{ enabled: boolean }` | Runtime on/off switch for the "assistant disabled" check; keeps in-memory state |
| GET | `/api/incidents/:id` | — | Full `Incident` |
| POST | `/api/incidents/:id/observations` | `{ requestId, baseRevision, text, observedAt, category?, reportedBy?, inputMode?, sourceIds?, recordedBy? }` | `observedAt` required, nullable. `inputMode: "transcribed"` = assistant transcript reviewed by the crew |
| POST | `/api/incidents/:id/measurements` | `{ requestId, baseRevision, kind, value, unit, measuredAt, diastolic?, site?, device?, observer?, deviceClass?, coolingPhase?, note?, sourceIds? }` | See measurement rules |
| POST | `/api/incidents/:id/care-events` | `{ requestId, baseRevision, kind, description, startedAt, performance?, coolingMethod?, endedAt?, performedBy?, response?, sourceIds? }` | Records care; never prescribes it |
| POST | `/api/incidents/:id/timeline-events` | `{ requestId, baseRevision, kind, time, certainty, reportedBy?, note?, sourceIds? }` | `certainty: "unknown"` exactly when `time: null` |
| POST | `/api/incidents/:id/context-facts` | `{ requestId, baseRevision, category, value, state, reportedBy?, note?, sourceIds? }` | Identity, history, allergies, medications, witness, exertion, clothing, acclimatization, loss of consciousness. `state: "unknown"` exactly when `value: null` |
| POST | `/api/incidents/:id/environment-readings` | `{ requestId, baseRevision, kind, value, unit, measuredAt, location?, method?, sourceIds? }` | Air temperature, humidity, WBGT. Never body temperature |
| POST | `/api/incidents/:id/corrections` | `{ requestId, baseRevision, targetId, replacement, reason? }` | Partial `replacement` merged over the original fields and validated for its type. Original → `superseded` (value and sources kept); new record + `Correction`. Legacy claims → `400` |
| POST | `/api/incidents/:id/evaluations` | `{ requestId, baseRevision }` | Evaluates the current snapshot. Waits for the assistant (timeout), but capture continues meanwhile. See evaluation semantics |
| POST | `/api/incidents/:id/feedback/:feedbackId/resolutions` | `{ requestId, baseRevision, action, clarificationText?, note?, category?, reportedBy?, inputMode?, observedAt?, recordedBy? }` | `action: "clarify" \| "dismiss" \| "defer"`; `clarificationText` required for clarify and rejected otherwise |
| GET | `/api/incidents/:id/handoff-draft` | — | `HandoffDraft` |
| GET | `/api/incidents/:id/handoff-draft/print` | — | Printable HTML, labeled not reviewed |
| POST | `/api/incidents/:id/handoffs` | `{ revision, reviewedBy }` | Freezes a reviewed version (unchanged scaffold body) |
| GET | `/api/incidents/:id/handoffs/:version` | — | Reviewed `Handoff` snapshot |
| GET | `/api/incidents/:id/handoffs/:version/print` | — | Printable HTML (`Content-Security-Policy: default-src 'none'`) |

### Enumerations

- Observation `category`: `account` (witness/patient account), `neurological`, `skin`, `general` (default), `reassessment`, `care_response`.
- `reportedBy` (who asserted it): `crew` (default), `witness`, `patient`, `bystander`, `device`, `dispatch`, `other`.
- Measurement `kind` → allowed `unit`: `body_temperature` °C/°F · `skin_temperature` °C/°F · `heart_rate` bpm · `blood_pressure` mmHg (+ `diastolic`) · `respiratory_rate` breaths/min · `spo2` % · `glucose` mg/dL or mmol/L.
- `site` (body temperature only, required; may be `"unknown"`): `rectal`, `esophageal`, `oral`, `tympanic`, `temporal_artery`, `axillary`, `unknown`.
- `coolingPhase`: `before_cooling` (no cooling had started), `during_cooling`, `after_cooling` (cooling had stopped), `unknown` (default).
- `deviceClass`: `clinical`, `consumer`, `unknown` (default).
- Care `kind`: `cooling`, `oxygen`, `airway`, `vascular_access`, `fluids`, `medication`, `positioning`, `other`. `performance`: `performed` (default), `not_performed`, `unknown`. `coolingMethod` (cooling only): `cold_water_immersion`, `ice_water_towels`, `ice_packs`, `evaporative_fanning`, `other`.
- Timeline `kind`: `exertion_start`, `exertion_end`, `symptom_onset`, `last_known_normal`, `collapse`, `discovery`, `device_fall_event`, `emergency_call`, `crew_arrival`, `patient_contact`, `transport_start`, `hospital_arrival`, `handoff`. `certainty`: `recorded`, `approximate`, `unknown`.

### Measurement rules (enforced)

Unit must match kind. Values must be physically plausible for the unit, which catches unit mix-ups such as 104 °C. These bounds are not clinical thresholds. Blood pressure needs `diastolic`; other kinds must not have one. Body temperature needs `site`; other kinds must not have one. Consumer or wearable skin readings must use `skin_temperature`, never `body_temperature`. A care event marked `not_performed` cannot have times, and `endedAt` cannot be before `startedAt`.

## Evaluation semantics

1. The request is checked (`baseRevision === revision`), a `pending` `Evaluation` is stored, and an immutable snapshot is built. The snapshot contains current records only, filtered by patient matching.
2. The assistant is called **outside** the mutation queue, so observations can be added while it runs.
3. The result is applied:
   - `unavailable` (disabled, not configured, unreachable, HTTP 503) or `failed` (timeout, non-2xx, invalid JSON, schema failure, incidentId/revision mismatch) → recorded with `error`. No feedback is stored.
   - If the incident revision changed meanwhile → `status: "stale"`, and feedback is stored with `status: "stale"`. Stale feedback cannot be resolved (`409`); re-evaluate instead.
   - Items that reference observation, source or knowledge IDs absent from the snapshot or response are discarded (`discardedItems`). Items equal to existing non-stale feedback (same kind, observationIds, evidenceSourceIds, knowledgeReferenceIds) are suppressed (`suppressedDuplicates`). This includes items the crew already dismissed.
   - Storing feedback does not change `revision`.

## Resolution semantics

- **clarify**: stores the crew's `clarificationText` as a new crew-entered observation (`clarifiesFeedbackId` set; category and reportedBy default to the first referenced observation). The referenced current observations are marked `superseded`, and each gets a `Correction` with `feedbackId`. Revision increments. Accepting a proposal records the crew's own statement. It never stores the assistant's text as a fact.
- **dismiss** / **defer**: records `resolvedBy`, `resolvedAt`, `note` and `baseRevision`; revision does not change. Deferred feedback can later be clarified or dismissed. Clarified and dismissed feedback is final (`409`).
- Assistant text (`message`, `suggestedQuestion`, `spokenSummary`) never appears in the handoff.

## Handoff

`HandoffDraft = { incidentId, revision, status: "draft", synthetic: true, generatedAt, patientMatched, sections, sourceIds, uncertainties, text }`

- `sections[]`: `{ id, title, items: [{ text, state, recordIds, sourceIds }] }`. Ids, in order: `presentation`, `exertion_environment`, `neurological`, `measurements`, `care`, `history`, `device_context`, `timeline`, `changes`. Item `state`: `documented`, `reported`, `unknown`, `not_documented`, `superseded`.
- `uncertainties[]`: `{ topic, state: "unknown" | "not_documented" | "approximate" | "conflicting", text, sourceIds }`. Includes collapse, symptom onset, discovery, last known normal, loss of consciousness, missing clinical body temperature, missing vitals, unknown temperature site or time, and a missing pre-cooling temperature. It also flags readings whose recorded cooling phase conflicts with care-event times.
- Deterministic: built from stored records only, with no model calls. Times render in America/New_York.
- `POST /handoffs` freezes `Handoff = { version, revision, reviewedAt, reviewedBy, text, kind: "initial" | "amendment", amendsVersion, patientMatched, sections, sourceIds, uncertainties, changeSummary }`. Earlier versions never change. Re-reviewing the same revision returns the existing version. A later review is an amendment, and its `changeSummary` lists items added or no longer current since the previous version.

## Assistant service boundary (platform → assistant)

The platform uses the correction assistant from workstream 02 (`@scenebrief/ai`, service `apps/assistant`). It is configured with environment variables; no secrets are needed.

| Variable | Default | Meaning |
| --- | --- | --- |
| `SCENEBRIEF_API_PORT` | `3001` | API port |
| `SCENEBRIEF_ASSISTANT_MODE` | `local` | `local` (correction assistant in-process), `http` (same assistant via `apps/assistant`), `mock` (fixture replay of three exact sentences, for tests), or `unavailable` |
| `SCENEBRIEF_ASSISTANT_URL` | `http://127.0.0.1:3002` | `apps/assistant` base URL (`http` mode) |
| `SCENEBRIEF_ASSISTANT_TIMEOUT_MS` | `8000` | Evaluate timeout (100–60000) |

Two shapes are involved, and one adapter (`apps/api/src/assistant-bridge.ts`) translates between them:

- **Platform side (canonical, `@scenebrief/contracts`).** `EvaluateRequest = { incidentId, revision, patientMatched, observations, measurements, sources, careEvents, timelineEvents, contextFacts, environmentReadings, wearableRecords, protocolContext }` is the immutable, current-only, matching-filtered snapshot. `EvaluateResponse = { incidentId, revision, mode: "deterministic" | "model" | "hybrid" | "mock", feedback (≤10), knowledgeReferences }` is what the platform validates and stores.
- **Assistant wire format (`@scenebrief/ai` `EvaluateRequest`/`EvaluateResponse`).** This is what `POST {URL}/evaluate` accepts and returns. The bridge maps the snapshot onto it:
  - measurement kinds become camelCase, e.g. `body_temperature` → `temperature` and `skin_temperature` → `skinTemperatureDeviation`;
  - blood pressure becomes `"104/62"`, and `coolingPhase` becomes `beforeCooling: true | false | null`;
  - temperature site becomes `method`/`site`, with `"unknown"` → `null`;
  - air temperature and humidity are sent as context kinds (`ambientTemperature`, `humidity`), and the wearable skin-temperature deviation is sent with method `consumer wearable skin`;
  - only care with `performance: "performed"` is sent;
  - timeline certainty becomes `recorded`, `reported` (a person said it), `estimated` (approximate) or `unknown`.
  On the way back, `rules-only` → `deterministic` and `hybrid` → `hybrid`. Cited IDs are resolved from the assistant's registry (`referenceById`) into stored `KnowledgeReference`s, all with `reviewStatus: "unreviewed"`.
- `FeedbackItem` (all keys required): `id`, `kind: "conflict" | "missing_context" | "unsupported_inference"`, `message` (1–600), `suggestedQuestion` (1–300 or `null`), `observationIds[]`, `evidenceSourceIds[]`, `knowledgeReferenceIds[]`, `spokenSummary` (1–240 or `null`).
- `KnowledgeReference`: `id`, `title`, `url`, `versionDate|null`, `section|null`, `passage|null` (≤600), `applicability`, `reviewStatus: "unreviewed" | "clinician_reviewed"`.
- `GET {URL}/health` → any 2xx means reachable. Responses over 200 KB are rejected, and response bodies are never logged.
- Real exchanges, regenerated by `npm run sample:handoff -w @scenebrief/api`: [platform snapshot](samples/platform-evaluate-snapshot.json) → [assistant request](samples/assistant-evaluate-request.json) → [assistant response](samples/assistant-evaluate-response.json) → [stored result](samples/platform-evaluate-result.json).
- **Audio** is handled entirely by the assistant service: `POST {URL}/transcribe` (multipart `audio`) returns `{ transcript, mode, warnings }`. With no `SCENEBRIEF_TRANSCRIBE_API_KEY` it returns `mode: "unavailable"`. The UI submits the reviewed text to `/observations` with `inputMode: "transcribed"`. The platform has no audio route.

The `mock` mode replays `packages/fixtures/src/assistant-examples.ts` for three exact sentences. It is a test double, not reasoning.

## Fixtures

`createIncidentFixture("ehs-runner" | "ehs-runner-no-wearable")` in `@scenebrief/fixtures`. The runner fixture contains a synthetic profile, overnight wearable summary, workout and HR samples, device fall, weather (88 °F, 70%), dispatch, crew arrival, arrival observations and HR 140 bpm (editable through corrections). It contains no clinical temperature. The no-wearable variant removes all wearable sources and records and sets `wearableStatus.availability: "unavailable"`.

## curl examples (verified against a running API)

```bash
B=http://127.0.0.1:3001/api; I=$B/incidents/runner-found-down; J='Content-Type: application/json'
curl -s -X POST $B/demo/reset -H "$J" -d '{}'
curl -s -X POST $I/observations -H "$J" -d '{"requestId":"c1","baseRevision":0,"text":"He is sweating, so this cannot be heat stroke.","observedAt":"2026-10-24T15:00:00Z"}'
curl -s -X POST $I/measurements -H "$J" -d '{"requestId":"c2","baseRevision":1,"kind":"body_temperature","value":41.2,"unit":"°C","site":"rectal","measuredAt":"2026-10-24T15:02:00Z","coolingPhase":"before_cooling","device":"Rectal thermometer (synthetic)","deviceClass":"clinical"}'
curl -s -X POST $I/evaluations -H "$J" -d '{"requestId":"c3","baseRevision":2}'
FB=$(curl -s $I | node -pe 'JSON.parse(require("fs").readFileSync(0)).feedback[0].id')
curl -s -X POST $I/feedback/$FB/resolutions -H "$J" -d '{"requestId":"c4","baseRevision":2,"action":"clarify","clarificationText":"Skin hot and sweaty. Heat illness remains a concern."}'
curl -s $I/handoff-draft
curl -s -X POST $I/handoffs -H "$J" -d '{"revision":3,"reviewedBy":"Paramedic A"}'
open $I/handoffs/1/print            # printable HTML
curl -s -X POST $B/demo/assistant -H "$J" -d '{"enabled":false}'
curl -s -X POST $I/evaluations -H "$J" -d '{"requestId":"c6","baseRevision":3}'   # evaluation: unavailable
```

## Legacy scaffold routes (unchanged behavior)

| Method | Path | Body | Notes |
| --- | --- | --- | --- |
| POST | `/api/incidents/:id/sharing` | `{ sharing }` | No revision change |
| POST | `/api/incidents/:id/match` | `{ patientId, confirmed: true }` | `403` without sharing, `409` wrong ID |
| POST | `/api/incidents/:id/transcripts` | `{ requestId, text }` | Scripted claim extraction. Still requires sharing and matching (`403`). Claims appear in the handoff; they are not sent for evaluation |

Changes from the scaffold contract: `Source` gains `origin` and `limitation`. `Correction` gains `targetType`, `originalId`, `replacementId`, `reason`, `feedbackId` and `revision`; `originalClaimId` and `replacementClaimId` remain, but only for claim corrections. `Handoff` gains structured fields, and its `text` is the new deterministic format (for example `Collapse time: unknown` instead of `collapseTime: Unknown`). Review no longer requires patient matching.
