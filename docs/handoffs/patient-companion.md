# Handoff — Patient companion (Trauma Llama `#patient`, simulated demo)

- Merged into `main` from `integrate/patient-companion` (built on `feat/patient-companion`, PR #6). On main it uses main's website adapter (`WorkspaceIncident`, `platform.setSharing`) rather than the separate canonical-contract repair on `feat/emt-website-ehs`.
- Design source: `project 2/Patient.dc.html`, `Patient-Phone.dc.html`, `Intake.dc.html` (outside the repo; translated to React, not copied).
- No core prompt covers a patient surface (`03-emt-website.md`: "patient portal is not a priority"). Scope confirmed by Justin: a simulated demo replacing the old `#patient` view.

## What it is

Profile → Wearable (optional) → Review sharing → Sync → Home, plus "Continue without a wearable" (Profile → Sharing → "Preparing your profile" → Home). Home: profile summary, local sharing choices, the real platform sharing control, wearable card (disconnect / reconnect / remove readings), recent activity, heart-rate chart with table.

Code: `apps/web/src/features/patient/` — `data.ts` (dataset from fixture), `wearableSource.ts` (source boundary + scripted demo source), `state.ts` (local reducer/persistence), `Steps.tsx`, `SyncStep.tsx`, `Home.tsx`, `HeartRateChart.tsx`, `PlatformSharing.tsx`, `parts.tsx`, `patient.css`, `patient.test.tsx`.

## Real vs. simulated

| Thing | Status |
|---|---|
| Platform emergency sharing (`POST /sharing`) + demo patient code | **Real** (kept from the old view). Changes only on an explicit "Turn on/off emergency sharing" click. The flow, sync, demo controls and local choices never call it (browser test checks the API stays `sharing: false` through three full flows) |
| Profile edits, None vs Not provided, per-field sharing, device choice, sync state | **Browser-local** (`localStorage` `traumallama.patient-companion.v1`), synthetic only. No profile, per-field-sharing or wearable endpoint exists; none was invented. UI says per-field choices are not enforced by the platform |
| Wearable connect/sync | **Scripted** `createScriptedSource()` behind the `WearableSource` interface (connect + sync with progress). No device account, OAuth, login or API. Device names are plain text with generic line icons |
| Patient profile in the EMT workspace | Unchanged platform behaviour: after sharing + crew match, the fixture's profile/wearable sources become visible to the incident. Local edits do not reach the EMT view |

## Dataset (from `@scenebrief/fixtures`, not duplicated)

Name, age, allergies, medications, history and the profile "last reviewed" date come from the fixture's profile source/context facts; the fixture has no emergency contact or date of birth, so contact starts **Not provided** and the DOB row was replaced by **Age** (the fixture field). Readings are the fixture's wearable records: overnight recovery and resting HR (23:00–06:30), outdoor run from 09:05 (end not recorded), pace change 10:34 and **device-reported fall 10:42** (device events), HR samples 122→166 bpm 09:05–10:34 with the stated gap. Skin-temperature deviation stays in the EMT panel only. Units follow the fixture (`bpm`, not `/min`).

Times kept distinct: device times are labelled "device time"; the fixture `capturedAt` (10:43) is shown only in Source details as "captured in the synthetic incident (capture time, not a sync time)"; the demo sync has no timestamp ("demo sync complete"); Home states device times don't show symptom onset, collapse or discovery. Design copy changed accordingly (no "14:15", "12 Jun 2026", Penicillin, Jordan Morgan seed, 168 at 13:49).

## Behaviour notes

- Sync ≈8.6 s in four stages (rows over ≈2.5 s each Pending→Ready, chart points over ≈2 s because the fixture has 4 samples, not 16); reduced motion ≈3.9 s with each stage at once and no animations (`prefers-reduced-motion` or the demo "Reduce motion" control). Cancel, failure in stage 2 ("Next sync fails" demo control), Retry, Continue without a wearable, Disconnect (readings kept), Reconnect (re-runs sync), Remove synced readings.
- Sharing from Home: "Save sharing" returns with no re-sync; Cancel restores the earlier choices.
- Dialog: `role=dialog aria-modal`, labelled heading gets focus, Tab stays inside, Esc/Close return focus to the device card; bottom sheet under 760 px. Screen changes move focus to the new H1 only when the triggering control is gone.
- Shell: header shows "Trauma Llama | Emergency profile" on this view; nav label "Patient companion (demo)"; EMT match hint points there. No other EMT changes.

## Checks

- `npm run check` on main + companion → **21 files / 180 tests**, build OK. New `patient.test.tsx` (14): fixture-derived values, None vs Not provided, required name, reload-during-sync, scripted timings with fake timers (≈8 s / reduced <5 s, Pending before Ready, failure in stage 2, cancel, no-device skips, "Not selected · Skipped"), rendered copy for each screen (brand names text only, no img/login, switches, platform-sharing card, no fabricated sync time).
- Browser, real API on main's default ports (http adapter, Chrome via Playwright) **64/64**: full flow at 1280 px, 390 px and 390 px reduced motion; no horizontal scroll on profile/sharing/home; keyboard edit with focus return; empty name rejected; dialog vs bottom sheet; focus into/within/back from the sheet; both-off note; live preview; durations 8.6 s / 3.9 s; zero running animations under reduced motion; platform sharing untouched by all flows; cancel, failure, continue without, disconnect/reconnect/remove, Home sharing cancel/save; explicit platform toggle → EMT `POST /match` succeeds → toggle off; no console errors.
- Screenshots: `docs/handoffs/patient-companion-screenshots/`.
- Not verified: screen readers, Safari/Firefox, touch devices.

## Not integrated / dependencies

- Intake full form (`Intake.dc.html`): not built; inline rows cover the same fields. Repeatable allergy rows need a structured allergy model the platform lacks.
- Date of birth: no fixture/canonical field (Age used).
- Per-field sharing enforcement, profile storage, wearable connect/sync, linking local edits to incidents: need platform contracts (none exist). "None" vs "Not provided" is local only; canonical `ContextFact` can say documented value or `unknown`, not "patient declined/none" explicitly.
- Atkinson Hyperlegible fonts not loaded (no font dependency); system-ui fallback, same as the EMT workspace.
- No dependencies added.
