# Handoff — EMT website (EHS) · display name "Trauma Llama"

- Branch: `feat/emt-website-ehs` · Worktree: `.scenebrief-worktrees/scenebrief-emt-website`
- Base: `origin/main` @ `22eebdf` (core platform, PR #5), merged in `e9fd1d0`; the web app was then migrated to the canonical contracts (see "Canonical contract migration").
- PR (draft): https://github.com/Tecncentral/Hackachusets/pull/3
- Superseded work: `feat/paramedic-capture` @ `5fe4f77` (local checkpoint, not pushed).
- Spec: `.kiro/specs/paramedic-capture-and-clarification/` (R1–R11; R11 = design integration)
- Design reference: `/Users/justin/Desktop/Projects/hackachusetts/project/*.dc.html` (outside the repo; translated to React, no prototype runtime or demo data copied)

Only user-facing strings were renamed to Trauma Llama (header, document title, print/export). Packages, folders, schemas and the repo keep the SceneBrief names.

## Run

```bash
npm ci
npm run dev                      # API :3001, web :5173
# Platform API (default):          http://127.0.0.1:5173/#paramedic
# Development adapter (labeled):   http://127.0.0.1:5173/?adapter=dev#paramedic
# Receiving view: …#er · Patient sharing toggle: …#patient
# Second checkout beside a teammate's:
SCENEBRIEF_API_PORT=3101 npx tsx apps/api/src/server.ts
(cd apps/web && SCENEBRIEF_API_PORT=3101 SCENEBRIEF_WEB_PORT=5273 npx vite --host 127.0.0.1)
```

## Canonical contract migration (after merging main @ 22eebdf)

- `platform/boundary.ts` now only re-exports `@scenebrief/contracts` types and the canonical request inputs. The website's own record schemas (observation/measurement/care/timeline/feedback/draft) are gone, as are `legacy.ts` (normalizer for the old scaffold), `draft.ts` (website handoff grouping) and `devAssistant.ts` (website feedback stub).
- `http.ts` validates every response with `IncidentSchema` / `HandoffDraftSchema`. A response that does not match the contract is an error, not data. No compatibility fallbacks remain (`/transcripts` fallback removed: the platform now has `/observations`). Adds `/environment-readings`, `GET /api/health` and `POST /api/demo/assistant`.
- `dev.ts` runs the platform's own `IncidentStore` in the tab (Vite aliases `node:crypto` to `crypto-shim.ts`). Same validation, idempotency, revision rules, visibility, deterministic handoff and labeled mock assistant as the API. Memory only; reload resets.
- `scope.ts` reuses `apps/api/src/visibility.ts`, so the workspace hides exactly what the handoff and assistant exclude before matching.
- The handoff draft always comes from `GET /handoff-draft`; preview, approval and the receiving view render the same canonical `sections` / `uncertainties` / `sourceIds` with one `HandoffDocument`.
- UI wording lives in `platform/labels.ts` (labels only; no clinical rules). Canonical values used throughout: `body_temperature` + `site`, `skin_temperature` (never shown as clinical temperature), `before_cooling…`, `neurological`, `reportedBy`, `transcribed`, `status: current|superseded`, `corrections`, `resolutions`, `evaluations`.
- Feedback states: platform `stale` (changed during evaluation) cannot be resolved and asks for a re-check; open/deferred feedback from an earlier revision stays resolvable and is labeled "Generated for revision N; the record is now at revision M".
- Evaluation outcomes come from the stored `Evaluation` (`completed / unavailable / failed / stale`). The "Assistant available" demo switch now works in both adapters through `POST /api/demo/assistant`.

## Approval binding (fix)

`platform/approval.ts`. Ticking "I reviewed…" stores the exact draft on screen.

- Approve and Retry send that stored draft. `approveReviewed` re-reads `GET /handoff-draft` first; if its content fingerprint (revision, patientMatched, sections, uncertainties, sourceIds) differs, nothing is sent and the crew is asked to review again.
- After the platform answers, the frozen version is compared with the reviewed draft. A mismatch is shown as an error, never as "approved".
- Any different draft arriving on screen (new revision, a patient match — which does not bump the revision — or a reset) clears the confirmation and withdraws Retry.
- "Crew approved" is shown only when a shared version has the same content as the current draft (`sharedVersionFor`), not merely the same revision.
- Retry after a lost response returns the existing version (platform idempotency on revision); no duplicate.

Remaining platform gap: `POST /handoffs` takes only `{ revision, reviewedBy }`, so a non-revision change landing between the pre-check and the POST is caught after the fact (mismatch error), not prevented. Proposal for the platform: accept an optional content hash or `patientMatched` in `ReviewRequest` and 409 on mismatch.

## Implemented vs. dependent

| Area | Status on the platform (main @ 22eebdf) |
|---|---|
| Unidentified documentation, measurements, care, key times, environment | Implemented on the platform and wired. Verified against the running API |
| Evaluation / clarify / defer / dismiss | Implemented; feedback from the platform's **mock** assistant (fixture replay, labeled "Mock assistant · fixture replay"). A real assistant needs `SCENEBRIEF_ASSISTANT_MODE=http` + workstream 02 service; not available in this session |
| Transcription | **Not on the platform** (`POST /audio/transcriptions` → 404 → "Transcription unavailable…"). No provider or credentials connected |
| "Not obtained" measurement | No canonical field. The form says to note it as an observation; no "Not performed" state is invented |
| Example transcripts | Saved as typed entries; the "example" origin is not stored (no field) |
| Reopen dismissed feedback | Platform: dismissal is final |

## Shared files changed

- `apps/web/package.json` + `package-lock.json`: workspace deps `@scenebrief/fixtures`, `@scenebrief/ai` (needed by the dev adapter's in-browser store). No external dependencies added.
- `apps/web/vite.config.ts`: `node:crypto` alias; ports from `SCENEBRIEF_API_PORT` / `SCENEBRIEF_WEB_PORT` (defaults unchanged).
- No changes to `apps/api`, `packages/*`, CI or root config.

## Checks run (integration repair)

- `npm run check` → typecheck clean, **13 files / 97 tests pass** (API suites unchanged), build OK (Vite chunk-size warning: the dev adapter bundles zod + store).
- New/updated web tests: http (error mapping, contract rejection, route shapes, assistant toggle, transcription unavailable), dev adapter (idempotency, append rules, matching gate, mock feedback, assistant unavailable, clarify/defer/dismiss, amendments, unmatched draft exclusion), approval binding (newer revision, match after review, retry after failure, lost response, newer draft during retry), and component rendering of canonical records.
- **Real platform** (API :3101 with mock assistant, web :5273, http adapter, Playwright + Chrome), 14/14:
  - Unidentified patient shown, no profile; witness example saved without matching; mock feedback attached.
  - Clarification stored as a crew observation; original superseded with a correction.
  - Rectal 41.2 °C before cooling → cold-water immersion 11:04–11:18 → 38.9 °C after cooling, shown with site and phase.
  - Assistant switched off: observation saved, evaluation recorded `unavailable`, message shown.
  - Review → another client adds an observation → confirmation cleared → review → v1 equals the platform draft.
  - Approval connection failure keeps the review and offers Retry; a newer draft then withdraws Retry and nothing is shared; retry of the same draft shares v2 (amendment) once; receiving view shows v2.
  - 390 px: no horizontal scroll; no console errors.
- Screenshots: `docs/handoffs/emt-website-screenshots/platform-*.png` (earlier `*.jpg` are from before the migration).
- Not verified: real transcription, an HTTP assistant service, screen readers, Safari/Firefox.

## Design elements not integrated (and why)

- Prototype controls bar: demo only. Its equivalent is the demo bar ("Assistant available").
- Design demo data (INC-DEMO-0412, 41.2 °C at 14:20, etc.): all data comes from the platform fixture and crew entries.
- Atkinson Hyperlegible fonts: named first in the font stack but not loaded (no font dependency); system-ui renders.
- "Reopen feedback": no platform action exists.
- Care-event types "Cooling started / Cooling ended": modeled as one cooling event with start/stop times, which the platform prompt asks for.
- One clinical reference "placeholder" panel: shown only when an item has no references; the mock assistant supplies NATA passages labeled not clinically reviewed.
- Working concern text ("Suspected exertional heat stroke — not established") is a scenario constant in `model.ts` until the platform provides a field.

## Kiro work

The spec was updated before each pass. Sub-agents built the summary column, care column/handoff card, and review/print view in parallel from written briefs. This session integrated and reviewed them, and wrote the platform adapters, capture state machine, observation/feedback cards, layout and shell. The `.kiro/hooks/scenario-check.mjs` hook watches API/contracts only, not `apps/web`.
