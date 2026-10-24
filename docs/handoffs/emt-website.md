# Handoff — EMT website (EHS) · display name "Trauma Llama"

- Branch: `feat/emt-website-ehs` · Worktree: `.scenebrief-worktrees/scenebrief-emt-website`
- Base: `origin/main` @ `2f622d4c419f43408428564029d427d88cb511ee`
- PR (draft): https://github.com/Tecncentral/Hackachusets/pull/3
- Superseded work: `feat/paramedic-capture` @ `5fe4f77` (local checkpoint, not pushed).
- Spec: `.kiro/specs/paramedic-capture-and-clarification/` (R1–R11; R11 = design integration)
- Design reference: `/Users/justin/Desktop/Projects/hackachusetts/project/*.dc.html` (outside the repo; translated to React, no prototype runtime or demo data copied)

Only user-facing strings were renamed to Trauma Llama (header, document title, print/export). Packages, folders, schemas and the repo keep the SceneBrief names.

## Run

```bash
npm ci
npm run dev                      # API :3001, web :5173
# Platform API mode (default):        http://127.0.0.1:5173/#paramedic
# Development adapter (labeled):       http://127.0.0.1:5173/?adapter=dev#paramedic
# Receiving view:                      …#er        Patient sharing toggle: …#patient
```

On a shared machine, use different ports through a local, uncommitted Vite script (this session used API 3011 / web 5181).

## Main journey (development adapter shows all of it)

1. **A · Capture.** The workspace opens for an **unidentified patient**: capture and handoff work immediately. "Record observation" (real `MediaRecorder`) → "Stop and transcribe" → editable transcript → "Save observation". Alternatively, "DEMO · Load example transcript", or type. Witness account, skin-temperature inference, and sweating inference.
2. **Identify patient (optional).** Patient & context → "Identify patient (optional)" → demo code → confirm. This adds the profile and wearable background; it never blocks documentation.
3. **B · Clarification.** Each saved observation triggers an evaluation of that revision. Feedback appears under its observation: chip, explanation, suggested question, Clarify / Defer / Dismiss, Patient evidence and Clinical reference disclosures, Play feedback / Mute. After any new information the feedback is marked stale with both revisions, and actions are hidden until "Re-check current revision".
4. **C · Care & vitals.** Add a rectal temperature before cooling, a cooling care event with start/stop, and a later temperature. Readings show BEFORE COOLING / AFTER COOLING with method, time and source tag. Phase comes from the crew entry, or is placed from documented cooling times and labeled "(from cooling times)".
5. **Handoff.** The card always lists unresolved items. Review full handoff → complete document → "I reviewed the complete draft, including N unresolved items." → Approve reviewed handoff (rev N). Print handoff / Download HTML. The receiving view shows the approved version and an amendment notice.
6. Dev bar → untick "Assistant available": "Assistant feedback unavailable…". Capture, care and handoff keep working.

## Implemented vs. simulated vs. dependent

| Area | Website | Current platform (main @ 2f622d4) |
|---|---|---|
| Unidentified-patient documentation | No match gate in the UI or dev adapter; patient-linked context hidden until matched (`platform/scope.ts`) | **Gap:** `/transcripts` returns 403 "Confirm the patient association first." before a match; the UI shows this as a platform dependency and keeps the text |
| Observations | `POST /observations` | Falls back to `POST /transcripts` (really saves; category, observed time and revision check are not stored, and the UI says so). Verified in browser + API |
| Measurements, care events, key times | Forms, readings, phase labels | **Not available**: explicit "this platform does not accept … yet", entry kept |
| Assistant evaluation / resolutions | Per-revision evaluation, stale handling, clarify/defer/dismiss | **Not available** on platform; works only with the dev adapter's labeled **deterministic stub** (`devAssistant.ts`) |
| Transcription | Recording, cancel, stop-and-transcribe, review | **Not available** in either mode; no provider is connected. Shows "Transcription unavailable. Recording was not saved…" and never fakes a transcript |
| References | Title, URL, version, passage, review status per item; placeholder when none | 3 NATA 2015 passages in the dev stub only, marked "Not clinically reviewed" |
| Handoff draft | `GET /handoff-draft`; otherwise website grouping labeled "Grouped by the website…" | Not available; approval uses existing `POST /handoffs`. Platform stores its legacy text (ER view shows it verbatim, labeled) |
| Spoken feedback | `speechSynthesis`, on demand; stops before recording | Browser only |
| Reopen dismissed feedback | Not shown | No resolution action for it in the boundary |

## Interface delta for the platform and assistant owners

UI schemas: `apps/web/src/platform/boundary.ts`. All new incident collections are optional, so today's response validates unchanged.

```json
POST /observations      { "requestId", "baseRevision", "text", "observedAt": null, "category": "mental_status", "inputMode": "typed|voice-reviewed|example" }
POST /measurements      { "requestId", "baseRevision", "kind": "temperature", "status": "obtained|not_obtained", "value": 41.2, "value2": null, "unit": "°C",
                          "method": "rectal", "eventTime": "…Z", "coolingPhase": "before|during|after|unknown", "sourceKind": "manual", "device": null, "recordedBy": "crew", "note": null }
POST /care-events       { "requestId", "baseRevision", "category": "cooling", "action", "startedAt", "endedAt", "note", "recordedBy" }
POST /timeline-events   { "requestId", "baseRevision", "kind": "discovery|collapse|…", "time": null, "certainty": "recorded|reported|estimated|unknown", "note" }
POST /evaluations       { "requestId", "baseRevision" } → incident with feedback[] (each carries "revision")
POST /feedback/:id/resolutions { "requestId", "baseRevision", "action": "clarify|dismiss|defer", "clarificationText"? }   (dismiss: optional reason)
GET  /handoff-draft     { "revision", "sections": [{ "id", "title", "items": [{ "text", "sourceIds", "note" }] }], "sourceIds", "uncertainties": [{ "label", "state": "unknown|not_documented|not_obtained|unresolved", "detail" }] }
POST /audio/transcriptions  multipart audio + requestId → { "transcript", "mode", "warnings" }
```

Needed semantics:
- **Platform:** allow observations, measurements, care and review **without a confirmed match**, and gate only patient-linked data. Re-evaluating should refresh still-applicable open/deferred items to the new revision, which the dev adapter does; otherwise stale items cannot be re-checked. Clarify bumps the revision and links a correction while keeping the original. Dismiss and defer do not bump it. Return 409 for stale baseRevision or approval, and 404 `Unknown endpoint` / 501 / 503 for unavailable routes.
- **Platform draft:** use section ids `summary, times, measurements, care, observations, exertion, history, device`, with the unresolved list in `uncertainties`. Preferably the platform computes cooling-phase grouping. `not_obtained` renders as "Not performed".
- **Assistant:** `/transcribe` and server-side provider credentials for live audio; `/evaluate` feedback items with `observationIds` so they attach to the right card.

## Shared files changed

- `apps/web/package.json` + `package-lock.json`: `zod@^4.6.7` for `@scenebrief/web` (same version as contracts; via `npm install -w`).
- `apps/web/index.html` title; `main.tsx`, `style.css` (shell owned by this scope). No changes to `apps/api`, `packages/*`, CI, or root config.

## Checks run (this session)

- `npm run check` → typecheck clean, **11 files / 83 tests pass**, build OK.
- Tests cover the adapters (idempotency, revision conflicts, late evaluation, assistant off, resolutions, approval versions, unidentified-patient documentation), http unavailable/compat/network mapping, legacy normalization against the real API store, draft states and `phaseOf`, summary/readings/handoff card/review/print document rendering, and workspace stale feedback.
- Browser (Playwright + installed Chrome, fake mic) at **1280, 390, and 360 px (reduced motion)**:
  - Full A→B→C journey for an unidentified patient, then matching; no horizontal overflow, no target under 44 px, no page errors.
  - Recording: cancel during the permission prompt now closes the mic. This was a real bug, found and fixed in this pass.
  - Stop and transcribe → transcription unavailable.
  - Stale feedback → re-check; clarify, defer, dismiss with reason.
  - Before/after-cooling readings; approve; changed-after-approval notice.
  - Print media hides all controls. The PDF shows banner, sections, Unresolved box, sources, signature lines and footer.
  - Keyboard Tab reaches all controls with a visible 3px focus ring.
- Platform mode (1280 px):
  - Microphone denied.
  - Unidentified save → 403 platform dependency shown, text kept; after matching, Retry save succeeds.
  - Evaluation unavailable; measurement unavailable.
  - Approval version conflict → "Reload latest draft" → approve.
- Phone, platform mode, with network aborted:
  - Save failure keeps the text; retry stores exactly once.
  - Approval connection failure keeps the review; retry succeeds.
- Not verified: real transcription, screen readers, Safari/Firefox recording formats, audible speech output.

Screenshots (actual implementation): `docs/handoffs/emt-website-screenshots/`.

## Design elements not integrated (and why)

- Prototype controls bar: demo only. Its equivalent is the dev adapter bar ("Assistant available").
- Design demo data (INC-DEMO-0412, 41.2 °C at 14:20, etc.): all data comes from the platform fixture and crew entries.
- Atkinson Hyperlegible fonts: named first in the font stack but not loaded (no font dependency); system-ui renders.
- "Reopen feedback": no platform action exists.
- Care-event types "Cooling started / Cooling ended": modeled as one cooling event with start/stop times, which the platform prompt asks for.
- One clinical reference "placeholder" panel: shown only when an item has no references; the dev stub supplies verified NATA passages labeled not clinically reviewed.
- Working concern text ("Suspected exertional heat stroke — not established") is a scenario constant in `model.ts` until the platform provides a field.

## Kiro work

The spec was updated before each pass. Sub-agents built the summary column, care column/handoff card, and review/print view in parallel from written briefs. This session integrated and reviewed them, and wrote the platform adapters, capture state machine, observation/feedback cards, layout and shell. The `.kiro/hooks/scenario-check.mjs` hook watches API/contracts only, not `apps/web`.
