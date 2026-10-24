import { createHttpPlatform } from './http';
import { createDevPlatform } from './dev';
import type { Platform } from './types';

/** Adapter selection: `?adapter=dev` (or VITE_PLATFORM_ADAPTER=dev) opts into the labeled development adapter. Default is the platform API. */
export function selectPlatform(search = typeof location === 'undefined' ? '' : location.search): Platform {
  const fromQuery = new URLSearchParams(search).get('adapter');
  const choice = fromQuery ?? import.meta.env?.VITE_PLATFORM_ADAPTER ?? 'http';
  return choice === 'dev' ? createDevPlatform() : createHttpPlatform();
}

export * from './boundary';
export { patientScoped } from './scope';
export { approveReviewed, handoffFingerprint, sameContent, sharedVersionFor, type ApprovalOutcome, type HandoffContent } from './approval';
export type { Platform, AdapterInfo } from './types';
export { IncidentProvider, useIncidentState, useAction, type ActionState, type SaveIndicator } from './store';
