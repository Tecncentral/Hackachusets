# Tasks (revised: EHS correction assistant)

- [x] Run `npm ci`, `npm run check`, confirm baseline green before editing (base 2f622d4).
- [x] Verify primary clinical sources; build a versioned knowledge registry with review status.
      (ACSM + NATA verified via NCBI E-utilities; CDC + MA recorded as unverified-url.)
- [x] Define `/evaluate` request/response + feedback Zod schemas (required vs. nullable).
- [x] Deterministic evaluator: factual-reconciliation pass + clinical-inference pass.
- [x] Key EHS cases: sweating-not-exclusionary, skin≠core, temp needs method/timing,
      post-cooling≠pre-cooling, device≠onset, no-alert≠cardiac-exclusion.
- [x] Paraphrase/negation handling; hedges soften to missing_context; de-duplication.
- [x] Optional hybrid model layer: rephrase prose only, re-validate, deterministic fallback.
- [x] Transcription adapter: live/fixture/unavailable modes, server-side key only, secret hygiene.
- [x] Optional `apps/assistant` service (`/health`, `/evaluate`, `/transcribe`) on port 3002.
- [x] Representative request/response fixtures for UI/platform integration.
- [x] Human-readable evaluation test set + transcription tests + service HTTP tests.
- [x] Extend the `.kiro` hook to cover ai/assistant changes.
- [x] Env-var docs without secrets; `.kiro` spec updated; `docs/handoffs/ehs-assistant.md`.
- [x] `npm run check` green (typecheck + 36 tests + web build).
- [ ] Reconcile the assistant request/response seam with the platform owner's final schema.
- [ ] Human verification of CDC + MA protocol passages; clinician review of clinical rules.
- [ ] Wire a live transcription provider and/or a validated language model (server-side).
