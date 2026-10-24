import { describe, expect, it } from 'vitest';
import { IncidentStore } from './store.js';
import { DemoInitial, DemoClarification, IncidentSchema } from '@scenebrief/contracts';
function ready() { const s = new IncidentStore(); s.sharing(true); s.match('patient-demo-01'); return s; }
describe('incident lifecycle', () => {
 it('requires sharing and a matching patient', () => { const s = new IncidentStore(); expect(() => s.match('patient-demo-01')).toThrow(); s.sharing(true); expect(() => s.match('wrong')).toThrow(); });
 it('preserves uncertainty and provenance through correction', async () => {
  const s = ready(); await s.transcript({ requestId: 'initial', text: DemoInitial });
  const result = await s.transcript({ requestId: 'clarify', text: DemoClarification });
  expect(IncidentSchema.safeParse(result).success).toBe(true);
  expect(result.claims.find(c => c.field === 'collapseTime')?.value).toBeNull();
  expect(result.claims.find(c => c.field === 'discoveryTime')?.value).toContain('10:43');
  expect(result.claims.find(c => c.value === DemoInitial)?.status).toBe('superseded');
  const correction = result.corrections[0]; expect(correction).toBeDefined();
  for (const c of result.claims) for (const id of c.sourceIds) expect(result.sources.some(s => s.id === id)).toBe(true);
 });
 it('deduplicates retries and rejects reused IDs with different input', async () => {
  const s = ready(); const input = { requestId: 'same', text: DemoInitial }; await s.transcript(input);
  const snapshot = s.snapshot(); expect(await s.transcript(input)).toEqual(snapshot);
  await expect(s.transcript({ ...input, text: 'different' })).rejects.toThrow('different text');
 });
 it('does not interpret arbitrary speech as a confirmed event time', async () => { const s = ready(); const result = await s.transcript({ requestId: 'other', text: 'Maybe he collapsed at 10:43' }); expect(result.claims.find(c => c.field === 'collapseTime')?.value).toBeNull(); });
 it('rejects stale review and preserves previously shared versions', async () => {
  const s = ready(); await s.transcript({ requestId: 'first', text: DemoInitial });
  const revision = s.snapshot().revision; const first = s.review(revision, 'crew').handoffs[0];
  await s.transcript({ requestId: 'second', text: DemoClarification });
  expect(() => s.review(revision, 'crew')).toThrow('Incident changed');
  const result = s.review(s.snapshot().revision, 'crew'); expect(result.handoffs).toHaveLength(2); expect(result.handoffs[0]).toEqual(first);
 });
 it('keeps the original statement and its source after correction', async () => {
  const s = ready(); await s.transcript({ requestId: 'initial', text: DemoInitial });
  const result = await s.transcript({ requestId: 'clarify', text: DemoClarification });
  const original = result.claims.find(c => c.value === DemoInitial)!, discovery = result.claims.find(c => c.field === 'discoveryTime')!;
  expect(result.corrections[0]).toMatchObject({ originalClaimId: original.id, replacementClaimId: discovery.id });
  expect(result.sources.find(src => src.id === original.sourceIds[0])?.text).toBe(DemoInitial);
  expect(result.sources.find(src => src.id === discovery.sourceIds[0])?.text).toBe(DemoClarification);
  expect(result.claims.find(c => c.field === 'collapseTime')).toMatchObject({ value: null, status: 'unknown' });
 });
 it('does not mark a reviewed handoff stale for sharing or matching changes', async () => {
  const s = ready(); await s.transcript({ requestId: 'first', text: DemoInitial });
  const revision = s.snapshot().revision; s.review(revision, 'crew');
  s.sharing(false); s.sharing(true); s.match('patient-demo-01');
  expect(s.snapshot().revision).toBe(revision); expect(s.snapshot().handoffs.at(-1)?.revision).toBe(revision);
 });
 it('serializes concurrent submissions and reset clears state', async () => {
  const s = ready(); await Promise.all([s.transaction(() => s.transcript({ requestId: 'a', text: DemoInitial })), s.transaction(() => s.transcript({ requestId: 'b', text: DemoClarification }))]);
  expect(s.snapshot().corrections).toHaveLength(1); expect(s.reset().patient.matched).toBe(false); expect(s.snapshot().handoffs).toEqual([]);
 });
});
