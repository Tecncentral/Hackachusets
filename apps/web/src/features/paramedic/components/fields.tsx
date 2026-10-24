import { useCallback, useRef, useState } from 'react';
import type { ActionState, PlatformError } from '../../../platform';
import { nowClock } from '../../../platform/time';

/**
 * Stable request ID per submission content: a retry of the same content reuses its ID (idempotent);
 * changed content or a completed save gets a new one.
 */
export function useRequestId() {
  const ref = useRef<{ key: string; id: string } | null>(null);
  const forContent = useCallback((key: string) => {
    if (ref.current?.key !== key) ref.current = { key, id: crypto.randomUUID() };
    return ref.current.id;
  }, []);
  const done = useCallback(() => { ref.current = null; }, []);
  return { forContent, done };
}

export function TimeField({ id, label, value, onChange, hint }: { id: string; label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  return <div className="ws-field">
    <label htmlFor={id}>{label}</label>
    <div className="ws-time">
      <input id={id} type="time" className="field mono" value={value} onChange={e => onChange(e.target.value)} aria-describedby={`${id}-hint`} />
      <button type="button" className="btn btn-secondary" onClick={() => onChange(nowClock())}>Now</button>
      {value && <button type="button" className="btn btn-quiet" onClick={() => onChange('')}>Clear</button>}
    </div>
    <p id={`${id}-hint`} className="ws-hint">{hint ?? (value ? 'EDT, incident date.' : 'Empty = not documented.')}</p>
  </div>;
}

/**
 * Visible result of a save: pending, explicit error, or confirmation from the platform.
 * `revision` renders the confirmed record revision; `thing` names the entry kind for the
 * "platform does not accept <thing> yet" message when an endpoint is unavailable.
 */
export function SaveStatus({ state, error, saved, revision, thing, compat }: { state: ActionState; error: PlatformError | null; saved: string; revision?: number | null; thing?: string; compat?: string | null }) {
  const at = nowClock();
  return <div className="ws-status" aria-live="polite">
    {state === 'pending' && <p className="text-quiet">Saving to the platform…</p>}
    {state === 'done' && <p>
      <span className="chip chip-ok">Saved</span>{' '}
      {revision != null ? <>Saved at <span className="mono">{at}</span> · revision <span className="mono">{revision}</span></> : saved}
      {compat ? <span className="ws-hint"> {compat}</span> : null}
    </p>}
    {state === 'error' && error && <p role="alert" className="alert alert-crit">
      {error.kind === 'unavailable'
        ? `Not saved — this platform does not accept ${thing ?? 'this entry'} yet. Your entry is kept.`
        : <>Not saved. Your entry is kept — retry when ready.{error.message ? ` ${error.message}` : ''}{error.kind === 'conflict' ? ' The record has been refreshed.' : ''}</>}
    </p>}
  </div>;
}

export function useDraftState<T>(initial: T) {
  const [value, setValue] = useState<T>(initial);
  const set = useCallback(<K extends keyof T>(k: K, v: T[K]) => setValue(s => ({ ...s, [k]: v })), []);
  return [value, set, setValue] as const;
}
