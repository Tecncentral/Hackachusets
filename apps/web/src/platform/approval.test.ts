// Approval binding: approval and retry stay bound to the exact draft the crew reviewed.
import { describe, expect, it, vi } from 'vitest';
import { approveReviewed, sameContent, sharedVersionFor } from './approval';
import { PlatformError } from './boundary';
import { makePlatform, obs } from '../test-helpers';

describe('approveReviewed', () => {
  it('approves the reviewed draft; the frozen version has the reviewed content', async () => {
    const { platform } = makePlatform();
    const reviewed = await platform.getHandoffDraft();
    const outcome = await approveReviewed(platform, reviewed, 'Crew (demo)');
    expect(outcome.status).toBe('approved');
    if (outcome.status !== 'approved') return;
    expect(sameContent(outcome.handoff, reviewed)).toBe(true);
    expect(sharedVersionFor(outcome.incident, reviewed)?.version).toBe(1);
  });

  it('a newer revision requires fresh review: nothing is sent', async () => {
    const { platform } = makePlatform();
    const reviewed = await platform.getHandoffDraft();
    await platform.addObservation(obs(await platform.getIncident(), 'New finding after review.'));
    const approve = vi.spyOn(platform, 'approveHandoff');
    const outcome = await approveReviewed(platform, reviewed, 'Crew (demo)');
    expect(outcome.status).toBe('changed');
    expect(approve).not.toHaveBeenCalled();
    expect((await platform.getIncident()).handoffs).toHaveLength(0);
  });

  it('a patient match after review (same revision, new profile context) requires fresh review', async () => {
    const { platform } = makePlatform();
    const reviewed = await platform.getHandoffDraft();
    await platform.setSharing(true);
    const inc = await platform.match('patient-demo-01');
    expect(inc.revision).toBe(reviewed.revision);
    const outcome = await approveReviewed(platform, reviewed, 'Crew (demo)');
    expect(outcome.status).toBe('changed');
    expect((await platform.getIncident()).handoffs).toHaveLength(0);
  });

  it('retry after a connection failure re-sends the same reviewed draft and succeeds once', async () => {
    const { platform } = makePlatform();
    const reviewed = await platform.getHandoffDraft();
    const real = platform.approveHandoff;
    platform.approveHandoff = vi.fn().mockRejectedValueOnce(new PlatformError('network', 'Cannot reach the platform.', 'handoffs')).mockImplementation(real);
    await expect(approveReviewed(platform, reviewed, 'Crew (demo)')).rejects.toMatchObject({ kind: 'network' });
    const retry = await approveReviewed(platform, reviewed, 'Crew (demo)');
    expect(retry.status).toBe('approved');
    expect(platform.approveHandoff).toHaveBeenLastCalledWith({ revision: reviewed.revision, reviewedBy: 'Crew (demo)' });
  });

  it('retry when the first response was lost returns the existing version (no duplicate)', async () => {
    const { platform } = makePlatform();
    const reviewed = await platform.getHandoffDraft();
    const real = platform.approveHandoff;
    platform.approveHandoff = vi.fn(async input => { await real(input); throw new PlatformError('network', 'Response lost.', 'handoffs'); });
    await expect(approveReviewed(platform, reviewed, 'Crew (demo)')).rejects.toMatchObject({ kind: 'network' });
    platform.approveHandoff = real;
    const retry = await approveReviewed(platform, reviewed, 'Crew (demo)');
    expect(retry.status).toBe('approved');
    expect((await platform.getIncident()).handoffs).toHaveLength(1);
  });

  it('retry after a newer draft appeared does not approve the newer draft', async () => {
    const { platform } = makePlatform();
    const reviewed = await platform.getHandoffDraft();
    const real = platform.approveHandoff;
    platform.approveHandoff = vi.fn().mockRejectedValueOnce(new PlatformError('network', 'Cannot reach the platform.', 'handoffs')).mockImplementation(real);
    await expect(approveReviewed(platform, reviewed, 'Crew (demo)')).rejects.toMatchObject({ kind: 'network' });
    await platform.addObservation(obs(await platform.getIncident(), 'Recorded while offline approval was pending.'));
    const retry = await approveReviewed(platform, reviewed, 'Crew (demo)');
    expect(retry.status).toBe('changed');
    expect((await platform.getIncident()).handoffs).toHaveLength(0);
  });
});
