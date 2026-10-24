# incident-state-and-replay

Owner: Member 3 · Paths: `apps/api/`, `packages/contracts/`, `packages/fixtures/`

Maintain consistent incident state, correction provenance, immutable reviews, and repeatable replay tools.

## Implemented in scaffold

In-memory `IncidentStore`, Express API per `docs/api-contract.md`, serialized mutations, idempotent transcripts, stale-review rejection, reset, synthetic fixture.

## Acceptance

1. Every endpoint SHALL validate input with the schemas in `@scenebrief/contracts` and return a full `Incident` or `{ error }` with the documented status (400/403/404/409/500).
2. `revision` SHALL increment only on content changes (transcripts). Sharing and matching SHALL NOT change it, so a reviewed handoff is not falsely stale.
3. A correction SHALL mark the original claim `superseded`, keep its value and sources, add the replacement with a new ID, and record a `Correction` linking both.
4. Every `claim.sourceIds` entry SHALL reference an existing source.
5. The `collapseTime` claim SHALL remain `unknown`/`null` through the demo clarification.
6. Reviewing a non-current revision SHALL return 409; re-reviewing the current revision SHALL return the existing version unchanged. Earlier handoff versions SHALL never change.
7. A reused `requestId` with the same text SHALL return the current state without duplication; with different text, 409.
8. Fixture timestamps SHALL be UTC ISO 8601 consistent with `docs/user-journey.md` (EDT, UTC-4).
9. Persistence or replay tools, when added, SHALL reproduce the same incident from the same inputs and keep the reset endpoint working.

## Out of scope / future

Authentication, access control, consent enforcement, durable storage, MCP replay tools, real device or dispatch ingestion.
