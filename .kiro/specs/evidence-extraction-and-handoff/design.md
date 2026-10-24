# Design (revised: EHS correction assistant)

## Shape of the solution

- `@scenebrief/ai` is a LIBRARY. The platform can import `evaluateRules` / `evaluateHybrid`
  / `transcribe` directly — no network hop — which matches the scaffold's in-process style.
- `apps/assistant` is an OPTIONAL thin HTTP wrapper (`/health`, `/evaluate`, `/transcribe`)
  for the case where a separate process is wanted. It owns no incident state; it evaluates
  the immutable snapshot passed in the request and returns proposals.

## Evaluation pipeline

1. Deterministic rule pass decides WHICH feedback exists, each item's `kind`, and every ID
   it references. Two independent passes:
   - factual reconciliation: statement vs. measurement/source record (e.g. post-cooling temp
     with no pre-cooling temp on file);
   - clinical inference: unsupported inferences against curated EHS rules (sweating-excludes,
     skin-is-core, device-is-onset, no-alert-excludes-cardiac).
2. Optional model pass (`evaluateHybrid`) may rephrase `message` / `suggestedQuestion` /
   `spokenSummary` ONLY. It cannot add/remove/reorder items, change kinds, or touch IDs.
   Output is re-validated with Zod; any failure/timeout/missing key -> deterministic text +
   a warning. `mode` is `rules-only` or `hybrid`.

## Matching strategy (paraphrase/negation robust)

- Text is normalized (lowercased, punctuation stripped) and matched against small, auditable
  cue vocabularies, combined with intent cues (exclusion, core-claim, onset-claim). This flags
  paraphrases ("sweaty, so not EHS") and negations without collapsing to one canned sentence.
- Hedges ("maybe", "about") downgrade a device-onset inference to `missing_context`.

## Safety

- Observation/transcript/photo text is DATA, never instructions. No feedback message asserts
  a diagnosis. Output is bounded (max items, de-duplicated). No arbitrary tool execution.
- Transcription keys are read server-side from env; availability checks never return the value.

## Knowledge registry

- Small, curated, versioned (`KNOWLEDGE_VERSION`). Each reference carries verification state.
  Consensus/position docs are `background-evidence`; the MA protocol is a candidate local
  protocol pending agency confirmation. Clinical rules are `requires-clinical-review`.

## Integration boundary

- Shapes live in `packages/ai/src/evaluate.types.ts` as the assistant's request/response seam.
  Any change to canonical incident state / `ClaimSchema` goes through Member 3; differences
  from the platform's final schema are documented in `docs/handoffs/ehs-assistant.md`, not
  resolved by inventing an incompatible interface.

## Tests

- `packages/ai/src/evaluate.test.ts`: human-readable EHS scenario set (acceptance checks,
  paraphrases, negations, injection resistance, hybrid structure preservation).
- `packages/ai/src/transcribe.test.ts`: unavailable/fixture/live/failure modes, secret hygiene.
- `apps/assistant/src/app.test.ts`: HTTP `/health` `/evaluate` `/transcribe`.
- The `.kiro` hook runs the api scenario suite always, and the ai+assistant suites when those
  change.
