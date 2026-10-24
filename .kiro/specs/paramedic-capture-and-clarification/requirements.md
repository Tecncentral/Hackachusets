# paramedic-capture-and-clarification

Owner: Member 1 · Paths: `apps/web/src/features/paramedic/`

Capture short observations, inspect source evidence, and record corrections without erasing uncertainty.

## Implemented in scaffold

Typed transcript capture, patient-association step, clarification card, claim and source lists, review button sending the inspected `revision`.

## Acceptance

1. WHEN sharing is off, the paramedic view SHALL disable patient confirmation and explain why; it SHALL NOT call `/transcripts` before a confirmed match.
2. WHEN the initial account is recorded, the clarification card SHALL show the workout (09:05), device fall (10:42), and dispatch (10:44) sources with their labels, and ask whether the collapse was witnessed.
3. WHEN the clarification is recorded, the view SHALL show discovery time ≈10:43 with its voice source, the original account as `superseded`, and collapse time as `Unknown`.
4. The paramedic SHALL be able to leave the timing unresolved; no button may set collapse time from discovery time or the device fall.
5. Every transcript submission SHALL use a fresh `requestId`; retries of the same submission SHALL reuse it.
6. Review SHALL send the revision currently displayed. A 409 SHALL show the error and the latest draft, not silently re-submit.
7. Event time and capture time SHALL be displayed separately for each source; `null` event time renders as "unknown".
8. Voice and camera controls, when added, SHALL be labeled as such and feed the same `/transcripts` endpoint; typed input SHALL remain available.

## Out of scope / future

Microphone transcription, camera OCR, QR scanning, agency protocol content.
