// Behaviour tests for the narrative-zone time helpers. The EDT offset is -04:00 on 2026-10-24,
// so a 10:43 wall-clock time in America/New_York is 14:43 UTC.
import { describe, expect, it } from 'vitest';
import { clock, zoneDate, zoneTimeToIso } from './time';

describe('zoneTimeToIso', () => {
  it('converts a wall-clock time in the narrative zone (EDT) to UTC', () => {
    expect(zoneTimeToIso('2026-10-24', '10:43')).toBe('2026-10-24T14:43:00Z');
  });

  it('returns null for an empty or malformed time', () => {
    expect(zoneTimeToIso('2026-10-24', '')).toBeNull();
    expect(zoneTimeToIso('2026-10-24', '9:5')).toBeNull();
    expect(zoneTimeToIso('', '10:43')).toBeNull();
  });

  it('round-trips through clock() back to the original wall-clock time', () => {
    const iso = zoneTimeToIso('2026-10-24', '10:43');
    expect(iso).not.toBeNull();
    expect(clock(iso)).toBe('10:43');
  });
});

describe('clock', () => {
  it('renders null/undefined as "Unknown"', () => {
    expect(clock(null)).toBe('Unknown');
    expect(clock(undefined)).toBe('Unknown');
  });

  it('renders a UTC instant in the narrative zone as HH:MM', () => {
    expect(clock('2026-10-24T14:43:00Z')).toBe('10:43');
  });
});

describe('zoneDate', () => {
  it('returns the narrative-zone calendar date of an instant', () => {
    // 2026-10-24T14:43:00Z is 10:43 EDT, still 2026-10-24 locally.
    expect(zoneDate('2026-10-24T14:43:00Z')).toBe('2026-10-24');
    // 2026-10-24T02:00:00Z is 22:00 EDT on 2026-10-23.
    expect(zoneDate('2026-10-24T02:00:00Z')).toBe('2026-10-23');
  });
});
