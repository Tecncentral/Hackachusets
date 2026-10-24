# Handoff — EHS correction assistant (Member 2)

Branch: `feat/ehs-correction-assistant`
Base SHA: `2f622d4c419f43408428564029d427d88cb511ee` (origin/main, scaffold merged)
Owner scope: `packages/ai/`, new `apps/assistant/`

## What this delivers

An evidence-backed assistant that assesses newly recorded EMT observations against the
patient record and a small, sourced EHS knowledge set, and proposes concise, respectful
clarifications. It supports an audio-in / transcript-out path. It never mutates incident
state, never diagnoses autonomously, and never claims to be a qualified clinician.

The scaffold `demoAdapter` is retained unchanged, so the existing API and demo still work.

## Run commands

```bash
npm ci
npm run check        # typecheck + 36 tests + web build (all green)

# optional standalone assistant service (distinct port, does not touch api/web)
npm run dev -w @scenebrief/assistant   # http://127.0.0.1:3002
```

## API examples (assistant service)

```bash
# health + transcription availability
curl http://127.0.0.1:3002/health
# -> { "ok": true, "mode": "assistant", "transcription": { "available": false, "provider": null } }

# evaluate the "sweating rules out heat stroke" observation
curl -X POST http://127.0.0.1:3002/evaluate \
  -H 'Content-Type: application/json' \
  -d '{"incidentId":"runner-found-down","revision":2,
       "observations":[{"id":"o1","text":"He is sweating, so this cannot be heat stroke.","observedAt":null,"sourceIds":[]}]}'
# -> { incidentId, revision: 2, mode: "rules-only",
#      feedback: [{ kind:"unsupported_inference", spokenSummary:"Sweating alone does not rule out heat stroke.", knowledgeReferenceIds:[...], ... }],
#      warnings: [] }

# transcribe with no provider configured -> explicit unavailable (not a fabricated transcript)
curl -X POST http://127.0.0.1:3002/transcribe \
  -H 'Content-Type: audio/webm' --data-binary @clip.webm
# -> { transcript:"", mode:"unavailable", warnings:["Audio transcription is not configured. ..."] }
```

Platforms that prefer the in-process path import the library directly:

```ts
import { evaluateRules, evaluateHybrid, transcribe } from '@scenebrief/ai';
```

## Integration seam (vs. the shared logical contract)

Request/response shapes live in `packages/ai/src/evaluate.types.ts`. They follow the
kickoff contract. Exact notes for the platform owner (Member 3):

- `/evaluate` request implemented: `{ incidentId, revision, observations, measurements,
  sources, careEvents, protocolContext? }`. The kickoff listed `requestId, baseRevision`
  for the PLATFORM's `/api/.../evaluations` route (platform-owned); the assistant service
  itself is stateless and keys staleness off `revision`, which it echoes in the response.
- Response: `{ incidentId, revision, mode, feedback[], warnings[] }`. `mode` is
  `rules-only` or `hybrid` (the contract's generic `mode` field).
- `feedback` item matches the contract exactly:
  `{ id, kind, message, suggestedQuestion, observationIds, evidenceSourceIds,
  knowledgeReferenceIds, spokenSummary }`.
- `/transcribe` returns `{ transcript, mode, warnings }` where `mode ∈ live|fixture|unavailable`.
- Measurements preserve `beforeCooling: boolean|null` (null = unknown, distinct from false)
  and keep `value` as a string to avoid lossy numeric parsing of e.g. "102/64".

These are an integration seam, not a competing incident store. Canonical schema changes
belong to Member 3; this doc is the documented proposal for reconciliation.

## Implementation status

Implemented and tested:
- Versioned sourced knowledge registry + clinical rules (`knowledge.ts`).
- Deterministic evaluator — factual + clinical-inference passes (`evaluate.ts`).
- Optional hybrid model layer, prose-only, validated, fallback (`hybrid.ts`).
- Transcription adapter — live/fixture/unavailable, server-side key only (`transcribe.ts`).
- Optional assistant HTTP service (`apps/assistant/`).
- Fixtures (`fixtures.ts`); 36 passing tests; `.kiro` hook extended.

## Actual checks run

- `npm run check`: typecheck clean, 36/36 tests pass, web build succeeds.

## Clinical source verification (honest status)

- VERIFIED (citation + passage via NCBI E-utilities API):
  - ACSM 2023 Expert Consensus (PMID 37036463, DOI 10.1249/JSR.0000000000001058).
  - NATA 2015 Position Statement (PMID 26381473, DOI 10.4085/1062-6050-50.9.07, PMC4639891).
- NOT machine-verified on the build host (HTTP 403 / cookie-wall, no JS browser available):
  - CDC Yellow Book heat/cold page.
  - Massachusetts EMS statewide protocols (the candidate applicable LOCAL protocol).
  Both are recorded with `verified: false`, `reviewStatus: "unverified-url"`. A human must
  open them and confirm the exact passages before they back operational feedback.

## Dependencies

- `apps/assistant` adds no new third-party deps beyond `express` + `zod` (same versions as
  `apps/api`). Audio uses `express.raw`, so no multer. Root lockfile updated via
  `npm install` from the repo root.

## Known limitations

- No live language model and no live transcription provider are wired; both are optional and
  documented via env vars (`SCENEBRIEF_TRANSCRIBE_API_KEY`, `SCENEBRIEF_TRANSCRIBE_PROVIDER`).
  Live audio requires a server-side key and a provider implementation of `TranscriptionProvider`.
- Clinical rules require qualified clinician review and reconciliation with the crew's own
  agency protocol before any operational use. This is a synthetic demo, not a clinical product.
- The cue-based matcher is deliberately small and auditable; it will not catch every phrasing.
  It errs toward asking a clarifying question rather than asserting anything.
- The UI (Member 1/4) owns TTS playback, mute, and stop controls; the assistant only returns
  `spokenSummary` text for browser TTS.

## Next steps for integration

1. Member 3 reconciles the request/response seam with the published canonical schema.
2. Human verification of the CDC + MA protocol passages; clinician review of the rules.
3. Optional: wire a validated model (phrasing only) and a server-side transcription provider.
