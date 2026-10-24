# incident-state-and-replay — Core platform for suspected EHS

Owner: core platform · Branch: `feat/core-platform-ehs` · Paths: `apps/api/`, `packages/contracts/`, `packages/fixtures/`, backend docs/tests

**Scope change (supersedes the earlier video/replay priorities).** The platform is the sole owner of incident state for a suspected exertional heat stroke (EHS) scene: it ingests synthetic health/context data, records crew observations, measurements and care, stores assistant proposals and the EMT's resolutions, and generates a crew-reviewed ER handoff. MCP replay tools, video support and persistence are out of scope for this session.

Audio is **not** handled by the platform. The correction assistant transcribes audio; the crew reviews the text, which is then submitted through `POST /observations` with `inputMode: "transcribed"`.

## Requirements

1. **Typed record.** The incident SHALL hold typed observations, measurements, care events, timeline events, context facts (identity/history/exertion), environment readings and optional wearable records. Each record SHALL keep its sources, record time, author and the revision it was added at. Runtime validation SHALL use `@scenebrief/contracts`.
2. **Unknown is not missing.** "Unknown" (someone stated it is unknown), "not documented" (no record) and "not performed" (care event status) SHALL be distinct. Missing data SHALL never render as a normal finding. No checklist SHALL block saving or handoff.
3. **Measurements.** Each measurement SHALL keep value, unit, method/site (temperature), event time (nullable = unknown), capture time, device/observer, device class and cooling phase. Units SHALL be validated per kind. Consumer skin temperature SHALL be a separate kind from body temperature. Environmental readings SHALL be stored separately from body measurements.
4. **Cooling.** The handoff SHALL distinguish readings before, during and after cooling, SHALL NOT present a post-cooling reading as the initial reading, and SHALL flag when recorded phase conflicts with care-event times.
5. **Idempotency.** Every mutation SHALL carry a `requestId`. A retry with the same body SHALL return current state without duplication; reuse with a different body SHALL return 409.
6. **Revisions.** Content changes SHALL increment `revision`. Appends accept a `baseRevision` at or below current (recorded for audit); corrections, clarifications, evaluations and reviews SHALL require `baseRevision === revision` (409 otherwise). Sharing, matching, feedback storage, dismiss and defer SHALL NOT change revision.
7. **Corrections.** Correcting a record SHALL create a replacement with a new ID, mark the original `superseded`, keep its value and sources, and add a `Correction` linking both.
8. **Assistant boundary.** The platform SHALL call the assistant through an interface with `mock` (default, fixture replay), `unavailable` and `http` modes, a timeout, and response validation. Evaluation SHALL NOT block other mutations. A response for a revision that has since changed SHALL be stored as `stale` and not shown as current. Feedback that references unknown observation/source/knowledge IDs SHALL be discarded. Duplicate feedback SHALL be suppressed.
9. **Resolutions.** `clarify` SHALL record the EMT's own text as a new crew observation, supersede the referenced observations through corrections, and increment revision. `dismiss` and `defer` SHALL record who, when and why without changing clinical content. Accepting a proposal records the EMT's clarification, never an AI-established fact.
10. **Assistant optional.** With the assistant disabled or failing, capture, corrections and handoff SHALL keep working.
11. **Handoff.** The draft SHALL be deterministic (no AI) and contain presentation, exertion/environment, neurological observations, measurements with methods, care and response, relevant history, device context, a source-linked timeline, changes, and uncertainties. It SHALL be printable (HTML). Profile and wearable data SHALL be excluded until the patient is matched.
12. **Versioned review.** Reviewing SHALL freeze a snapshot for a specific revision. Earlier versions SHALL never change; later reviews SHALL be amendments with a change summary.
13. **Compatibility.** Existing routes (`/transcripts`, `/handoffs`, `/sharing`, `/match`, `/demo/reset`) and the current web demo SHALL keep working.
14. **Fixtures.** An editable EHS runner fixture and a variant without wearable data SHALL be provided; synthetic data SHALL be labeled.

## Out of scope

Authentication, access control, consent enforcement, durable storage, MCP tools, audio handling, real device/EHR/dispatch integration, clinical reasoning in the backend, deployment.
