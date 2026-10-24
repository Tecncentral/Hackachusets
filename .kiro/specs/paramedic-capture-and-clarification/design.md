# Design — EMT website

## Layers

```
main.tsx (shell: view switch, adapter banner, polling)
  └─ PlatformProvider (platform/context.tsx)  ← one adapter instance
       ├─ features/paramedic/Workspace  (incident workspace)
       ├─ features/er/ErPage            (receiving + print/export)
       └─ features/patient/PatientPage  (preserved; demo sharing toggle)
platform/
  boundary.ts   zod schemas for the logical boundary (UI-side, provisional until the platform publishes canonical schemas)
  http.ts       HttpPlatform: calls /api routes; 404 "Unknown endpoint" → PlatformError('unavailable')
  dev.ts        DevPlatform: same interface in-browser (localStorage), seeded from GET /api/incidents/:id; opt-in only
  devAssistant.ts  development evaluation stub (labeled), used only by DevPlatform
  draft.ts      deterministic grouping of the record into handoff sections (dev adapter + labeled fallback)
  index.ts      adapter selection (?adapter=dev or VITE_PLATFORM_ADAPTER=dev), default http
```

## Adapter interface

`getIncident, reset, setSharing, match, addObservation, addMeasurement, addCareEvent, addTimelineEvent, transcribe, evaluate, resolveFeedback, getHandoffDraft, approveHandoff`. Mutations take `{ requestId, baseRevision, ... }` and resolve to the full validated `WorkspaceIncident`. Errors are `PlatformError { kind: unavailable | conflict | forbidden | invalid | network | server, status, message, endpoint }`.

`WorkspaceIncident` = canonical `Incident` + optional `observations, measurements, careEvents, timelineEvents, feedback, knowledgeReferences, evaluations, corrections(observation-level)`; missing arrays default to empty so the UI works against today's platform.

### Compatibility with the current platform (main @ 2f622d4)
- `addObservation`: POST `/observations`; if unavailable, falls back to the existing POST `/transcripts` `{ requestId, text }` (a real save; `baseRevision`/`observedAt`/category are dropped and the UI says so).
- Legacy `voice` sources map to observations; legacy `discoveryTime`/`collapseTime` claims map to key times.
- Measurements, care events, key times, evaluation, resolutions, audio, handoff-draft: explicit "unavailable" on the current platform.
- Handoff draft: GET `/handoff-draft`; if unavailable the website groups the stored record with `draft.ts` and labels it "Website-grouped draft — platform draft unavailable". Approval still uses POST `/handoffs`.

## State rules
- No local incident copy outside the adapter. Components hold only form drafts, pending `requestId`s, and disclosure state.
- Pending submission keeps its `requestId` until success; edits create a new one.
- Feedback staleness: `feedback.revision < incident.revision`.
- Evaluation is applied only when the response revision equals the request `baseRevision` (dev adapter rejects with 409 otherwise; http adapter relies on the platform).
- Speech: `speech.ts` wraps `speechSynthesis`; recorder calls `speech.stop()` before `getUserMedia`.

## Workspace layout (progressive)
Header (patient, revision, mode) → Status summary (mental status, temperature, unknowns) → Next-step bar (single primary action) → Capture (Note/voice · Measurement · Care · Key time) → Assistant feedback → Record (measurements & cooling, observations & changes, key times, evidence/wearable in `<details>`) → Handoff review. Desktop ≥960 px: two columns (capture + feedback | status + record); handoff full width.

## Styles
`style.css` holds shell tokens; feature styles live in `features/*/*.css` scoped by a root class. Print styles hide everything but the handoff document.
