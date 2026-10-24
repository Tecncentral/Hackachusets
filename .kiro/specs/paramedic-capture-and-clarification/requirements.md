# paramedic-capture-and-clarification — EMT website (EHS scope, "Trauma Llama" display name)

Owner: EMT website session · Branch `feat/emt-website-ehs` · Paths: `apps/web/**`
Supersedes the earlier video-first paramedic requirements. Clinical evidence boundaries in AGENTS.md still apply.

Scenario: a person found confused after strenuous activity in hot conditions; suspected exertional heat stroke (EHS) is the clinical concern, never a diagnosis established by the app or by wearables.

## Requirements (EARS)

### R1 Incident workspace
1. The website SHALL present one incident workspace containing: patient/context summary, current-status summary, observation capture, assistant feedback, the record (measurements, care, timeline, evidence), and handoff review.
2. The current-status summary SHALL always show latest mental status, latest clinical temperature with method/site, time and cooling phase, and key unknowns. Missing values SHALL render as "Not documented", never as normal.
3. The workspace SHALL show one primary next action for the current task while keeping capture and handoff access available.
4. Detailed evidence, wearable background, and the extended timeline SHALL use progressive disclosure.
5. WHEN no wearable data is available THEN the workspace SHALL say so and all other functions SHALL work.

6. Patient identification SHALL NOT gate documentation: capture, feedback, care entry, and handoff SHALL work for an unidentified patient. Confirming the match SHALL only add patient-linked context (profile, wearable records and their derived events), which SHALL stay hidden until then.

### R2 Observations and structured entries
1. The EMT SHALL be able to save free-text observations with an optional category and observed time; saved items SHALL come back from the platform with source attribution and capture time.
2. The EMT SHALL be able to enter measurements (temperature, heart rate, BP, respiratory rate, SpO₂, glucose) with value, unit, event time, method/site (temperature), device/observer, and cooling phase (before/during/after/unknown). A measurement MAY be recorded as "not obtained" with a reason.
3. The EMT SHALL be able to enter care events (action, category, start/stop time, notes) and key times (discovery, collapse, symptom onset, last known well, call, arrival, transport) with certainty (recorded/reported/estimated/unknown).
4. Forms SHALL NOT pre-fill clinical findings or default unknowns to normal. Manual entries SHALL be labeled as manually entered (no monitor connection implied).
5. Every mutation SHALL send a `requestId` and the `baseRevision` displayed; a retry of the same submission SHALL reuse its `requestId`. Pending and error states SHALL be shown; success SHALL only be shown when the platform returns the saved record.

### R3 Voice capture
1. Push-to-talk SHALL use `getUserMedia` + `MediaRecorder`, showing requesting-permission, recording (elapsed time), stop, cancel, uploading/transcribing, and transcript-review states.
2. The transcript SHALL be editable and SHALL only become an observation after an explicit "Save observation".
3. Denied permission, missing device, unsupported recorder/format, oversize/too-long recordings, and transcription unavailable/failure SHALL each show an explicit message and leave text entry usable.
4. Any "Load example transcript" control SHALL be visibly distinct from audio capture and label the text as an example, not a recording.

### R4 Assistant feedback
1. The EMT SHALL be able to request an evaluation of the current revision. Each feedback item SHALL display kind, message, the original statement(s), patient evidence sources, knowledge references (title, URL, version, passage, review status), and the suggested question.
2. WHEN the incident revision is newer than the evaluated revision THEN open feedback SHALL be labeled stale with an option to re-check.
3. The EMT SHALL be able to clarify (with text), dismiss, or defer each item; each SHALL show pending, success, and error states. No assistant output SHALL change the record without an EMT action.
4. WHEN the assistant is unavailable THEN the workspace SHALL say so and capture, record, and handoff SHALL keep working.

### R5 Spoken feedback
1. WHERE `speechSynthesis` is supported, each feedback item SHALL have a visible Play control, and the workspace a Stop and Mute control; the text is always shown.
2. Speech SHALL never auto-play and SHALL be cancelled before microphone recording starts.

### R6 Corrections
1. After a clarification the earlier statement SHALL remain visible, marked as clarified, and linked to its clarification; a "what changed" summary SHALL appear.
2. Discovery and collapse times SHALL be distinct. No control SHALL set collapse time from discovery time or a device fall event.

### R7 Care and reassessment
1. Measurements SHALL be shown chronologically with initial and later readings together and cooling history interleaved, so pre- and post-cooling values are distinguishable.
2. A post-cooling reading SHALL NOT be displayed as the initial reading.

### R8 Handoff
1. The full draft SHALL be visible before approval, including sections, source links, and uncertainties; "unknown", "not documented", and "not obtained/performed" SHALL be distinct.
2. Approval SHALL send the displayed revision. A stale rejection SHALL show an error and the refreshed draft and require a fresh review.
3. Reviewed handoffs SHALL be printable and exportable (HTML download) without losing uncertainty or source attribution, and visible in a receiving (ER) view with amendment status.

### R9 Integration
1. All network access SHALL go through one frontend adapter (`apps/web/src/platform`). Provider secrets SHALL never reach the browser.
2. WHEN a platform endpoint is unavailable THEN the adapter SHALL raise an explicit "unavailable" error; it SHALL NOT fake success. A development adapter MAY implement the same shape in-browser only when explicitly selected and SHALL be labeled on every screen.

### R10 Accessibility and quality
Phone (≥360 px) and desktop layouts, keyboard operation with visible focus, ≥44 px targets, readable contrast, no text overflow, reduced-motion support, and calm professional language that does not shame the EMT or witness.

### R11 Visual design integration (design handoff, 2026-10-24)
1. Desktop: header with wordmark, synthetic label and live save status (`role=status`); three wrapping columns (summary · capture + observations needing attention · care & reassessment + ER handoff card); review view replaces the body.
2. Phone (≤720 px): vitals strip and a fixed 3-button bottom bar (Capture · Care & vitals · Handoff) with `aria-current`, the only workspace navigation.
3. Status vocabulary: Unknown (dashed), Not documented, Not performed (measurement status `not_obtained`), Not yet measured; never colour alone.
4. Feedback sits under its observation; stale feedback shows both revisions and hides Clarify/Defer/Dismiss until re-checked; clarified statements show "Original statement — kept in record" with the saved clarification.
5. Readings show Initial/Latest with before/after cooling labels (crew entry, or derived from documented cooling times and labeled as such).
6. Review: approval requires the review checkbox; approval failure, version conflict, and changed-after-approval are distinct; print shows a DRAFT or CREW APPROVED banner, Unresolved box, sources, signature lines, and no UI chrome.

## Out of scope
Diagnosis, treatment recommendations, protocol dosing/thresholds, production auth/EHR/wearable OAuth, camera OCR, server TTS, deployment, video production.
