// Wearable source boundary for the patient companion. The UI only knows this interface: connect(),
// then sync() reporting progress. There is NO real wearable integration; the only implementation is
// a scripted demo source that replays the shared synthetic fixture with fixed timings. A real source
// could implement the same interface later without UI changes.
import { ACTIVITY, HEART_RATE, type DeviceId } from './data';

export interface SyncOptions { device: DeviceId | null; activity: boolean; heartRate: boolean; reducedMotion: boolean }
/** Progress snapshot. stage 1 connect · 2 activity · 3 heart-rate samples · 4 profile · 5 done. */
export interface SyncProgress { stage: 1 | 2 | 3 | 4 | 5; acts: number; actsReady: number; pts: number; prof: number }
export type SyncResult = { status: 'complete' } | { status: 'failed'; message: string } | { status: 'cancelled' };

export interface WearableSource {
  readonly label: string;
  /** Connection step shown in the sheet. Resolves when the (simulated) connection is ready. */
  connect(device: DeviceId, signal?: AbortSignal): Promise<void>;
  sync(options: SyncOptions, onProgress: (p: SyncProgress) => void, signal: AbortSignal): Promise<SyncResult>;
}

export const PROFILE_STEPS = 3; // contact, allergies, sharing

type Timer = { set(fn: () => void, ms: number): unknown; clear(id: unknown): void };
const realTimer: Timer = { set: (fn, ms) => setTimeout(fn, ms), clear: id => clearTimeout(id as ReturnType<typeof setTimeout>) };

export interface ScriptOptions {
  timer?: Timer;
  /** Demo control: the next sync stops during stage 2 (cleared after use). */
  failNext?: () => boolean;
}

/**
 * Scripted demo source. Timings (≈8 s; ≈4 s with reduced motion):
 * stage 1 1.4 s · stage 2 rows over ≈2.5 s (each Pending, then Ready) · stage 3 points over ≈2 s · stage 4 three steps of 0.38 s.
 */
export function createScriptedSource(opts: ScriptOptions = {}): WearableSource {
  const timer = opts.timer ?? realTimer;
  const wait = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'));
    const id = timer.set(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, ms);
    const onAbort = () => { timer.clear(id); reject(new DOMException('Aborted', 'AbortError')); };
    signal?.addEventListener('abort', onAbort, { once: true });
  });

  return {
    label: 'Scripted demo source (synthetic fixture; no device connection)',
    connect: (_device, signal) => wait(900, signal),
    async sync(o, onProgress, signal) {
      const R = o.reducedMotion;
      const p: SyncProgress = { stage: o.device ? 1 : 4, acts: 0, actsReady: 0, pts: 0, prof: 0 };
      const emit = (patch: Partial<SyncProgress>) => { Object.assign(p, patch); onProgress({ ...p }); };
      const fail = !!o.device && !!opts.failNext?.();
      try {
        emit({});
        if (o.device) {
          await wait(R ? 800 : 1400, signal); emit({ stage: 2 });
          if (o.activity) {
            const n = ACTIVITY.length;
            if (R) { await wait(900, signal); if (fail) return failed(); emit({ acts: n, actsReady: n }); }
            else for (let i = 1; i <= n; i++) {
              // ≈2.5 s for the whole stage, whatever the number of rows: show Pending, then Ready.
              await wait(Math.round(1500 / n), signal); emit({ acts: i });
              if (fail && i === Math.ceil(n / 2)) { await wait(Math.round(1000 / n), signal); return failed(); }
              await wait(Math.round(1000 / n), signal); emit({ actsReady: i });
            }
          } else if (fail) { await wait(600, signal); return failed(); }
          await wait(R ? 100 : 300, signal); emit({ stage: 3 });
          if (o.heartRate) {
            const n = HEART_RATE.samples.length;
            if (R) { await wait(900, signal); emit({ pts: n }); }
            else for (let i = 1; i <= n; i++) { await wait(Math.round(2000 / Math.max(n, 1)), signal); emit({ pts: i }); }
          }
          await wait(R ? 100 : 350, signal); emit({ stage: 4 });
        }
        if (R) { await wait(700, signal); emit({ prof: PROFILE_STEPS }); }
        else for (let i = 1; i <= PROFILE_STEPS; i++) { await wait(380, signal); emit({ prof: i }); }
        await wait(R ? 100 : 450, signal); emit({ stage: 5 });
        return { status: 'complete' };
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return { status: 'cancelled' };
        throw e;
      }
      function failed(): SyncResult { return { status: 'failed', message: 'Couldn’t load your activity.' }; }
    }
  };
}
