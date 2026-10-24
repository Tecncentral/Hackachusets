// Binds crew approval to the exact handoff draft the crew reviewed.
//
// The platform freezes a handoff by revision only (POST /handoffs { revision, reviewedBy }) and
// rebuilds the content at that moment. Some changes do not bump the revision (e.g. confirming the
// patient match adds profile and wearable context), so "same revision" is not "same content". The
// website therefore keeps the reviewed draft itself and:
//   1. before sending, re-reads GET /handoff-draft and refuses to approve if its content differs
//      (a newer draft needs a fresh review — nothing is sent);
//   2. after the platform answers, checks that the frozen version has the reviewed content.
// Retrying after a connection failure repeats both steps with the same reviewed draft, never with a
// newer one. Preview, approval and the receiving view all render the canonical sections.
import type { Handoff, HandoffDraft, Incident } from './boundary';
import { PlatformError } from './boundary';
import type { Platform } from './types';

export type HandoffContent = Pick<HandoffDraft, 'revision' | 'patientMatched' | 'sections' | 'uncertainties' | 'sourceIds'>;

/** Content identity of a draft or reviewed version (excludes generation time and headers). */
export function handoffFingerprint(d: HandoffContent): string {
  return JSON.stringify([d.revision, d.patientMatched, d.sections, d.uncertainties, d.sourceIds]);
}

export const sameContent = (a: HandoffContent, b: HandoffContent) => handoffFingerprint(a) === handoffFingerprint(b);

/** The shared version that holds exactly this reviewed content, if any. */
export function sharedVersionFor(incident: Incident, reviewed: HandoffContent): Handoff | undefined {
  return incident.handoffs.find(h => h.revision === reviewed.revision && sameContent(h, reviewed));
}

export type ApprovalOutcome =
  | { status: 'approved'; incident: Incident; handoff: Handoff }
  /** The platform's current draft differs from the reviewed one. Nothing was sent. */
  | { status: 'changed'; latest: HandoffDraft }
  /** The platform froze content that differs from what was reviewed (platform race; see handoff doc). */
  | { status: 'mismatch'; incident: Incident; handoff: Handoff };

/** Approve the reviewed draft. Network failures and conflicts throw PlatformError. */
export async function approveReviewed(platform: Platform, reviewed: HandoffDraft, reviewedBy: string): Promise<ApprovalOutcome> {
  const latest = await platform.getHandoffDraft();
  if (!sameContent(latest, reviewed)) return { status: 'changed', latest };
  const incident = await platform.approveHandoff({ revision: reviewed.revision, reviewedBy });
  const handoff = incident.handoffs.find(h => h.revision === reviewed.revision);
  if (!handoff) throw new PlatformError('server', 'The platform did not return the approved version.', 'handoffs');
  return sameContent(handoff, reviewed) ? { status: 'approved', incident, handoff } : { status: 'mismatch', incident, handoff };
}
