// Browser stand-in for `node:crypto`, used only when the development adapter bundles the platform's
// IncidentStore (vite.config.ts alias). The store only needs randomUUID.
export const randomUUID = (): string => globalThis.crypto.randomUUID();
