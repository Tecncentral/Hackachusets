# Design

- Keep the `EvidenceAdapter` interface (`extract`, `draft`) stable. Add implementations alongside `demoAdapter`; select via server-side config, defaulting to `demoAdapter`.
- Model adapters: prompt → JSON → Zod parse → `Extraction`. On parse failure, timeout, or missing key, return the `account` fallback rather than throwing.
- Model text is data. Never interpret it as instructions, tool calls, or clinical actions.
- Evaluation cases live next to the adapter as Vitest tests (e.g., `packages/ai/src/*.test.ts`), each asserting field, value, and that collapse time is not inferred.
- Changes to `Extraction` or `ClaimSchema` go through Member 3.
- The Kiro hook in `.kiro/agents/scenebrief.json` runs the scenario tests when files in `packages/ai/` change.
