// Optional spoken feedback via browser speech synthesis. Never auto-plays; callers stop it before
// microphone recording so the app cannot transcribe itself.
import { useEffect, useState, useSyncExternalStore } from 'react';

const MUTE_KEY = 'scenebrief.speech.muted';
let speakingId: string | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

export function speechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
}

export function stopSpeech() {
  if (speechSupported()) window.speechSynthesis.cancel();
  if (speakingId !== null) { speakingId = null; emit(); }
}

export function speak(id: string, text: string): boolean {
  if (!speechSupported() || isMuted()) return false;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 1; u.lang = 'en-US';
  u.onend = u.onerror = () => { if (speakingId === id) { speakingId = null; emit(); } };
  speakingId = id; emit();
  window.speechSynthesis.speak(u);
  return true;
}

export function isMuted(): boolean {
  try { return localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; }
}
export function setMuted(muted: boolean) {
  try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch { /* storage unavailable */ }
  if (muted) stopSpeech();
  emit();
}

const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };
/** Re-renders when playback or mute state changes. */
export function useSpeechState() {
  const id = useSyncExternalStore(subscribe, () => speakingId, () => null);
  const muted = useSyncExternalStore(subscribe, isMuted, () => false);
  const [supported, setSupported] = useState(false);
  useEffect(() => setSupported(speechSupported()), []);
  return { speakingId: id, muted, supported };
}
