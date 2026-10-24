# evidence-extraction-and-handoff

Owner: Member 2 · Paths: `packages/ai/`

Extract source-linked claims and draft a reviewable handoff; preserve a deterministic demo fallback.

## Implemented in scaffold

`demoAdapter`: scripted extraction that recognizes only the exact `DemoClarification` string (→ `discoveryTime`); all other text becomes an `account` claim. `draft()` renders non-superseded claims with source IDs.

## Acceptance

1. `extract()` SHALL return only fields in `ClaimSchema.field`. Output from any model SHALL be validated with a Zod schema before it reaches the store; invalid output falls back to an `account` claim with the raw text.
2. The adapter SHALL NOT produce `collapseTime` from a witness discovery statement, a device fall event, or a hedged statement ("maybe", "about", "I think"). Test: "Maybe he collapsed at 10:43" leaves collapse time unknown (existing store test).
3. The exact demo clarification SHALL continue to yield discovery ≈10:43 EDT with `clarifiesInitial: true`, with no network or API key.
4. `draft()` SHALL list every non-superseded claim with `[sources: …]`, render `null` values as "Unknown", state the correction count, and include the line that device events do not establish onset or downtime.
5. The adapter SHALL NOT mutate the incident, assign IDs, or choose source references; the API owns those.
6. Provider keys, if added, SHALL be read server-side from environment variables only and never shipped to `apps/web`.
7. Any model-backed path SHALL be labeled in the UI and docs as non-clinical and distinct from the scripted fallback.

## Out of scope / future

Audio transcription, OCR, model-backed inference, clinical reasoning.
