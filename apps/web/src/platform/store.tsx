// Shell-level incident state: the latest incident returned by the platform adapter, with polling.
// This is a view cache of the platform response, not a separate store: every value comes from the
// adapter, and every mutation result replaces it.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { PlatformError, type Incident } from './boundary';
import type { Platform } from './types';

interface IncidentState {
  platform: Platform;
  incident: Incident | null;
  loadError: PlatformError | null;
  apply: (next: Incident) => void;
  refresh: () => Promise<void>;
  /** Global save status for the header: the most recent mutation's outcome. */
  save: SaveIndicator;
  reportSave: (s: SaveIndicator) => void;
}

export type SaveIndicator = { state: 'idle' } | { state: 'saving' } | { state: 'saved' } | { state: 'error'; message: string };

const Ctx = createContext<IncidentState | null>(null);

export function IncidentProvider({ platform, children, pollMs = 2000 }: { platform: Platform; children: ReactNode; pollMs?: number }) {
  const [incident, setIncident] = useState<Incident | null>(null);
  const [loadError, setLoadError] = useState<PlatformError | null>(null);
  // Bumped on every applied mutation so an older in-flight poll cannot overwrite a newer result.
  const seq = useRef(0);
  const refresh = useCallback(async () => {
    const at = seq.current;
    try {
      const data = await platform.getIncident();
      if (at === seq.current) { setIncident(data); setLoadError(null); }
    } catch (e) { setLoadError(e instanceof PlatformError ? e : new PlatformError('network', String(e), 'incident')); }
  }, [platform]);
  const apply = useCallback((next: Incident) => { seq.current++; setIncident(next); }, []);
  const [save, reportSave] = useState<SaveIndicator>({ state: 'idle' });
  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), pollMs);
    return () => clearInterval(t);
  }, [refresh, pollMs]);
  return <Ctx.Provider value={{ platform, incident, loadError, apply, refresh, save, reportSave }}>{children}</Ctx.Provider>;
}

export function useIncidentState(): IncidentState {
  const v = useContext(Ctx);
  if (!v) throw new Error('IncidentProvider missing');
  return v;
}

export type ActionState = 'idle' | 'pending' | 'done' | 'error';

/** Runs one platform mutation with explicit pending/done/error state. Conflicts trigger a refresh so the latest record is shown. */
export function useAction(opts: { reportsSave?: boolean } = {}) {
  const { apply, refresh, reportSave } = useIncidentState();
  const reports = opts.reportsSave ?? true;
  const [state, setState] = useState<ActionState>('idle');
  const [error, setError] = useState<PlatformError | null>(null);
  const run = useCallback(async <T,>(fn: () => Promise<T>, pick: (result: T) => Incident = r => r as unknown as Incident): Promise<T | null> => {
    setState('pending'); setError(null);
    if (reports) reportSave({ state: 'saving' });
    try {
      const result = await fn();
      apply(pick(result)); setState('done');
      if (reports) reportSave({ state: 'saved' });
      return result;
    } catch (e) {
      const err = e instanceof PlatformError ? e : new PlatformError('server', e instanceof Error ? e.message : String(e), 'unknown');
      setError(err); setState('error');
      if (reports) reportSave({ state: 'error', message: err.message });
      if (err.kind === 'conflict') void refresh();
      return null;
    }
  }, [apply, refresh, reportSave, reports]);
  const clear = useCallback(() => { setState('idle'); setError(null); }, []);
  return { state, error, run, clear, pending: state === 'pending' };
}
