'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type Context = 'in_game' | 'lobby' | 'debrief' | 'booking' | 'site' | 'other';

/**
 * Always-available feedback capture.
 *
 * Sits in the corner of every page, including during a game. A player can type or speak, at any
 * moment, without leaving what they are doing — the moment somebody notices something is the
 * moment they are most able to describe it, and making them remember it until the debrief loses
 * most of what they would have said.
 */
export default function FeedbackWidget({
  context = 'site',
  sessionId,
  atMs,
  zone,
}: {
  context?: Context;
  sessionId?: string;
  atMs?: number;
  zone?: string;
}) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedRef = useRef(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTracks = useCallback(() => {
    recorderRef.current?.stream.getTracks().forEach((t) => t.stop());
    if (tickRef.current) clearInterval(tickRef.current);
  }, []);

  useEffect(() => stopTracks, [stopTracks]);

  async function submitText(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body, email: email || null, context, sessionId, atMs, zone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not send that.');
      setDone(data.message ?? 'Thanks.');
      setBody('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send that.');
    } finally {
      setBusy(false);
    }
  }

  async function startRecording() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => void uploadAudio();
      recorder.start();
      recorderRef.current = recorder;
      startedRef.current = Date.now();
      setElapsed(0);
      setRecording(true);
      tickRef.current = setInterval(() => setElapsed(Date.now() - startedRef.current), 200);
    } catch {
      setError('We could not reach your microphone. Type it instead?');
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    setRecording(false);
    if (tickRef.current) clearInterval(tickRef.current);
  }

  async function uploadAudio() {
    setBusy(true);
    try {
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
      const form = new FormData();
      form.append('audio', blob, 'feedback.webm');
      form.append('context', context);
      form.append('durationMs', String(Date.now() - startedRef.current));
      if (email) form.append('email', email);
      if (sessionId) form.append('sessionId', sessionId);
      if (atMs != null) form.append('atMs', String(atMs));
      if (zone) form.append('zone', zone);

      const res = await fetch('/api/feedback', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not send that recording.');
      setDone(data.message ?? 'Thanks — we have your recording.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send that recording.');
    } finally {
      stopTracks();
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => { setOpen(true); setDone(null); }}
        className="btn btn-ghost btn-sm"
        style={{
          position: 'fixed', right: 18, bottom: 18, zIndex: 80,
          background: 'var(--bg-panel)', boxShadow: '0 4px 20px rgba(0,0,0,0.45)',
        }}
        aria-label="Send feedback"
      >
        Feedback
      </button>
    );
  }

  return (
    <div
      role="dialog"
      aria-label="Send feedback"
      style={{
        position: 'fixed', right: 18, bottom: 18, zIndex: 80, width: 'min(370px, calc(100vw - 36px))',
        background: 'var(--bg-panel)', border: '1px solid var(--border-strong)',
        borderRadius: 'var(--radius)', padding: 18, boxShadow: '0 8px 34px rgba(0,0,0,0.5)',
      }}
    >
      <div className="spread" style={{ marginBottom: 12 }}>
        <strong style={{ fontSize: 15 }}>Tell us anything</strong>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="btn btn-ghost btn-sm"
          style={{ padding: '3px 9px' }}
          aria-label="Close feedback"
        >
          ✕
        </button>
      </div>

      {done ? (
        <>
          <div className="notice notice-ok" style={{ marginBottom: 12 }}>{done}</div>
          <button type="button" onClick={() => setDone(null)} className="btn btn-ghost btn-sm">
            Say something else
          </button>
        </>
      ) : (
        <form onSubmit={submitText}>
          <p className="tiny" style={{ marginBottom: 10 }}>
            A bug, an idea, something confusing, something you loved. Any time — during a game too.
          </p>

          <div className="field" style={{ marginBottom: 12 }}>
            <textarea
              rows={4}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="What's on your mind?"
              maxLength={8000}
              disabled={recording}
              style={{ fontSize: 14 }}
            />
          </div>

          <div className="field" style={{ marginBottom: 12 }}>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email (optional — only if you want a reply)"
              style={{ fontSize: 13 }}
            />
          </div>

          {error && <div className="notice notice-warn" role="alert" style={{ marginBottom: 10, fontSize: 13 }}>{error}</div>}

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              style={{ flex: 1 }}
              disabled={busy || recording || body.trim().length < 3}
            >
              {busy ? 'Sending…' : 'Send'}
            </button>
            <button
              type="button"
              onClick={recording ? stopRecording : startRecording}
              className={`btn btn-sm ${recording ? 'btn-primary' : 'btn-ghost'}`}
              disabled={busy && !recording}
              style={{ flex: 'none' }}
            >
              {recording ? `Stop · ${(elapsed / 1000).toFixed(0)}s` : 'Speak instead'}
            </button>
          </div>

          {recording && (
            <p className="tiny" style={{ marginTop: 10, color: 'var(--accent-bright)' }}>
              ● Recording. Say what happened, then press stop.
            </p>
          )}
        </form>
      )}
    </div>
  );
}
