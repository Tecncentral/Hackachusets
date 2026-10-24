# Kiro initialization review

Session date: 2026-10-24. Tool: Kiro CLI (`kiro-cli chat`), default agent.

## Starting state

Codex had already prepared the scaffold on `setup/scenebrief-workspace`. At the start of this session the branch had one commit (`065bd1f Initial commit`), a modified `README.md`, and these untracked paths: the npm workspace (`apps/`, `packages/`, root configs, lockfile), `AGENTS.md`, `docs/`, `.github/`, and `.kiro/specs` plus `.kiro/steering`. Kiro did not generate any of that. The four spec folders all held the same boilerplate.

## Files reviewed

`AGENTS.md`, `README.md`, `docs/team-workflow.md`, `docs/api-contract.md`, `docs/user-journey.md`, `.kiro/steering/project.md`, all 12 spec files, every workspace `package.json`, `tsconfig.json`, `vite.config.ts`, CI workflow, `.gitignore`, `packages/{contracts,fixtures,ai}/src/index.ts`, `apps/api/src/*`, and `apps/web/src/**`.

## Changes made by Kiro

| File | Change | Reason |
| --- | --- | --- |
| `apps/api/src/store.ts` | Sharing and matching no longer increment `revision` | The contract says content changes bump the revision. Before this fix, toggling sharing after a review made the ER view mark the reviewed handoff stale with no new content. |
| `apps/web/src/main.tsx` | Mutation sequence counter discards poll responses that started before a mutation | A 2 s poll in flight could overwrite a newer mutation result with old state. |
| `apps/api/src/store.test.ts` | Two tests: correction keeps the original text and both sources; sharing/match changes don't make a review stale | Regression coverage for the fix and the provenance requirement |
| `docs/api-contract.md` | Clarified which mutations bump `revision` | Matches the fix |
| `.kiro/specs/*/{requirements,design,tasks}.md` | Rewrote all 12 files with component-specific, testable acceptance criteria, design boundaries, and task lists. Each separates "implemented in scaffold" from "future" | Replaces the identical boilerplate |
| `.kiro/agents/scenebrief.json`, `.kiro/hooks/scenario-check.mjs` | New workspace agent with a `postToolUse` hook (see below) | Scenario checks on incident or extraction changes |
| `docs/user-journey.md` | Replaced trailing two-space hard breaks with `\` (19 lines; renders the same) | `git diff --check` failed |
| `.github/pull_request_template.md` | Removed the trailing blank line | `git diff --check` failed |
| `docs/kickoff-prompts/01–04*.md` | Byte-for-byte copies of the four per-member Kiro kickoff prompts from the parent planning folder (verified with `cmp`) | User asked for them to be committed |
| `docs/kiro-initialization.md` | This file | |

## Hook configuration

`.kiro/agents/scenebrief.json` defines a `postToolUse` hook with `matcher: "write"` (Kiro's write group, which covers the `write` and `code` tools). It runs `node .kiro/hooks/scenario-check.mjs`. The script reads the hook event JSON from stdin. If the edited path is under `apps/api/src`, `packages/ai/src`, `packages/contracts/src`, or `packages/fixtures/src`, it runs `npx vitest run apps/api/src`. Otherwise it exits 0 without running anything. A test failure exits 1, which Kiro shows as a warning (post-tool hooks cannot block).

Verification actually performed:

- `kiro-cli agent validate --path .kiro/agents/scenebrief.json` → exit 0.
- `kiro-cli agent list` shows `scenebrief` under Workspace.
- Synthetic hook events piped to the script:
  - `apps/api/src/store.ts` → tests ran, passed, exit 0
  - `README.md` → skipped, exit 0
  - `packages/ai/src/index.ts` via `file_path` → passed, exit 0
  - deliberately broke the adapter (`discoveryTime` → `collapseTime`) → 2 tests failed, exit 1; then restored the file

Not verified: the hook firing automatically inside a live Kiro chat session. That needs a session started with `kiro-cli chat --agent scenebrief`, which this session wasn't.

## Commands run and results

| Command | Result |
| --- | --- |
| `npm ci` | 150 packages, 0 vulnerabilities. npm warns that the `esbuild` and `fsevents` install scripts aren't covered by `allowScripts`. |
| `npm run check` (before changes) | Typecheck, 7 tests, and build all passed |
| `npm run check` (after changes) | Typecheck, 9 tests, and build all passed |
| `npm run dev`, then `curl` through the Vite proxy (`127.0.0.1:5173/api`) | Transcript before match → 403. Sharing → match → initial account. Retry with the same `requestId` didn't duplicate. Review v1 → clarification → re-review of rev 1 → 409. Review v2. Toggling sharing off/on and re-matching left v2 not stale. Final state: `collapseTime` null/`unknown`; `discoveryTime` "Approximately 10:43 EDT…"; original account `superseded` with its source text intact; the correction links both claims; every `sourceId` resolves; v1 text unchanged. |
| `git diff --check` (untracked files included via `git add -N`) | Failed at first (whitespace above). Exit 0 after the fixes. |

## Limitations and unverified behavior

- Browser UI interactions (clicks, rendering, two-tab ER polling) were not exercised. No browser automation was available, so the flow was verified over HTTP only.
- The hook hasn't been seen firing in a live Kiro session (see above).
- Extraction is scripted and recognizes only the exact demo clarification. It has no transcription, OCR, model inference, or clinical reasoning.
- The API is in-memory, unauthenticated, and local-only. Sharing/matching is a UX demo, not access control.
- Device data (workout, fall) is synthetic, and the integrations are unverified.
