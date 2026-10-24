// Push-to-talk recording with getUserMedia + MediaRecorder. Produces an audio Blob for
// transcription; it never saves anything itself.
import { useCallback, useEffect, useRef, useState } from 'react';
import { stopSpeech } from './speech';

export const MAX_SECONDS = 60;
const PREFERRED = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];

export type RecorderState =
  | { phase: 'idle' }
  | { phase: 'requesting' }
  | { phase: 'recording'; startedAt: number }
  | { phase: 'stopped'; blob: Blob; seconds: number }
  | { phase: 'error'; reason: 'unsupported' | 'denied' | 'no-device' | 'insecure' | 'format' | 'empty' | 'failed'; message: string };

export function pickMimeType(isSupported: (t: string) => boolean): string | null {
  return PREFERRED.find(t => { try { return isSupported(t); } catch { return false; } }) ?? null;
}

export function recorderSupport(): { ok: true } | { ok: false; reason: 'unsupported' | 'insecure'; message: string } {
  if (typeof window === 'undefined') return { ok: false, reason: 'unsupported', message: 'Recording is not available here.' };
  if (!window.isSecureContext) return { ok: false, reason: 'insecure', message: 'Microphone needs a secure page (https or localhost). Type the observation instead.' };
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') return { ok: false, reason: 'unsupported', message: 'This browser cannot record audio. Type the observation instead.' };
  return { ok: true };
}

function describe(e: unknown): RecorderState {
  const name = (e as { name?: string })?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') return { phase: 'error', reason: 'denied', message: 'Microphone permission was denied. Allow it in the browser’s site settings, or type the observation.' };
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return { phase: 'error', reason: 'no-device', message: 'No microphone was found. Type the observation instead.' };
  if (name === 'NotSupportedError') return { phase: 'error', reason: 'format', message: 'This browser cannot record in a supported audio format. Type the observation instead.' };
  return { phase: 'error', reason: 'failed', message: 'Recording failed. Type the observation instead, or try again.' };
}

export function useRecorder() {
  const [state, setState] = useState<RecorderState>({ phase: 'idle' });
  const [elapsed, setElapsed] = useState(0);
  const rec = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const cancelled = useRef(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionRef = useRef(0);

  const release = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    stream.current?.getTracks().forEach(t => t.stop());
    stream.current = null;
  }, []);
  useEffect(() => () => { cancelled.current = true; rec.current?.state === 'recording' && rec.current.stop(); release(); }, [release]);

  const start = useCallback(async () => {
    stopSpeech(); // never record the app's own spoken feedback
    const support = recorderSupport();
    if (!support.ok) { setState({ phase: 'error', reason: support.reason, message: support.message }); return; }
    const mimeType = pickMimeType(t => MediaRecorder.isTypeSupported(t));
    const session = ++sessionRef.current;
    cancelled.current = false;
    setState({ phase: 'requesting' });
    let media: MediaStream;
    try {
      media = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) { if (session === sessionRef.current) { release(); setState(describe(e)); } return; }
    // Cancelled (or restarted) while waiting for permission: close the microphone and stop here.
    if (cancelled.current || session !== sessionRef.current) { media.getTracks().forEach(t => t.stop()); return; }
    stream.current = media;
    try {
      const r = new MediaRecorder(media, mimeType ? { mimeType } : undefined);
      chunks.current = [];
      const startedAt = Date.now();
      r.ondataavailable = ev => { if (ev.data.size > 0) chunks.current.push(ev.data); };
      r.onerror = () => { release(); setState({ phase: 'error', reason: 'failed', message: 'Recording stopped unexpectedly. Type the observation instead, or try again.' }); };
      r.onstop = () => {
        release();
        if (cancelled.current) { setState({ phase: 'idle' }); return; }
        const blob = new Blob(chunks.current, { type: r.mimeType || mimeType || 'audio/webm' });
        const seconds = Math.round((Date.now() - startedAt) / 1000);
        setState(blob.size === 0 ? { phase: 'error', reason: 'empty', message: 'No audio was captured. Try again or type the observation.' } : { phase: 'stopped', blob, seconds });
      };
      rec.current = r;
      r.start();
      setElapsed(0);
      timer.current = setInterval(() => {
        const s = Math.round((Date.now() - startedAt) / 1000);
        setElapsed(s);
        if (s >= MAX_SECONDS && r.state === 'recording') r.stop();
      }, 250);
      setState({ phase: 'recording', startedAt });
    } catch (e) { release(); setState(describe(e)); }
  }, [release]);

  const stop = useCallback(() => { if (rec.current?.state === 'recording') rec.current.stop(); }, []);
  const cancel = useCallback(() => {
    cancelled.current = true;
    if (rec.current?.state === 'recording') rec.current.stop(); else { release(); setState({ phase: 'idle' }); }
  }, [release]);
  const clear = useCallback(() => setState({ phase: 'idle' }), []);
  return { state, elapsed, start, stop, cancel, clear };
}
