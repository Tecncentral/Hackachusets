# Tasks

Earlier scaffold tasks (kept):

- [x] Revision does not change on sharing/matching; regression test added.
- [x] Test that corrections keep original text and both sources.
- [x] Run `npm ci` and `npm run check` on base `2f622d4` (9 tests pass).

EHS core platform (this session):

- [x] 1. Contracts: record, assistant, handoff, incident, request schemas and integrity check (Req 1–3, 7).
- [x] 2. Fixtures: `ehs-runner` and `ehs-runner-no-wearable`; mock assistant examples with verified NATA passages (Req 14).
- [x] 3. Store: atomic mutations, idempotency, revision rules, append routes, corrections (Req 5–7).
- [x] 4. Assistant gateway: mock/unavailable/http, timeout, validation, stale handling (Req 8, 10).
- [x] 5. Resolutions: clarify/dismiss/defer (Req 9).
- [x] 6. Handoff builder, draft route, versioned review with amendments, printable HTML (Req 4, 11, 12).
- [x] 7. HTTP routes; legacy routes still pass existing tests (Req 13).
- [x] 8. Focused tests incl. the shared acceptance scenario over HTTP (`ehs.test.ts`, `acceptance.test.ts`).
- [x] 9. `docs/core-api-contract.md`, generated samples in `docs/samples/`, `docs/handoffs/core-platform.md`.
- [x] 10. `npm run check`, curl smoke test on port 3101, local commit.

Deferred:

- [ ] Repository interface with in-memory default.
- [ ] Register `.kiro/hooks/scenario-check.mjs` as a Kiro hook (currently has no hook definition).
- [ ] Web paramedic page migration from `/transcripts` to `/observations` (website workstream).
