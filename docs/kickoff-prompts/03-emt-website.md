# Kiro kickoff — EMT website: capture, clarification, and handoff

Branch: `feat/emt-website-ehs`

## Updated scope — read first

This supersedes the previous four-person, video-first prompts. We are now building three working core components, all focused on **suspected exertional heat stroke (EHS)**. Video production comes later. Do not spend this session on storyboards, acted scenes, video timings, or marketing pages.

SceneBrief is an EMT-facing website. The platform ingests health/context data (synthetic data is allowed), stores crew observations, requests evidence-backed clarification from an assistant, and creates a crew-reviewed ER handoff. The EMT can speak observations, review the transcript, hear concise assistant feedback, and accept, correct, or dismiss a proposed clarification.

The existing repository is https://github.com/Tecncentral/Hackachusets.git. Inspect the current committed implementation; do not regenerate it or assume the initial scaffold is unchanged. Read AGENTS.md, README.md, docs/api-contract.md, docs/team-workflow.md, existing .kiro steering/specs, and the relevant source files. Older documents may emphasize four roles/video scope: this prompt supersedes that allocation for your work, while preserving clinical evidence boundaries.

The goal is functioning capture → assessment of the account → user-reviewed correction → reassessment → ER handoff. Synthetic measurements are acceptable; a hardcoded scene that cannot accept new observations is not sufficient. Label synthetic data and execution modes accurately. No production EHR, wearable OAuth, RapidSOS, real ambulance dispatch, or deployment is required.

## Clinical context and data requirements

The user scenario is a person found confused after strenuous activity in hot conditions. EHS is the clinical concern, not a diagnosis that wearables establish. The assistant supports trained responders and their applicable agency protocols; it is not an autonomous clinician.

Capture available information in these categories. Missing information stays unknown; completion must not gate patient care or transport.

1. **Identity/context:** incident ID, patient association, age if known, relevant history, allergies, medications, witness/contact information where provided.
2. **Exertion:** activity, start/stop times or estimated duration, intensity if reported, location, and source of each fact.
3. **Environment:** ambient temperature and humidity, measurement time/location/source; optional reported clothing/equipment and acclimatization. Weather is not body temperature.
4. **Neurological/clinical observations:** mental status and changes, confusion, responsiveness, reported collapse or seizure, skin/sweating observations. Use explicit observations rather than filling in a diagnosis.
5. **Measurements:** temperature with value, unit, measurement method/site, event time, and whether before/after cooling; heart rate, BP, respiratory rate, SpO2, and glucose when obtained, each with unit/time/device or observer. Skin-temperature deviation is not core temperature. A reading after cooling must not be treated as the initial reading.
6. **Timeline:** reported symptom onset, last observed normal if relevant, discovery, possible device fall, emergency call, crew arrival, transport, and handoff. Keep them distinct. Unknown collapse time remains unknown.
7. **Care/reassessment:** actions actually performed, start/stop times, cooling method, repeated measurements and mental status, and observed response. Record care; do not invent or prescribe it.
8. **Optional wearable background:** available workout/HR/activity samples, baseline resting HR, recovery/HRV/skin-temperature context. Label consumer measurements, gaps, source quality, and synthetic fixtures. Do not require two wearables or assume continuous WHOOP API heart rate.

Clinical source starting points (open and verify before encoding clinical knowledge):
- CDC: https://www.cdc.gov/yellow-book/hcp/environmental-hazards-risks/heat-and-cold-illness-in-travelers.html
- NATA position statement: https://pmc.ncbi.nlm.nih.gov/articles/PMC4639891/
- ACSM consensus: https://pubmed.ncbi.nlm.nih.gov/37036463/
- Massachusetts EMS protocols: https://www.mass.gov/lists/emergency-medical-services-statewide-treatment-protocols

Store the title, URL, version/date, and relevant passage/section for knowledge actually used. Consensus documents are background; do not present them as the responder’s applicable local protocol. Protocol applicability and clinician review must be explicit. Avoid invented or unreviewed treatment dosing/threshold instructions.

Rules that must hold:
- Sweating does not exclude exertional heat stroke.
- Consumer skin temperature cannot establish core temperature.
- Wearable pace/fall events cannot establish illness onset or unconsciousness duration.
- A lower temperature after cooling cannot by itself exclude an earlier heat emergency.
- No irregular-rhythm alert is not evidence excluding a cardiac cause.
- The assistant proposes a clarification; it never silently replaces the EMT’s record.
- “Not documented,” “unknown,” and “not performed” are different states.
- The system must remain useful when wearables or AI are unavailable.

## Shared integration boundary — use across all three sessions

The **core platform** is the sole owner of incident state, canonical schemas, source IDs, revisions, and reviewed handoffs. The **assistant service** evaluates/transcribes and returns proposals without mutating incident state. The **website** calls the platform, not AI providers directly. Provider secrets stay server-side.

Preserve existing routes and add compatible capabilities where possible. The platform owner publishes the final schema. Until that is integrated, implement against the following agreed logical boundary and document exact differences instead of inventing an incompatible interface:

- GET `/api/incidents/:id`: current incident, measurements, sources, observations, feedback, corrections, and handoff versions.
- POST `/api/incidents/:id/observations`: `{ requestId, baseRevision, text, observedAt }`; stores a crew observation with source attribution. Retain the existing transcript route as a compatibility wrapper if appropriate.
- POST `/api/incidents/:id/audio/transcriptions`: multipart audio plus requestId; returns `{ transcript, mode, warnings }` for EMT review. It does NOT silently save a clinical observation. Edited text is subsequently submitted through observations.
- POST `/api/incidents/:id/evaluations`: `{ requestId, baseRevision }`; evaluates an immutable snapshot and stores feedback linked to that revision. A late response must not be applied to a different revision.
- POST `/api/incidents/:id/feedback/:feedbackId/resolutions`: `{ requestId, baseRevision, action: "clarify" | "dismiss" | "defer", clarificationText? }`; records the EMT’s choice and an auditable correction where appropriate.
- GET `/api/incidents/:id/handoff-draft`: `{ revision, sections, sourceIds, uncertainties }`.
- POST `/api/incidents/:id/handoffs`: approve a reviewed snapshot for the specific revision; preserve existing reviewer fields.

Assistant service logical endpoints:
- POST `/evaluate`: `{ incidentId, revision, observations, measurements, sources, careEvents, protocolContext }` → `{ incidentId, revision, mode, feedback: [...] }`.
- POST `/transcribe`: audio → `{ transcript, mode, warnings }`.
- GET `/health`.

Feedback item shape:
`{ id, kind: "conflict" | "missing_context" | "unsupported_inference", message, suggestedQuestion, observationIds, evidenceSourceIds, knowledgeReferenceIds, spokenSummary }`.

Define and validate required versus nullable fields. The platform provides a local unavailable/mock adapter to allow independent work; the assistant provides representative request/response fixtures; the UI places API calls behind one adapter. These are integration seams, not competing incident stores. Clearly label mocked behavior. Units, timestamps, statuses, and uncertainty must survive the full round trip.

## Worktree, Kiro, and collaboration practices

Locate the current clone root and fetch origin without discarding local work. Start from the committed shared scaffold on the remote default branch, or origin/setup/scenebrief-workspace if initialization is not merged. Record the exact base SHA. If neither contains the scaffold, report the prerequisite rather than rebuilding it. Use your assigned branch/worktree below; reuse an existing matching worktree safely. Never reset or overwrite another person’s work.

Use Kiro specs: refine your requirements, design, and tasks before implementation; then build incrementally and check off verified tasks. Discover available skills/Powers and use relevant TypeScript, API, accessibility, frontend, audio, or testing capabilities if actually installed. Do not assume specific skills exist. Read applicable steering and official documentation when configuration is uncertain.

Keep tests focused on behavior and integration. Use a verified Kiro hook for relevant checks if available; do not spend the session building unrelated agent infrastructure. Record actual Kiro work honestly.

Work in parallel from the same base. Do not merge other sessions’ branches. Shared contract changes belong to the platform owner; UI owns frontend shell; assistant owns its service and AI package. Publish small draft PRs and document exact interface changes so the final integration session can reconcile them. Do not assume uncommitted files in another worktree are visible.

Run npm ci and the project’s checks. Preserve current demo flow while extending it. Do not commit real patient data, audio from real patients, secrets, node_modules, or generated builds. Use distinct local ports on the same machine; do not kill teammates’ processes.

At completion: commit and push your own branch, open a draft PR without merging, and write the role-specific handoff with run commands, API examples, implementation status, actual checks, dependencies, known limitations, and base SHA. If publishing is blocked, retain the local work and report the blocker. This prompt authorizes your own implementation, testing, commit, push, and draft PR.

## Shared acceptance scenario

Use a synthetic runner incident with editable measurements. First submit a short, uncertain witness account. Submit “The wearable skin temperature is elevated, so core temperature is confirmed high.” The assistant should ask about a clinical temperature measurement and its method, rather than accept that inference. Submit “He is sweating, so this cannot be heat stroke.” It should provide a concise source-backed clarification that sweating does not exclude EHS, without declaring a diagnosis.

Then add an actual synthetic clinical temperature observation with method/time, documented cooling events, and a later reassessment. The handoff must distinguish pre/post-cooling measurements and preserve the witness’s uncertainty about collapse time. The EMT can accept a clarification, dismiss it with provenance, or defer it. Disable the assistant and verify observations and handoff remain usable. Do not gate basic care documentation on AI availability.

## Your ownership and goal

Own apps/web, including the paramedic feature, shared shell/styles, and printable/receiving handoff view. Worktree: `<parent-of-clone>/.scenebrief-worktrees/scenebrief-emt-website`. Update `.kiro/specs/paramedic-capture-and-clarification/` for this scope. The patient portal is not a priority; preserve it only if already functional.

Deliver a usable responsive website for EMTs to perform the platform and assistant workflows. This session must implement interactions and error states, not merely static screens or a video mockup.

## Implement

1. Build one clear incident workspace with patient/context summary, chronological evidence, observation capture, assistant feedback, and handoff review. Prioritize current mental status, clinical temperature with method/time, other obtained vitals, exertion/environment, and care/reassessment. Wearable wellness metrics are secondary.
2. Add a practical observation form: free text plus structured measurement fields and care-event entries where supported. Show units and collection time. Do not default unknown findings to normal or auto-fill clinical observations. Ingest the platform’s synthetic fixture through the API rather than maintaining a separate store.
3. Implement push-to-talk using supported browser recording APIs. Show recording state, stop/cancel, upload/transcribing state, editable transcript preview, and an explicit Save observation action. Handle denied permission, unsupported formats, and transcription failure. Retain text input. Clearly distinguish any optional “Load example transcript” button from real audio capture.
4. Display assistant feedback with the original statement, patient evidence, linked clinical reference, and suggested question. Let the EMT clarify, dismiss, or defer. Show whether feedback is stale after a new observation. Do not silently apply AI corrections.
5. Provide accessible optional spoken feedback using browser speech synthesis if supported: a visible Play button, stop/mute controls, and text equivalent. Stop playback before microphone recording to prevent the app transcribing itself. Never force audio to play automatically during care.
6. After a clarification, update the incident through the platform, visibly preserve the earlier statement, and show what changed. Keep discovery and collapse times distinct. Show pending/error states rather than faking a successful save.
7. Add reassessment and care-event entry linked to event times. Present initial and later readings together with documented cooling history. Do not imply a monitor is connected when values are manually entered.
8. Show the entire handoff draft before approval. Support source inspection, unresolved items, revision-aware review, printable/exportable handoff, and an ER receiving view when practical. Handle stale review rejection by requesting fresh review.
9. Test at phone and desktop widths, keyboard navigation, readable contrast, large touch targets, text overflow, and reduced motion. Use professional calm language; do not shame the EMT or witness.

## Integration behavior

All network access goes through one frontend API adapter. Build against the shared logical boundary and current canonical schemas. If an endpoint is not yet available, use an explicitly labeled development adapter with the same shape and record the gap. Do not silently fall back to fake success or duplicate the backend store. Keep provider secrets out of the browser.

## Acceptance checks

- An EMT can add a new observation and see it persisted in the platform.
- The transcript can be edited before submission.
- The assistant’s explanation and references are inspectable.
- Clarify/dismiss/defer have observable state and errors.
- Microphone/TTS failure leaves a usable text workflow.
- Missing wearable data does not prevent use.
- The complete draft can be reviewed and printed/exported without losing uncertainty or source attribution.
- A normal user can complete the main flow without opening developer tools.

## Deliverables

Working responsive website, audio capture/playback controls, typed API adapter, minimal meaningful interaction checks, screenshots of actual implemented states if available, `.kiro` spec updates, `docs/handoffs/emt-website.md`, and a draft PR. Report API/credential gaps explicitly. Do not spend time on filming, cinematic transitions, onboarding expansion, or marketing content.
