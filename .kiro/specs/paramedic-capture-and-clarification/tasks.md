# Tasks — EMT website

Reused from `feat/paramedic-capture` checkpoint 5fe4f77: `clock()`/source labels, source list, patient-association step, scoped CSS approach, real-store test states. Scripted-only components (fixed clarification card, scripted capture) are replaced.

- [x] 1. Spec updated for EHS website scope (this file, requirements, design)
- [x] 2. Boundary schemas + PlatformError (`platform/boundary.ts`)
- [x] 3. HTTP adapter with unavailable detection and `/transcripts` compatibility (R9)
- [x] 4. Development adapter + labeled evaluation stub; idempotency, revision checks, late-evaluation rejection (R9)
- [x] 5. Deterministic draft grouping: pre/post cooling, unknown vs not documented vs not obtained (R7, R8)
- [x] 6. Shell: one provider, adapter banner, views, polling (R9)
- [x] 7. Workspace: status summary, next-step bar, record with progressive disclosure (R1, R6, R7)
- [x] 8. Capture: note, measurement, care event, key time forms with pending/error/retry (R2)
- [x] 9. Voice: MediaRecorder push-to-talk, transcript review, error states, example transcript (R3)
- [x] 10. Feedback: evaluate, stale, clarify/dismiss/defer, references, speech controls (R4, R5)
- [x] 11. Handoff review + approve + stale handling; ER receiving view, print, HTML export (R8)
- [x] 12. Tests: adapters, draft, rendering of key states
- [x] 13. Browser check phone/desktop, keyboard, reduced motion; screenshots
- [x] 14. Handoff doc `docs/handoffs/emt-website.md`, `npm run check`, commit, push, draft PR
