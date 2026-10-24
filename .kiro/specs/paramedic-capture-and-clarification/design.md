# Design

- Consume `ScreenProps` (`incident`, `busy`, `act`) from `apps/web/src/types.ts`. Do not fetch directly or add a local incident copy; the shell owns polling.
- Derive all displayed state from `incident.claims`, `incident.sources`, and `incident.corrections`. Render claims by `status` (`reported`, `unknown`, `superseded`); never hide superseded claims.
- Clarification card visibility is driven by the presence of a `reported` initial-account claim, not by local UI flags.
- Retries: keep the pending `requestId` in component state until the request succeeds; generate a new one only for a new observation.
- Feature-local styles go in this folder; changes to `style.css` or `main.tsx` are coordinated with Member 4.
- New endpoints or claim fields are requested from Member 3 (contracts first).
