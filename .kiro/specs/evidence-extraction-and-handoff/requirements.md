# evidence-extraction-and-handoff (revised: EHS correction assistant)

Owner: Member 2 · Paths: `packages/ai/`, `apps/assistant/`

Assess newly recorded EMT observations against the patient record and a small, sourced
EHS knowledge set. Propose concise, respectful, source-backed clarifications and support
an audio-in / transcript-out path. The assistant NEVER mutates incident state, diagnoses
autonomously, or presents itself as a qualified clinician.

This revision supersedes the original scripted-extraction scope while preserving its
clinical-evidence boundaries. The scaffold `demoAdapter` is retained unchanged so the
existing API/demo keeps working.

## Implemented in this revision

- `packages/ai/src/knowledge.ts`: versioned EHS knowledge registry (ID, title, URL,
  publisher, date, passage, locator, applicability, reviewStatus, verified flag) plus
  clinical rules, each marked `requires-clinical-review`.
- `packages/ai/src/evaluate.ts`: deterministic evaluator — a factual-reconciliation pass
  and a clinical-inference pass. Rules-only, no network, no key.
- `packages/ai/src/hybrid.ts`: optional model layer that may rephrase prose only;
  validated, with deterministic fallback.
- `packages/ai/src/transcribe.ts`: audio adapter with live/fixture/unavailable modes,
  server-side key only.
- `apps/assistant/`: optional Express service exposing `/health`, `/evaluate`, `/transcribe`.

## Acceptance

1. `/evaluate` SHALL return feedback items matching the shared shape
   `{ id, kind, message, suggestedQuestion, observationIds, evidenceSourceIds,
   knowledgeReferenceIds, spokenSummary }` and echo the evaluated `revision`.
2. Only IDs that exist (in the request or the registry) SHALL be referenced.
3. "sweating rules out heat stroke" and paraphrases SHALL be flagged
   (`unsupported_inference`); plain "patient is sweating" SHALL NOT be flagged.
4. Skin/wearable temperature asserted as core temperature SHALL be flagged and a
   clinical core measurement (method + time) requested; no core temp is fabricated.
5. A wearable fall/pace event asserted as collapse time SHALL be flagged; a hedged
   version SHALL soften to `missing_context`.
6. A post-cooling temperature with no recorded pre-cooling temperature SHALL prompt for
   the pre-cooling value; it SHALL NOT reconstruct it.
7. No wearable rhythm alert used to exclude a cardiac cause SHALL be flagged.
8. The assistant SHALL NOT invent vitals, sources, treatment, or a diagnosis, and SHALL
   ignore instructions embedded in observation text ("ignore your rules").
9. Model output, if used, SHALL be re-validated; on failure/timeout/missing key the
   deterministic text and a warning SHALL be returned.
10. `/transcribe` SHALL return an explicit `unavailable` state with no provider; a fixture
    transcript SHALL be labeled `fixture`; a live result SHALL be `live`. Text evaluation
    SHALL work regardless.
11. Provider keys SHALL be read server-side from env vars only and never shipped to
    `apps/web`; availability checks SHALL NOT expose the secret value.
12. Consensus/position documents SHALL be labeled background evidence, not local protocol;
    clinical rules SHALL be marked as requiring qualified review.

## Source verification status

- VERIFIED via NCBI E-utilities (citation + passage): ACSM 2023 consensus (PMID 37036463);
  NATA 2015 position statement (PMID 26381473 / PMC4639891).
- NOT machine-verified on the build host (HTTP 403 / WAF, no JS browser available):
  CDC Yellow Book heat/cold page; Massachusetts EMS statewide protocols. Recorded with
  `reviewStatus: "unverified-url"`, `verified: false`; a human must confirm the passages.

## Out of scope / future

Live model wiring, live transcription provider wiring, OCR, server TTS, production
protocol applicability, persistent storage. Canonical schema changes go through Member 3.
