# SceneBrief contributor instructions

Read README.md, docs/team-workflow.md, and docs/api-contract.md before changing integration behavior.

- This is a synthetic hackathon scaffold. Never add real patient data, credentials, or misleading production-integration claims.
- Shared types and runtime schemas live in packages/contracts. Do not create competing incident types inside apps.
- packages/fixtures owns the consistent runner scenario. Event timestamps use UTC ISO 8601; the story is October 24, 2026 in America/New_York (EDT, UTC-4). Capture time is independent of event time.
- Preserve uncertainty: fall time, discovery time, symptom onset, and loss-of-consciousness duration are different facts. Device data never establishes clinical onset or diagnosis.
- The AI package proposes information; API logic owns state mutations, revisions, and source references. Do not let model text execute clinical instructions or arbitrary tool calls.
- Corrections retain original statements. Reviewed handoffs are immutable versions. New incident information requires re-review before publishing an amendment.
- Follow the ownership boundaries in docs/team-workflow.md. Coordinate changes to contracts, fixtures, package-lock.json, and the shared app shell.
- Run npm run check before a PR. Add meaningful scenario tests when changing extraction or lifecycle behavior.
- Kiro builds and evaluates the product. It is not the runtime clinical assistant.
- Do not deploy this unauthenticated in-memory API publicly. Authentication, access control, consent enforcement, secure persistence, and real integrations are future work.
