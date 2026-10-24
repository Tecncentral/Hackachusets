# Shared API contract

Base URL in the web app: `/api` (proxied to port 3001). Runtime schemas and TypeScript types are exported by `@scenebrief/contracts`. The only demo incident is `runner-found-down`.

| Method | Path | Request | Response |
| --- | --- | --- | --- |
| GET | `/api/health` | — | `{ ok: true, mode: "synthetic-demo" }` |
| GET | `/api/incidents/:id` | — | Full `Incident` |
| POST | `/api/demo/reset` | `{}` | Fresh `Incident`; global demo reset |
| POST | `/api/incidents/:id/sharing` | `{ sharing: boolean }` | Updated `Incident` |
| POST | `/api/incidents/:id/match` | `{ patientId: string, confirmed: true }` | Updated `Incident` |
| POST | `/api/incidents/:id/transcripts` | `{ requestId: string, text: string }` | Updated `Incident` |
| POST | `/api/incidents/:id/handoffs` | `{ revision: number, reviewedBy: string }` | `Incident` with reviewed snapshot |

Errors: 400 invalid payload; 403 missing demo sharing/matching; 404 unknown resource; 409 wrong identity, reused request ID with different text, or stale review; 500 internal error. JSON shape: `{ error: string }`.

## Event and review semantics

- Device event time and source capture time are separate UTC ISO timestamps. Unknown event time is null. Demo narrative is EDT, UTC-4, October 24, 2026.
- Sources and original claim text are retained. A corrected claim becomes `superseded`; the replacement has a new ID linked through a correction.
- `reported` is not clinically verified. `unknown` is not negative or normal.
- Transcript requests are idempotent by request ID and exact text within the current incident lifetime. Retry with the same ID; a new deliberate observation gets a new ID.
- Mutations are serialized, including async extraction. Content changes (transcripts) increment `revision`; sharing and matching gate access and do not.
- Review sends the revision the user inspected. A stale revision is rejected. Re-reviewing the same revision returns the existing version.
- Reviewed handoff text is an immutable snapshot. Later content changes mark that version stale until a new reviewed snapshot is shared.
- Sharing revocation removes the demo matching state. It does not implement production data revocation or access control.

## Known scaffold boundaries

No authentication, durable storage, clinical device ingestion, or true consent enforcement. GET returns the synthetic state for all views. Do not infer production access guarantees from the demo matching UI. The UI polls; replace with an event stream only if needed. Unsupported input remains a reported account rather than fabricated structured facts.
