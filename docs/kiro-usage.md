# How we used Kiro

Kiro (Kiro CLI, `kiro-cli chat`) was **development tooling**: it planned, wrote, reviewed and tested the code. It is not part of the product and not the runtime clinical assistant (that is `apps/assistant` / `packages/ai`).

Everything below points to an artifact in this repo or a check that was run. Where something wasn't verified, it says so.

## 1. Project context Kiro reads

| Artifact | What it does |
|---|---|
| `.kiro/steering/project.md` (`inclusion: always`) | Loaded into every Kiro session in this repo: core loop, evidence boundaries (device data never proves collapse/onset/diagnosis), owned paths, "Kiro is not the runtime assistant" |
| `AGENTS.md` | Repo rules for any agent: run `npm run check`, no secrets/real patient data, no public deploy |
| `docs/kickoff-prompts/01–03*.md` | The per-workstream kickoff prompts each member pasted into Kiro (core platform, correction assistant, EMT website) |

## 2. Specs (`.kiro/specs/`)

One spec per workstream, each with `requirements.md` (numbered acceptance criteria, EARS-style "SHALL"), `design.md` and `tasks.md`. Specs were updated before each implementation pass, and tasks are ticked only when checked.

| Spec | Workstream | Tasks done |
|---|---|---|
| `incident-state-and-replay` | Core platform (`apps/api`, `packages/contracts`, `packages/fixtures`) | 13 / 16 |
| `evidence-extraction-and-handoff` | Correction assistant (`apps/assistant`, `packages/ai`) | 17 / 21 |
| `paramedic-capture-and-clarification` | EMT website (R1–R11; R11 = design integration) | 23 / 23 |
| `patient-enrollment-and-er-receiving` | Patient companion + ER receiving view (AC 10–15 added for the companion) | see file |

## 3. Workspace agent and hook

- `.kiro/agents/scenebrief.json` — workspace agent `scenebrief` that loads the steering and contract docs as resources and registers a **`postToolUse` hook** on the `write` tool group.
- `.kiro/hooks/scenario-check.mjs` — reads the hook event from stdin. If the edited file is under `apps/api/src`, `apps/assistant/src`, `packages/ai/src`, `packages/contracts/src` or `packages/fixtures/src`, it runs the scenario tests (`vitest run apps/api/src`, plus the assistant suites for assistant/AI changes). Otherwise it does nothing. A failure exits 1 and shows as a warning (post-tool hooks can't block).
- Use it with `kiro-cli chat --agent scenebrief`. The default agent does **not** run the hook.

Verified on main (2026-10-24): `kiro-cli agent validate --path .kiro/agents/scenebrief.json` → exit 0. A synthetic event for `apps/api/src/store.ts` ran the tests and passed (exit 0); one for `apps/web/src/main.tsx` was skipped (exit 0). The initial review also confirmed a deliberately broken extraction made it exit 1 (`docs/kiro-initialization.md`). **Not verified:** the hook firing inside a live `--agent scenebrief` chat — the build sessions used the default agent and ran tests explicitly instead.

## 4. Kiro crew (parallel subagents)

Kiro's `subagent` tool (a.k.a. **agent crew**) runs several agent sessions in parallel, each with a written brief and owned files, and returns their summaries to the lead session, which integrates and reviews them. It was used in the EMT website workstream (session log on Justin's machine):

| Crew run | Stages (all `kiro_default`, run in parallel) | Lead session then |
|---|---|---|
| EMT website build | `er-view` (receiving view + printable handoff document), `platform-tests` (adapter tests), `record-status` (record/status panel) | Wrote the platform adapters, capture state machine and shell; integrated; ran `npm run check` |
| Trauma Llama design integration | `summary-column` (patient/incident summary, phone vitals strip, patient match), `care-column` (care & reassessment, handoff card), `review-print` (crew review + print view) | Built observation/feedback cards and layout; integrated; browser-tested at 1280/390 px |

Each brief named the files the stage owned (so stages never edited the same file), the exact props and copy, and the tests to run before reporting. The lead session reviewed every stage's output instead of trusting the summary.

Not used by crew: the contract migration and the patient companion were written in a single lead session (tightly coupled changes across the adapter, components and tests).

## 5. Other Kiro features used

- **Worktrees per workstream** (`.scenebrief-worktrees/…`) so members' Kiro sessions never shared a checkout; ports were separated (`SCENEBRIEF_API_PORT`, alternate Vite ports) so they never killed each other's servers.
- **Todo list / planning** for multi-step work; **introspect** to check Kiro's own hook and crew semantics before configuring them.
- **Browser verification** driven from Kiro with Playwright + installed Chrome against the real API (EMT journey 14/14; patient companion 64/64). Scripts were kept outside the repo; results are recorded in the handoffs.
- **GitHub CLI** from Kiro for draft PRs and PR bodies. Kiro never merged without an explicit request.

## 6. Where the details are

- Per-workstream Kiro work and checks: `docs/handoffs/core-platform.md`, `docs/handoffs/ehs-assistant.md`, `docs/handoffs/emt-website.md`, `docs/handoffs/patient-companion.md`.
- First Kiro session (scaffold review, hook setup, spec rewrite): `docs/kiro-initialization.md`.

## Limits

- Not set up: a Kiro MCP replay server (`reset_demo`, `inject_statement`, …) proposed in `docs/demo-build-plan.md`. Scenario replay is covered by the API tests and the hook instead.
- Crew stages were checked by the lead session and the test suite. The clinical statements and references still need qualified review; passing AI-written tests do not establish clinical correctness.
