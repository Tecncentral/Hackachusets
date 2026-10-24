# Design

- Views consume `ScreenProps`; all data comes from the shared API via the shell. No per-view mock data.
- Shell polling uses a mutation sequence counter so in-flight polls started before a mutation are discarded (AC 8).
- Staleness is computed by comparing `handoffs.at(-1).revision` with `incident.revision`; the API keeps access-gating changes out of `revision` (AC 4).
- Source display for a version: sources whose IDs appear in that version's text, plus the fixed device-context sources.
- Prefer feature-local styles; coordinate `style.css` and navigation changes with Member 1.
- Replace polling with an event stream only if latency becomes a demo problem.
