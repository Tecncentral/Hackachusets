import { randomUUID } from 'node:crypto';
import { createDemoIncident } from '@scenebrief/fixtures';
import { demoAdapter, DemoInitial } from '@scenebrief/ai';
import type { Incident, TranscriptInput } from '@scenebrief/contracts';
export class StoreError extends Error { constructor(public status: number, message: string) { super(message); } }
export class IncidentStore {
 private incident = createDemoIncident();
 private requests = new Map<string, string>();
 private queue: Promise<unknown> = Promise.resolve();
 snapshot(): Incident { return structuredClone(this.incident); }
 // Serialize mutations, including asynchronous adapter calls, to avoid lost corrections.
 transaction<T>(fn: () => Promise<T> | T): Promise<T> {
  const next = this.queue.then(fn); this.queue = next.catch(() => undefined); return next;
 }
 reset() { this.incident = createDemoIncident(); this.requests.clear(); return this.snapshot(); }
 // Sharing and matching gate access; they are not handoff content, so they do not bump revision
 // (a revision bump would falsely mark a reviewed handoff as stale in the ER view).
 sharing(value: boolean) { this.incident.patient.sharing = value; if (!value) this.incident.patient.matched = false; return this.snapshot(); }
 match(id: string) {
  if (!this.incident.patient.sharing) throw new StoreError(403, 'Enable synthetic sharing in the patient portal first.');
  if (id !== this.incident.patient.id) throw new StoreError(409, 'Patient identifier does not match.');
  this.incident.patient.matched = true; return this.snapshot();
 }
 private requireMatch() { if (!this.incident.patient.sharing || !this.incident.patient.matched) throw new StoreError(403, 'Confirm the patient association first.'); }
 async transcript(input: TranscriptInput) {
  this.requireMatch();
  const previous = this.requests.get(input.requestId);
  if (previous !== undefined) {
   if (previous !== input.text) throw new StoreError(409, 'Request ID already used for different text.');
   return this.snapshot();
  }
  const result = await demoAdapter.extract(input.text);
  const now = new Date().toISOString(), sourceId = randomUUID(), claimId = randomUUID();
  this.incident.sources.push({ id: sourceId, type: 'voice', label: 'Typed demo transcript — crew relays witness', text: input.text, eventTime: null, capturedAt: now });
  const original = this.incident.claims.find(c => c.field === 'account' && c.value === DemoInitial && c.status === 'reported');
  this.incident.claims.push({ id: claimId, field: result.field, value: result.value, sourceIds: [sourceId], status: 'reported', recordedAt: now });
  if (result.clarifiesInitial && original) {
   original.status = 'superseded';
   this.incident.corrections.push({ id: randomUUID(), originalClaimId: original.id, replacementClaimId: claimId, author: 'demo-crew', recordedAt: now });
  }
  this.incident.revision++; this.requests.set(input.requestId, input.text); return this.snapshot();
 }
 review(revision: number, reviewer: string) {
  this.requireMatch();
  if (revision !== this.incident.revision) throw new StoreError(409, 'Incident changed. Refresh and review the latest draft.');
  const existing = this.incident.handoffs.find(h => h.revision === revision);
  if (existing) return this.snapshot();
  this.incident.handoffs.push({ version: this.incident.handoffs.length + 1, revision, reviewedAt: new Date().toISOString(), reviewedBy: reviewer, text: demoAdapter.draft(this.incident) });
  return this.snapshot();
 }
}
