# SceneBrief

A synthetic emergency-care demo: patient setup → paramedic capture and clarification → reviewed ER handoff.

## Start locally

Use Node 22.12+ (or Node 24/26) and npm. `.nvmrc` selects Node 22.

```bash
npm ci
npm run dev
```

Open http://127.0.0.1:5173. The API runs at http://127.0.0.1:3001; Vite proxies `/api`. No API keys or environment file are required.

1. Open **Patient** and enable fictional sharing.
2. Open **Paramedic**, confirm `patient-demo-01`, and record the preloaded initial account.
3. Inspect the source evidence, click **Load clarification**, then **Record account**.
4. Verify discovery time appears while collapse time stays unknown.
5. Review and share the handoff.
6. Open **ER handoff** in a second tab at http://127.0.0.1:5173/#er. It polls every two seconds.
7. **Reset demo** restarts the shared incident for all views.

## Workspace

| Path | Responsibility | Owner |
| --- | --- | --- |
| `apps/web/src/features/paramedic` | Capture, evidence, clarification, handoff review | Member 1 |
| `packages/ai` | Extraction/transcription interfaces and handoff draft adapter | Member 2 |
| `apps/api`, `packages/contracts`, `packages/fixtures` | State, API, schemas, synthetic fixtures | Member 3 |
| `apps/web/src/features/patient`, `apps/web/src/features/er` | Patient and receiving views | Member 4 |
| `apps/web/src/main.tsx`, `style.css`, `docs` | Integration shell, visual system, demo | Member 4, coordinated |

This npm workspace consumes shared TypeScript source directly through Vite/tsx. Internal packages are not published. The build produces the web bundle; the API currently runs with tsx for development.

## Checks

```bash
npm run typecheck
npm test
npm run build
# All three:
npm run check
```

CI runs the same checks. Tests cover unknown collapse time, correction provenance, retries, stale reviews, immutable handoff versions, and the complete HTTP flow.

## What is implemented

- Three connected UI views and shared runtime schemas.
- In-memory synthetic incident, explicit sharing/matching steps, source records, corrections, reviewed handoff versions.
- Deterministic **scripted** extraction for the exact demo clarification. Other text is retained as a reported account.
- HTTP validation, duplicate-request handling, serialized mutations, stale-review rejection.

## What is not implemented

Microphone transcription, camera OCR, QR scanning, model-backed inference, clinical protocols, RapidSOS/HealthKit/WHOOP/monitor integration, production access controls, persistent storage, and MCP replay tools. These are explicit workstream extension points. The current adapter is not medical reasoning or a clinical product.

This API is local-only, unauthenticated, and exposes synthetic data. The sharing toggle demonstrates a UX state, not production authorization. Do not deploy it publicly or enter real patient information. Restarting the API loses all records.

## Team and product documents

- [Team workflow and first tasks](docs/team-workflow.md)
- [API contract](docs/api-contract.md)
- [User journey](docs/user-journey.md)
- [Demo build plan](docs/demo-build-plan.md)
- [Kiro steering](.kiro/steering/project.md)
- [Per-member Kiro kickoff prompts](docs/kickoff-prompts/)
- [Kiro initialization review](docs/kiro-initialization.md)

Each workstream has starter requirements, design, and tasks under `.kiro/specs/`. MCP tools remain a Member 3 follow-up; the API tests already provide a reproducible incident replay.
