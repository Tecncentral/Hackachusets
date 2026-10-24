// Time helpers. Event time and capture time are UTC ISO strings; display is in the narrative zone.
export const ZONE = 'America/New_York';
const clockFmt = new Intl.DateTimeFormat('en-US', { timeZone: ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const dateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
const partsFmt = new Intl.DateTimeFormat('en-US', { timeZone: ZONE, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });

/** HH:MM in the narrative zone; null stays "Unknown". */
export function clock(iso: string | null | undefined): string {
  return iso ? clockFmt.format(new Date(iso)) : 'Unknown';
}

/** YYYY-MM-DD of an instant in the narrative zone. */
export function zoneDate(iso: string): string { return dateFmt.format(new Date(iso)); }

function offsetMinutes(at: Date): number {
  const p = Object.fromEntries(partsFmt.formatToParts(at).map(x => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return Math.round((asUtc - at.getTime()) / 60000);
}

/** Convert a local wall-clock HH:MM on `date` (narrative zone) to UTC ISO. Empty input → null (unknown). */
export function zoneTimeToIso(date: string, hhmm: string): string | null {
  if (!/^\d{2}:\d{2}$/.test(hhmm) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const [y, m, d] = date.split('-').map(Number), [h, min] = hhmm.split(':').map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, h, min));
  const result = new Date(guess.getTime() - offsetMinutes(guess) * 60000);
  return result.toISOString().replace('.000Z', 'Z');
}

/** Current HH:MM in the narrative zone, for a "Now" button. */
export function nowClock(): string { return clock(new Date().toISOString()); }
