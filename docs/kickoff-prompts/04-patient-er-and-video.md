# Kiro kickoff — Member 4 — Patient/ER experience and video integration

Copy this entire document into a new Kiro session opened on your local clone of Tecncentral/Hackachusets. This prompt authorizes implementation, validation, committing your work, pushing your own branch, and opening a draft PR. It does not authorize merging other branches or publishing a production service.

## Your assigned worktree and spec

- Branch: `feat/patient-er`
- Worktree: `<parent-of-your-clone>/.scenebrief-worktrees/scenebrief-patient-er`
- Spec: `.kiro/specs/patient-enrollment-and-er-receiving/`
- Work only in that worktree after setup.

## Shared product and submission context

You are one of four Kiro sessions building SceneBrief concurrently. The final deliverable is a polished, emotionally grounded hackathon demonstration video **no longer than three minutes**. Optimize for a complete, coherent experience that can be recorded reliably. Production readiness is not the goal.

SceneBrief helps a paramedic understand a patient who cannot reliably speak for themselves. It brings available pre-arrival wearable context together with witness accounts and the crew’s observations, surfaces a useful clarifying question, and preserves the resulting history in an ER handoff.

The emotional story is uncertainty becoming clarity: a worried friend is trying to help, the responder needs to focus on care, and the receiving team needs the patient’s story to arrive intact. Respect everyone involved. Do not depict EMTs as incompetent, witnesses as careless, or AI as a lifesaving authority. Avoid graphic scenes, fabricated testimonials, and claims that the demo improves survival.

### Track and judging criteria

Track 1: Healthcare & Biotech. Our primary fit is **turning wearable data into better healthcare**, with **improving healthcare access and coordination** as the second fit. Do not add unrelated insurance, biotech, or research features to cover every track theme.

- **Potential Value:** Show a real information problem and a plausible reduction in searching, repeated explanation, and loss of context. Do not claim measured clinical benefit without evidence.
- **Implementation:** Show real use of Kiro specs, implementation, and scenario verification. Be honest about scripted AI and simulated integrations.
- **Quality and Design:** Prioritize clarity, accessibility, deliberate interaction, polished transitions, and a memorable correction reaching the ER.

### Demo-first scope

Build the full visible experience with synthetic data. Deterministic fixtures, scripted assistant responses, simulated scanning, staged audio, and local handoff updates are acceptable and encouraged when clearly labeled. No production OAuth, EHR, RapidSOS access, real dispatch, authentication system, durable clinical storage, or medical decision engine is required.

Keep a quiet persistent “Synthetic demo” indicator and disclose simulated integrations in the video/end card. Clearly distinguish a button that loads a demo transcript from real microphone transcription. Never pretend a recording, model call, or integration occurred when it did not.

Use real source links and existing research only for supported claims; no invented statistics. The app’s core promise is source-linked clarification, not diagnosis or wearable detection of stroke/heat stroke.

### Locked story and scenario

A fictional 24-year-old runner, Alex Morgan, is found on the ground after a workout on a hot morning. The presenting incident is “found down, confused.” The interface must not declare confirmed heat stroke from wearable data.

- Previous night: synthetic WHOOP background metrics, optional and secondary.
- 09:05 EDT: synthetic workout starts.
- 10:34: recorded pace varies; medical significance unknown.
- 10:42: synthetic device-reported fall event; collapse and unconsciousness unconfirmed.
- About 10:43: friend finds the patient.
- 10:44: simulated emergency call.
- 10:55: crew arrives.
- Initial account, EXACT shared fixture: “Friend says short run, dropped about five minutes ago.”
- Clarification, EXACT shared fixture: “Found him at 10:43. Did not witness collapse. Five minutes was a guess.”
- Final state: discovery approximately 10:43, collapse time UNKNOWN, original account retained, correction linked to source, reviewed ER handoff available.

Narrative date: October 24, 2026, America/New_York (EDT, UTC-4). Capture timestamps are separate from historical event timestamps. Use shared fixture exports rather than copying strings into multiple components.

A fall event is not downtime. Changing pace is not symptom onset. No rhythm alert does not exclude a cardiac problem. WHOOP’s public API does not provide continuous historical heart rate. Treat matching traces, fall fixtures, and wearable connection states as simulated unless an actual supported integration is implemented and verified.

### Shared three-minute video structure

Target about 2:45, leaving margin below three minutes:

| Time | Story beat |
| --- | --- |
| 0:00–0:20 | LIVE ACTION: paramedic arrives beside a seated or safely resting runner. Worried friend says, “I found him like this. I think it’s been five minutes.” Establish uncertainty without a staged fall. |
| 0:20–0:35 | SCREEN INSERT / BRIEF FLASHBACK: fictional patient previously prepared their emergency profile and connected simulated wearable sources. Caption: “Earlier — patient setup.” |
| 0:35–0:55 | LIVE ACTION → SCREEN INSERT: paramedic opens the incident and confirms identity; show the source-linked context rather than narrating every metric. |
| 0:55–1:35 | INTERCUT: paramedic dictates the shared initial account; screen shows the clarification card; paramedic asks the friend, “Did you see him collapse, or did you find him afterward?” Friend explains they found him and the timing was a guess. Paramedic records the exact shared clarification. |
| 1:35–1:55 | SCREEN INSERT → LIVE ACTION: discovery time updates while collapse time stays unknown. Briefly show the crew continuing care and adding a fictional reassessment, without depicting treatment instructions. |
| 1:55–2:15 | SCREEN INSERT + RECEIVING-CLINICIAN REACTION: reviewed handoff arrives in the simulated ER view. Clinician acknowledges, “Found at 10:43; collapse wasn’t witnessed.” |
| 2:15–2:40 | REAL DEVELOPMENT SCREEN RECORDING: show a Kiro requirement, actual implementation change, and passing scenario check. |
| 2:40–2:50 | LIVE ACTION / END CARD: “When the patient can’t tell the whole story, help the next team understand what’s known—and what isn’t.” Disclose staged scenario, synthetic data, and simulated integrations. |

The story is continuous. Do not turn it into a tour of menus or four unrelated feature demos.

### Filming format: acted scenes plus screen recordings

We will act out the scenario in person and intercut clean app screen recordings. Do not plan a screen-only walkthrough or an animated explainer as the primary format.

- Roles: runner/patient, worried friend, paramedic, and receiving clinician. A teammate can double roles through separate shots. Use a generic room or corridor for the receiving scene; no actual ambulance or hospital is required.
- Start with the patient already safely seated or resting. Do not stage a real collapse, strenuous heat exposure, invasive care, or a real emergency call. All actions are fictional demonstration beats.
- Keep attention on the people during dialogue. Cut to the app when it supplies context, poses the clarifying question, preserves uncertainty, and transfers the handoff.
- Record the app directly rather than relying on footage of a phone display. Match the device state and spoken lines between acted shots and screen inserts. Use the shared fixture text for the two submitted transcripts.
- Scripted transcript loading is acceptable. Do not edit a button-loaded transcript into footage that falsely implies working live transcription. Label that insert “Demo transcript” if microphone transcription is not implemented.
- Make screen states holdable: allow manual progression, pause important cards, and avoid auto-dismissal so recording is repeatable. Keep incidental timestamps from disrupting continuity.
- Capture a few seconds of silence and a stable screen before and after each action for editing. Narration must leave room for dialogue and visible interaction.
- Use captions and readable screen crops. Communicate uncertainty with words, not color alone.
- Avoid fake monitor alarms, dramatic diagnostic announcements, miraculous recoveries, or implying that the prototype saved this patient’s life. The payoff is clearer communication and more informed preparation.



## Repository and isolated worktree setup

Repository: https://github.com/Tecncentral/Hackachusets.git

Start from the locally cloned repository, locate its root, and inspect git status and worktrees. Never assume another teammate’s absolute filesystem path.

1. Fetch origin without resetting or discarding local work.
2. Identify the shared committed scaffold: prefer the remote default branch if it contains AGENTS.md, packages/contracts, and the four .kiro/specs directories. Otherwise use origin/setup/scenebrief-workspace if it contains them. If neither does, report the missing prerequisite rather than recreating the scaffold independently.
3. Record the exact base branch and commit SHA in your handoff. All sessions should use the same scaffold commit. Do not start from another teammate’s feature branch.
4. Create the role-specific branch/worktree named below in a sibling `.scenebrief-worktrees` directory. Use `git worktree add -b <branch> <path> <base-ref>` only if it does not exist. Reuse an existing matching worktree; never overwrite or reset it.
5. Make all implementation edits inside your worktree. If Kiro needs the folder opened as its workspace, tell the user the exact folder and continue there once available. Do not silently edit the original checkout.
6. Run npm ci inside your worktree. Keep credentials out of Git.
7. On separate machines, default development ports are fine. On one machine, do not kill another session’s server. Coordinate distinct API/web ports and proxy targets using local configuration; record your endpoints. Do not commit competing port defaults.

## Read before implementation

- AGENTS.md and README.md
- docs/team-workflow.md and docs/api-contract.md
- docs/user-journey.md and docs/demo-build-plan.md
- .kiro/steering/project.md
- Your workstream’s requirements.md, design.md, and tasks.md
- The current source files and tests relevant to your role

The actual committed code takes precedence over assumptions in this prompt. Inspect what the initialization session changed.

## How to use Kiro effectively

Use your existing workstream spec as the implementation plan: refine requirements into observable demo outcomes, document the design and boundaries, then work through small tasks and mark them complete only when implemented and verified. Avoid spending the session writing plans without building.

Read existing steering before adding anything. Put role-specific guidance in a uniquely named file only when useful; do not rewrite global steering in parallel. Discover installed skills/Powers and use relevant frontend, accessibility, TypeScript, testing, or integration skills if available. Do not invent skill names or capabilities. If unavailable, use ordinary code and tools. Consult official documentation when a Kiro hook/MCP configuration or library API is uncertain.

Use a small hook or focused check where it improves confidence; do not build an elaborate agent system. Record actual Kiro work in your handoff: changed files, requirements implemented, commands run, observed outcomes. Do not fabricate development history or screenshots.

## Parallel work and integration rules

All four sessions run concurrently. Work only within your ownership boundaries. Member 3 owns shared contracts, backend endpoints, fixtures, and root dependency coordination. Member 4 owns the app shell, shared design tokens, and video script. Members 1 and 4 must isolate feature styles to avoid broad CSS collisions.

Build against the committed contracts first. If you need a new shared capability, write a concise proposal at `docs/contracts/proposals/member-N.md` stating request/response shape, null/error semantics, example payload, and consumers. Continue with an adapter or explicit local demo seam inside your owned files. Do not quietly fork shared types or create a rival incident store. Another worktree cannot see an uncommitted proposal; include it in an early small commit/PR and report its URL for the team coordinator to share. Do not wait indefinitely for another session.

Prefer existing dependencies. If a new dependency is essential, use npm workspace commands and commit manifest/lock changes; identify them clearly for the final integrator. Never hand-edit the lockfile. Do not modify CI or root configuration without identifying the shared impact.

Use synthetic data only. Avoid logging sensitive information. Preserve the original records and unknown values. The demo API is unauthenticated and must remain local; do not deploy it publicly.

## Validation, delivery, and final integration

Use focused checks for the behaviors you changed. Run npm run check before publishing. Do not inflate test coverage with cosmetic tests. Browser-check the owned experience when tools are available; report unverified interactions honestly. If credentials are unavailable, deliver the explicitly simulated path rather than blocking the full experience.

Commit and push your role branch, then open a DRAFT PR against the shared scaffold base branch. Do not merge any PR, cherry-pick another teammate’s work, force-push, or modify a shared branch. Publishing your own work is authorized; report authentication blockers if any.

Create the role-specific handoff document named below containing:
- Base commit, branch, worktree, PR URL when available.
- Implemented features versus simulations/placeholders.
- Exact start/preview commands and recording steps.
- Shared files changed, proposed interfaces, and integration dependencies.
- Checks actually run and their results.
- Kiro contribution evidence and useful video moments.
- Remaining blockers, limited to what matters for the three-minute demo.

A separate final integration session will review all four PRs, reconcile contracts/adapters and the lockfile, merge onto an integration branch, run the complete scenario, fix cross-component issues, and rehearse the recording. Do not declare the integrated experience complete from an isolated worktree.

Proceed through implementation and publishing rather than stopping after a plan. Ask only for information that genuinely blocks your owned work.

## Your mission

Create the beginning and ending of the story, establish a coherent visual language, and plan a compelling video under three minutes. Make the patient feel like a person, make the paramedic’s contribution clear, and let the ER visibly receive the clarified history.

You own the recording plan and supporting interfaces. A separate final integration session will combine all four branches; do not merge other work during this parallel session.

## Owned files

- apps/web/src/features/patient/** and apps/web/src/features/er/**
- apps/web/src/main.tsx and shared style.css/design tokens, coordinated with Member 1.
- .kiro/specs/patient-enrollment-and-er-receiving/**
- docs/video/**
- docs/handoffs/member-4-patient-er-video.md
- docs/contracts/proposals/member-4.md if needed.

Do not rewrite the paramedic feature, backend, contracts, or AI adapter. Keep navigation and ScreenProps compatible. Scope global CSS carefully; avoid broad selectors that break Member 1’s feature styles.

## Goals and acceptance criteria

1. **Patient preparation, about 15 seconds of footage.** Show a warm, simple fictional profile, clearly simulated wearable connection states, sharing controls, and the existing demo code. Communicate that preparation makes context available, not that the patient is being continuously monitored. Do not build a full medical-record intake form.
2. **Consistent visual shell.** Establish a small shared token vocabulary for colors, type, spacing, status, cards, and controls. Preserve usable mobile views and readable ER desktop layout. Document tokens for Member 1 rather than redesigning their component.
3. **ER arrival, about 20 seconds of footage.** Make the reviewed handoff legible at recording size: presentation, timeline, clarification, uncertainty, source expansion, and review/version status. Show a clear state when an update has not yet been reviewed. Keep discovery and collapse time distinct.
4. **Visible continuity.** When the shared backend receives the reviewed handoff, the ER view should update without manual re-entry. A restrained arrival/update transition is appropriate; do not imply delivery to a real hospital.
5. **Video package.** Write docs/video/storyboard.md, narration.md, shot-list.md, and recording-checklist.md. Aim for 2:45–2:50 with timed beats and narration short enough to leave space for interactions. Include exact screen actions, actor dialogue, camera framing, screen-insert cues, overlays, transitions, and a concise end-card disclosure. Also create docs/video/actor-script.md and continuity-checklist.md. Assign each shot to LIVE ACTION, SCREEN RECORDING, or DEVELOPMENT EVIDENCE, with duration and required app checkpoint.
6. **Emotional restraint.** Open with the burden of reconstructing a story while treating someone. Use a fictional scenario and staged voice lines if helpful. Avoid fabricated testimonials, dramatic mortality promises, or shaming witnesses/EMTs. End on the clarified account traveling with the patient.
7. **Kiro evidence segment.** Reserve 20–25 seconds for actual spec → change → scenario check evidence supplied by the other workstreams. Use placeholders in the storyboard until that evidence exists; do not fabricate footage.

## Scope priorities

P0: Patient setup, polished receiving view, shared visual consistency, timed script and recording plan.
P1: Demo QR presentation, amendment animation, captions, screenshot/recording helpers if tools are available.
Defer lengthy onboarding, unrelated charts, marketing pages, real device OAuth, and producing a final stitched video before the integrated application is ready.

## Integration needs

Use the current backend as the source of truth. If improved handoff structure is needed, propose it to Member 3 and adapt the current text snapshot without creating a separate medical summary. Publish a small early visual-token change/PR and report its URL for Member 1. Do not assume automatic communication between Kiro sessions.

## Recording deliverables

The script must visibly demonstrate each rubric category:
- Potential Value: the uncertain witness account becomes a more accurate history.
- Implementation: real Kiro development evidence and honest simulated integration labels.
- Quality/Design: coherent mobile-to-ER experience with readable content and minimal friction.

Include captions/transcript guidance, viewport sizes, a reset checklist, how to hide personal browser information, and a fallback plan using recorded demo takes. Provide a practical shoot order grouped by location and actor availability, then a separate edit order matching the timeline. List minimal props: phone, laptop, generic responder identifier, and optional fictional document. Add the exact shared transcript lines and matching screen checkpoints to the continuity checklist. Mark unimplemented shots as pending. The final integration session will replace placeholders, run the entire story, and record/export the final <=3-minute video.
