// Browser-local state for the patient companion (demo). Profile edits, device choice and per-field
// sharing preferences live in this browser only. The platform has no profile, per-field sharing or
// wearable endpoints, so none of this is sent anywhere. The platform's own emergency-sharing switch
// is separate (PlatformSharing.tsx) and changes only on an explicit click.
import { seedProfile, type DeviceId, type FieldKey, type FieldValue, type Profile } from './data';

export type Step = 'profile' | 'wearable' | 'sharing' | 'sync' | 'home';
export type ShareKey = 'contact' | 'allergies' | 'history' | 'medications' | 'age' | 'wearable';
export interface Options { activity: boolean; heartRate: boolean }

export interface CompanionState {
  step: Step;
  /** Sharing opened from Home: Save returns to Home without re-sync. */
  returnHome: boolean;
  profile: Profile;
  /** Edited in this browser after seeding from the fixture. */
  edited: boolean;
  device: DeviceId | null;
  options: Options;
  share: Record<ShareKey, boolean>;
  /** A demo sync completed for the current device. */
  synced: boolean;
  disconnected: boolean;
}

export function initialState(): CompanionState {
  return {
    step: 'profile', returnHome: false, profile: seedProfile(), edited: false, device: null,
    options: { activity: true, heartRate: true },
    share: { age: true, contact: true, allergies: true, history: true, medications: true, wearable: true },
    synced: false, disconnected: false
  };
}

export type Action =
  | { type: 'go'; step: Step; returnHome?: boolean }
  | { type: 'setName'; name: string }
  | { type: 'setField'; key: FieldKey; value: FieldValue }
  | { type: 'connected'; device: DeviceId; options: Options }
  | { type: 'skipWearable' }
  | { type: 'toggleShare'; key: ShareKey }
  | { type: 'setShare'; share: Record<ShareKey, boolean> }
  | { type: 'syncComplete' }
  | { type: 'disconnect' }
  | { type: 'removeReadings' }
  | { type: 'reset' };

export function reducer(s: CompanionState, a: Action): CompanionState {
  switch (a.type) {
    case 'go': return { ...s, step: a.step, returnHome: a.returnHome ?? false };
    case 'setName': return a.name.trim() ? { ...s, edited: true, profile: { ...s.profile, name: a.name.trim() } } : s; // name is required
    case 'setField': return { ...s, edited: true, profile: { ...s.profile, fields: { ...s.profile.fields, [a.key]: a.value } } };
    case 'connected': return { ...s, device: a.device, options: a.options, synced: false, disconnected: false, step: 'sharing', returnHome: false };
    case 'skipWearable': return { ...s, device: null, synced: false, disconnected: false, step: 'sharing', returnHome: false };
    case 'toggleShare': return { ...s, share: { ...s.share, [a.key]: !s.share[a.key] } };
    case 'setShare': return { ...s, share: a.share };
    case 'syncComplete': return { ...s, synced: !!s.device, disconnected: false };
    case 'disconnect': return { ...s, disconnected: true };
    case 'removeReadings': return { ...s, device: null, synced: false, disconnected: false };
    case 'reset': return initialState();
  }
}

const KEY = 'traumallama.patient-companion.v1';
type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem'>;
const store = (): Storage | null => { try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; } };

/** A sync in progress is not resumed after a reload; the person returns to sharing review. */
export function load(storage: Storage | null = store()): CompanionState {
  try {
    const raw = storage?.getItem(KEY);
    if (!raw) return initialState();
    const s = { ...initialState(), ...JSON.parse(raw) } as CompanionState;
    return s.step === 'sync' ? { ...s, step: 'sharing' } : s;
  } catch { return initialState(); }
}
export function save(s: CompanionState, storage: Storage | null = store()) { try { storage?.setItem(KEY, JSON.stringify(s)); } catch { /* storage unavailable */ } }
export function clear(storage: Storage | null = store()) { try { storage?.removeItem(KEY); } catch { /* storage unavailable */ } }

export const display = (v: FieldValue): string | null => (v.state === 'provided' ? v.text : v.state === 'none' ? 'None' : null);
