# Design

- `IncidentStore.transaction()` serializes all mutations, including awaited adapter calls. New mutations must go through it.
- Contracts first: change `packages/contracts`, then API and tests, then notify consumers (Members 1, 2, 4) in the same PR or a backward-compatible sequence.
- Persistence: introduce a `Repository` interface behind `IncidentStore`; keep the in-memory implementation as default for tests and demo.
- Replay: drive the store with a recorded list of requests (the HTTP test is the current replay). MCP tools, if added, wrap the same store and are dev-only.
- Scenario tests in `apps/api/src/*.test.ts` are the source of truth for lifecycle invariants; the Kiro hook runs them on changes to `apps/api/src`, `packages/contracts`, `packages/fixtures`, or `packages/ai`.
