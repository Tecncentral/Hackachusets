# Team workflow

## Shared starting point

Merge the scaffold PR before individual feature branches, or branch from `setup/scenebrief-workspace` while the PR is under review. All four people run `npm ci`, `npm run check`, and the demo once before editing.

Use feature branches: `feat/paramedic-capture`, `feat/evidence-adapter`, `feat/incident-backend`, `feat/patient-er`. Keep PRs small and integrate daily. Rebase or merge the shared base before opening a PR; never force-push shared branches.

## Ownership and first tasks

| Member | Owned paths | First deliverable | Integration boundary |
| --- | --- | --- | --- |
| 1 | `apps/web/src/features/paramedic/` | Replace basic capture UI with polished mobile interaction; add transcript correction and explicit full-draft preview | Consume `ScreenProps` and shared API client; coordinate any new endpoint with 3 |
| 2 | `packages/ai/` | Add transcription adapter and structured extraction with schema validation and source-backed evaluation cases | Keep provider secrets server-side; retain a deterministic demo fallback; coordinate adapter changes with 3 |
| 3 | `apps/api/`, `packages/contracts/`, `packages/fixtures/` | Add persistence abstraction and replay MCP tools; strengthen evidence invariants | Own schema/API changes, publish changes before consumers update |
| 4 | Patient/ER feature folders, app shell, CSS, docs | Improve enrollment, code flow, readable handoff and source display; run full-flow rehearsals | Coordinate shell/style changes with 1; keep data access through the common API |

## Prevent integration conflicts

- Member 3 coordinates contracts and fixture changes. Include schema, API implementation, tests, and affected consumers in the same PR or agree on a backward-compatible sequence.
- Member 4 coordinates shared CSS and shell navigation. Prefer feature-local styles for parallel UI work.
- Announce dependency changes; use `npm install <package> -w <workspace>` from the repository root. Commit both package manifests and root lockfile. Never hand-edit the lockfile.
- Do not create separate mock APIs inside each screen. Use the backend fixture and reset endpoint.
- All mutations return the complete validated incident. API errors use `{ error: string }` and non-2xx status codes.
- Handle unknown, pending, failed, and stale states explicitly. No invented default vitals or auto-resolved clinical claims.

## Definition of ready to merge

`npm run check` passes. The core demo still works. New integrations are labeled accurately. The PR states changed contract fields, validation, and any limitations. At least one teammate reviews changes affecting shared contracts or patient identity handling.

## Demo integration milestones

1. Existing text flow remains working throughout all changes.
2. Voice feeds the same transcript endpoint; text remains available.
3. Camera adds source evidence without treating document contents as confirmed current history.
4. Reviewed handoff and amendment reach the receiving view.
5. Reset/replay works reliably and the scripted fallback is disclosed.
