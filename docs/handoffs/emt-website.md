# Handoff — EMT website (EHS)

- Branch: `feat/emt-website-ehs` · Worktree: `.scenebrief-worktrees/scenebrief-emt-website`
- Base: `origin/main` @ `2f622d4c419f43408428564029d427d88cb511ee`
- Superseded work: `feat/paramedic-capture` @ `5fe4f77` (local checkpoint, not pushed). Reused: time formatting, source list, association step, scoped-CSS approach, real-store test states.
- Spec: `.kiro/specs/paramedic-capture-and-clarification/` (requirements R1–R10, design, tasks)
- PR: see the draft PR linked from this branch.

## Run

```bash
npm ci
npm run dev                      # API :3001, web :5173
# Platform API mode (default):        http://127.0.0.1:5173/#paramedic
# Development adapter (labeled):       http://127.0.0.1:5173/?adapter=dev#paramedic
# Receiving view:                      …#er        Patient sharing toggle: …#patient
```

On a shared machine use other ports without editing committed config, e.g. a local, uncommitted Vite script with `server.port` and a proxy to your API port (this session used API 3011 / web 5181).

## Main flow (development adapter shows the full scenario)

1. Patient sharing → enable. EMT workspace → Use demo code → Confirm.
2. Capture → Observation: record voice (real `MediaRecorder`) or type; or open "Example transcripts (for testing — not recordings)". Save observation. Add the witness account, the skin-temperature inference, and the sweating inference.
3. Assistant feedback → Check record. Each item shows the original statement, evidence sources, reference (title, URL, version, passage, review status), suggested question, Play/Stop/Mute. Clarify (text) / Dismiss (optional reason) / Defer.
4. Key time → discovery 10:43 "reported"; collapse stays Unknown (always shown separately).
5. Measurement → temperature, value, unit, method/site, time, before/during/after cooling. Care event → cooling with start/stop and response. Repeat temperature after cooling; mental status reassessment.
6. Handoff → full draft → "I reviewed this draft (revision N)" → Approve. Any change in between clears the confirmation; a 409 shows the error and the refreshed draft.
7. Receiving view → reviewed version, amendment notice, Print, Download HTML.
8. Dev bar → untick "Assistant available": evaluation shows "unavailable"; capture and handoff still work.

## Implemented vs. simulated

| Area | Status |
|---|---|
| Single network adapter | `apps/web/src/platform/` — `http.ts` (default) and `dev.ts` (opt-in), same `Platform` interface; shell, workspace, ER, patient views use only it |
| Observations | Platform: `POST /observations`; falls back to existing `POST /transcripts` (really saves; UI states category/observed time/revision check were not stored) |
| Measurements, care events, key times | UI complete. Platform routes not on main → explicit "Not available on this platform yet" error, entry kept for retry. Work fully in dev adapter |
| Voice | Real `getUserMedia` + `MediaRecorder`, 60 s cap, stop/cancel/discard, permission denied / no device / insecure / unsupported / empty / transcription failure messages. Upload → `POST /audio/transcriptions` (multipart `audio`, `requestId`); transcript goes into the editable box; save is explicit. **No transcription provider is wired**: on main it returns unavailable; dev adapter also returns unavailable (it never fakes a transcript) |
| Assistant feedback | Platform `POST /evaluations` + `/feedback/:id/resolutions` (unavailable on main). Dev adapter uses `devAssistant.ts`, a **deterministic phrase-rule stub**, labeled "Development stub" on every item |
| Knowledge references | 3 NATA 2015 position statement passages (Rec. 8, 22, 25), verified against nata.org PDF on 2026-10-24; marked "Not clinically reviewed". Consensus background, not local protocol. CDC page returned 403; ACSM verified at abstract level only and not used |
| Spoken feedback | `speechSynthesis`, on demand only; Play/Stop per item, global Stop and Mute; text always shown; recording start cancels speech |
| Handoff draft | `GET /handoff-draft`; when unavailable, `draft.ts` groups stored records and the document says "Grouped by the website…" |
| Approval | `POST /handoffs` `{ revision, reviewedBy }` (existing). On main the stored text is the platform's legacy text; ER shows it verbatim, labeled |
| ER view / export | Reviewed version, amendment notice, sources appendix, Print (print CSS), standalone HTML download |
| Patient context | Shown only after match; age/history/allergies/meds render "Not documented" when the platform provides `patient.context` but leaves fields empty |

## Interface delta for the platform owner (proposal; UI schemas in `apps/web/src/platform/boundary.ts`)

All new collections are optional on `GET /api/incidents/:id`, so today's response validates unchanged. Requests:

```json
POST /observations      { "requestId": "…", "baseRevision": 3, "text": "…", "observedAt": null, "category": "mental_status", "inputMode": "typed" }
POST /measurements      { "requestId", "baseRevision", "kind": "temperature", "status": "obtained", "value": 40.6, "value2": null, "unit": "°C",
                          "method": "rectal", "eventTime": "2026-10-24T15:01:00Z", "coolingPhase": "before", "sourceKind": "manual",
                          "device": null, "recordedBy": "crew", "note": null }
POST /care-events       { "requestId", "baseRevision", "category": "cooling", "action": "…", "startedAt": "…", "endedAt": null, "note": null, "recordedBy": "crew" }
POST /timeline-events   { "requestId", "baseRevision", "kind": "discovery", "time": "2026-10-24T14:43:00Z", "certainty": "reported", "note": "Per friend" }
POST /evaluations       { "requestId", "baseRevision" }  → full incident with feedback[] (each carries `revision`)
POST /feedback/:id/resolutions { "requestId", "baseRevision", "action": "clarify|dismiss|defer", "clarificationText"? }
                          dismiss uses clarificationText as the optional reason
GET  /handoff-draft     { "revision", "sections": [{ "id", "title", "items": [{ "text", "sourceIds", "note" }] }], "sourceIds", "uncertainties": [{ "label", "state": "unknown|not_documented|not_obtained|unresolved", "detail" }] }
POST /audio/transcriptions  multipart: audio, requestId → { "transcript", "mode", "warnings" }
```

Incident additions the UI reads: `observations[]` (`status: active|clarified`, `inputMode`, `sourceId`), `measurements[]`, `careEvents[]`, `timelineEvents[]` (kinds incl. `activityStart`, `deviceFall`, `discovery`, `collapse`), `feedback[]` (logical shape + `revision`, `mode`, `status`, `resolution`), `knowledgeReferences[]`, `observationCorrections[]`, `handoffs[].draft?`, `patient.context?`, source `type` adds `crew` and `reference`. Errors: 404 `{ "error": "Unknown endpoint" }`, 501 or 503 = unavailable; 409 = conflict/stale. Mutations return the full incident. If canonical names differ, only `boundary.ts`/`http.ts`/`legacy.ts` need changes.

Dev-adapter semantics worth matching: evaluation does not bump revision; clarify bumps it (new observation + correction, original kept as `clarified`); dismiss/defer do not; late evaluation for an older revision is rejected (409).

## Shared files changed

- `apps/web/package.json` + `package-lock.json`: added `zod@^4.6.7` to `@scenebrief/web` (same version the contracts package already uses; installed with `npm install -w`, lockfile not hand-edited).
- `apps/web/src/main.tsx`, `style.css` (shell, owned by this scope); removed `apps/web/src/api.ts` and `types.ts` (replaced by `platform/`).
- No changes to `apps/api`, `packages/*`, CI, or root config.

## Checks run (this session)

- `npm run check` → typecheck clean, 9 files / 67 tests pass, web build OK.
- Tests: `platform/{dev,http,draft,time}.test.ts` (adapter idempotency, revision conflicts, late evaluation, assistant off, resolutions, approval versions, http unavailable/compat/network mapping, legacy normalization against the real API store, pre/post-cooling and unknown/not-documented/not-obtained draft states), `features/er/HandoffDocument.test.tsx`, `features/paramedic/components/RecordPanel.test.tsx`, `features/paramedic/Workspace.test.tsx`.
- Browser (Playwright driving installed Chrome, fake mic device): full dev-adapter scenario at 360, 390, 1280 px (360 with reduced motion) — no horizontal overflow, no visible control < 44 px, no page errors; real recording → stop → transcription unavailable message; denied permission message; clarify/dismiss/defer states; stale tag after new info; review confirmation clears on change; approval → ER shows before/after cooling. Platform-API mode at 1280 px: note saved via `/transcripts` (verified in API), measurement and evaluation show "unavailable", stale approval 409 shown, then approval succeeded; ER print media hides shell controls.
- Not verified: real transcription (no provider), screen readers, Safari/Firefox MediaRecorder formats, speech synthesis audio output (headless).

## Kiro work

Spec rewritten for the EHS scope before implementation; tasks tracked in `tasks.md`. Kiro sub-agents built the ER view/export, the platform test suite, and the status/record panels in parallel from written briefs; outputs were reviewed and integrated in this session. The existing `.kiro/hooks/scenario-check.mjs` watches API/contracts paths only, not `apps/web`.

## Known limitations / blockers

- Live audio needs the assistant service's `/transcribe` and the platform's forwarding route plus provider credentials (server-side).
- Measurements/care/key times/evaluations persist only in the dev adapter until the platform routes land.
- Dev adapter: per-browser localStorage; cross-tab writes are not locked.
- Reviewer name is fixed ("Crew (demo)"); there is no authentication.
- Screenshots: `docs/handoffs/emt-website-screenshots/` (actual implementation, dev adapter + platform ER view).
