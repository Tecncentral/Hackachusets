// Canonical SceneBrief schemas. The core platform owns this package; see docs/core-api-contract.md.
export * from './records.js';
export * from './assistant.js';
export * from './handoff.js';
export * from './incident.js';
export * from './requests.js';
export * from './integrity.js';

// Scripted legacy demo statements (used by the /transcripts flow and the web demo).
export const DemoInitial = 'Friend says short run, dropped about five minutes ago.';
export const DemoClarification = 'Found him at 10:43. Did not witness collapse. Five minutes was a guess.';
