# Design

## Modules

| Path | Role |
| --- | --- |
| `packages/contracts/src/records.ts` | Record schemas: sources, claims, observations, measurements, care, timeline, context, environment, wearable |
| `packages/contracts/src/assistant.ts` | Assistant boundary: evaluate request/response, feedback item, knowledge reference |
| `packages/contracts/src/handoff.ts` | Handoff draft and reviewed snapshot schemas |
| `packages/contracts/src/incident.ts` | `Incident` aggregate, stored feedback/evaluation/resolution/correction |
| `packages/contracts/src/requests.ts` | HTTP request schemas (strict) |
| `packages/contracts/src/integrity.ts` | Referential-integrity check used by the store, fixtures and tests |
| `packages/fixtures/src/` | `ehs-runner` and `ehs-runner-no-wearable` fixtures; mock assistant examples |
| `apps/api/src/store.ts` | `IncidentStore`: serialized mutations on a cloned draft, idempotency, revisions |
| `apps/api/src/assistant.ts` | `AssistantGateway` + `mock` / `unavailable` / `http` clients |
| `apps/api/src/visibility.ts` | Hides profile/wearable data until the patient is matched |
| `apps/api/src/describe.ts` | Deterministic text for records (shared by sources and handoff) |
| `apps/api/src/handoff.ts` | Deterministic handoff builder, amendment diff, printable HTML |

## Key decisions

- **Atomic mutations.** Each mutation runs on a `structuredClone` draft, which is schema-parsed and integrity-checked before replacing state. A failure leaves state unchanged.
- **Serialization.** `transaction()` serializes mutations. Evaluation is split: phase 1 (validate, snapshot, record `pending`) and phase 2 (apply) are transactions; the assistant call between them runs outside the queue so capture is never blocked. A `generation` counter detects resets during an evaluation.
- **Idempotency.** One map `requestId → { route, fingerprint }` across all routes. Replay checks run before revision checks so a retried request succeeds.
- **Revision rule.** Appends tolerate a stale `baseRevision` (crew documentation must never be blocked) but reject one that is ahead. Edits to existing records and reviews require the current revision.
- **Feedback is not content.** Storing feedback does not bump revision, so feedback stays attached to the revision it evaluated. Assistant text never enters the handoff; only the EMT's clarification does.
- **Matching gate.** The legacy `/transcripts` route keeps its sharing/match gate. New capture routes and review do not require matching (an unidentified patient still needs a handoff); instead, profile and wearable data are excluded from the handoff and from evaluation snapshots until matched.
- **Mock assistant.** Exact-text replay of checked-in fixture examples, labeled `mode: "mock"`. It is a test double, not reasoning; the real assistant is workstream 02.
- **Handoff.** Pure function of the record. Timestamps render in America/New_York. Amendments carry a set-difference change summary against the previous version.
- **Storage.** In-memory only; restart loses state. A repository seam is deferred.
