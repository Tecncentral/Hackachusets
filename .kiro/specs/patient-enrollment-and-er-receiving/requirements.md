# patient-enrollment-and-er-receiving

Owner: Member 4 · Paths: `apps/web/src/features/patient/`, `apps/web/src/features/er/`, shell (`main.tsx`, `style.css`), `docs/`

Demonstrate fictional enrollment and provide an ER view that distinguishes reviewed snapshots from later changes.

## Implemented in scaffold

Sharing toggle and demo patient code; ER view polling every 2 s, latest reviewed version, stale notice, earlier versions; shell navigation and reset.

## Acceptance

1. The patient view SHALL label all device data as synthetic and state that no account is connected and nobody monitors the profile.
2. Toggling sharing off SHALL clear the match; the UI SHALL describe this as a demo state, not production revocation.
3. The ER view SHALL show only reviewed handoff text (`handoffs[].text`), never the live draft.
4. WHEN `incident.revision` differs from the latest handoff's revision, the ER view SHALL show "new information, not yet amended"; sharing/matching changes SHALL NOT trigger it.
5. Earlier versions SHALL remain viewable and unchanged after a new version is shared.
6. The ER view SHALL show source evidence referenced by the shown version, with labels marking synthetic or unverified integrations.
7. Collapse time SHALL appear as "Unknown" in the received handoff after the demo clarification.
8. Shell polling SHALL NOT overwrite a newer mutation result with an older GET response.
9. Navigation and controls SHALL be keyboard accessible with visible focus and an `aria-current` view indicator.

## Patient companion (added 2026-10-24, `docs/handoffs/patient-companion.md`)

10. The patient view SHALL be a simulated setup flow (profile → optional wearable → sharing review → scripted sync → home) using values derived from `@scenebrief/fixtures`, never independent copies.
11. Empty optional fields SHALL show "Not provided"; "None" (patient-stated) SHALL stay distinct; nothing SHALL default to "none" or "normal".
12. Wearable connect/sync SHALL go through a `WearableSource` interface; the only implementation SHALL be a labelled scripted demo source. Device brands SHALL appear as text only, with no login or claim of a live integration.
13. Device times, record capture times and incident times (discovery, onset, collapse) SHALL be labelled distinctly; capture time SHALL NOT be presented as a sync time.
14. Per-field sharing choices SHALL be browser-local and SHALL be described as not enforced by the platform. The platform sharing setting SHALL change only on an explicit user click.
15. The flow SHALL work at 390 px and ≥1280 px without horizontal scroll, honour reduced motion (stepwise sync, no animation), and support keyboard use with focus managed in the connection dialog.

## Out of scope / future

Real enrollment, device account connection, hospital system delivery, delivery receipts, authentication.
