import { useId, useState, type ReactNode } from 'react';
import type { DeviceIcon as Icon } from './data';
import type { Step } from './state';

/** role="switch" with the state in text beside the track; colour is never the only signal. */
export function Switch({ on, label, onText, offText, disabled, disabledText, onToggle }: {
  on: boolean; label: string; onText: string; offText: string; disabled?: boolean; disabledText?: string; onToggle: () => void;
}) {
  return <button type="button" className="pt-switch" role="switch" aria-checked={on && !disabled} aria-label={label} disabled={disabled} onClick={onToggle}>
    <span className="pt-switch-text" data-on={on && !disabled}>{disabled ? disabledText ?? offText : on ? onText : offText}</span>
    <span className="pt-track" data-on={on && !disabled} aria-hidden="true"><span className="pt-knob" /></span>
  </button>;
}

export function DeviceIcon({ icon, size = 32 }: { icon: Icon; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
  if (icon === 'band') return <svg {...common}><rect x="3" y="9" width="18" height="6" rx="3" /><rect x="9" y="10.5" width="6" height="3" rx="1" /></svg>;
  if (icon === 'ring') return <svg {...common}><circle cx="12" cy="14" r="6.5" /><path d="M9.5 7.5L12 4l2.5 3.5" /></svg>;
  return <svg {...common}><rect x="7" y="6" width="10" height="12" rx="3" /><path d="M9 6l1-3h4l1 3M9 18l1 3h4l1-3M12 10v2l1.5 1" /></svg>;
}

const STEPS: Array<{ id: Exclude<Step, 'home'>; label: string }> = [
  { id: 'profile', label: 'Profile' }, { id: 'wearable', label: 'Wearable' }, { id: 'sharing', label: 'Sharing' }, { id: 'sync', label: 'Sync' }
];
export function StepTracker({ step }: { step: Step }) {
  const ci = STEPS.findIndex(s => s.id === step);
  return <nav aria-label="Setup progress" className="pt-steps">
    <ol>
      {STEPS.map((s, i) => {
        const state = i < ci ? 'done' : i === ci ? 'current' : 'upcoming';
        return <li key={s.id} data-state={state} aria-current={state === 'current' ? 'step' : undefined}>
          <span className="pt-step-dot" aria-hidden="true">{state === 'done' ? '✓' : i + 1}</span>
          <span>{s.label}<span className="pt-sr">{state === 'done' ? ' (done)' : state === 'upcoming' ? ' (upcoming)' : ''}</span></span>
        </li>;
      })}
    </ol>
  </nav>;
}

export function Disclosure({ label, children, defaultOpen = false }: { label: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return <div className="pt-disclosure">
    <button type="button" className="btn btn-quiet pt-disclosure-btn" aria-expanded={open} aria-controls={id} onClick={() => setOpen(o => !o)}>
      <span aria-hidden="true">{open ? '▾' : '▸'}</span> {label}
    </button>
    {open && <div id={id} className="pt-disclosure-body pt-in">{children}</div>}
  </div>;
}

export function NotProvided() { return <span className="pt-notprov">Not provided</span>; }
