'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type Status = 'idle' | 'running' | 'pass' | 'warn' | 'fail';
type Check = { id: string; label: string; status: Status; detail: string };

const INITIAL: Check[] = [
  { id: 'browser', label: 'Browser support', status: 'idle', detail: '' },
  { id: 'gpu', label: 'Graphics (WebGPU / WebGL2)', status: 'idle', detail: '' },
  { id: 'perf', label: 'Frame performance', status: 'idle', detail: '' },
  { id: 'mic', label: 'Microphone', status: 'idle', detail: '' },
  { id: 'net', label: 'Network to the game server', status: 'idle', detail: '' },
];

export default function ReadinessChecks({ enabled }: { enabled: boolean }) {
  const [checks, setChecks] = useState<Check[]>(INITIAL);
  const [running, setRunning] = useState(false);
  const [level, setLevel] = useState(0);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

  const update = useCallback((id: string, patch: Partial<Check>) => {
    setChecks((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }, []);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, []);

  async function runAll() {
    setRunning(true);
    setChecks(INITIAL.map((c) => ({ ...c, status: 'running' })));

    // 1. Browser
    const ua = navigator.userAgent;
    const isChromium = /Chrome|Edg/.test(ua) && !/OPR/.test(ua);
    const isSafari = /Safari/.test(ua) && !/Chrome/.test(ua);
    update('browser', {
      status: isChromium ? 'pass' : isSafari ? 'warn' : 'warn',
      detail: isChromium ? 'Chromium-based browser detected.'
        : isSafari ? 'Safari works but Chrome or Edge is smoother.'
        : 'Unrecognised browser. Chrome or Edge is recommended.',
    });

    // 2. GPU
    let gpuOk = false;
    let gpuDetail = '';
    if ('gpu' in navigator) {
      try {
        const adapter = await (navigator as Navigator & { gpu: { requestAdapter(): Promise<unknown> } }).gpu.requestAdapter();
        if (adapter) { gpuOk = true; gpuDetail = 'WebGPU available — you get the high quality tier.'; }
      } catch { /* fall through to WebGL2 */ }
    }
    if (!gpuOk) {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2');
      if (gl) {
        gpuOk = true;
        const dbg = gl.getExtension('WEBGL_debug_renderer_info');
        const renderer = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : 'unknown GPU';
        gpuDetail = `WebGL2 available (${renderer.slice(0, 60)}).`;
      } else {
        gpuDetail = 'No WebGL2 or WebGPU. This machine cannot render the game.';
      }
    }
    update('gpu', { status: gpuOk ? 'pass' : 'fail', detail: gpuDetail });

    // 3. Frame performance — sample real frame times for a second.
    const frames: number[] = [];
    await new Promise<void>((resolve) => {
      let last = performance.now();
      const started = last;
      const step = (now: number) => {
        frames.push(now - last);
        last = now;
        if (now - started < 1000) rafRef.current = requestAnimationFrame(step);
        else resolve();
      };
      rafRef.current = requestAnimationFrame(step);
    });
    frames.sort((a, b) => a - b);
    const p95 = frames[Math.floor(frames.length * 0.95)] ?? 999;
    update('perf', {
      status: p95 <= 17 ? 'pass' : p95 <= 33.3 ? 'warn' : 'fail',
      detail: `p95 frame time ${p95.toFixed(1)} ms — ${
        p95 <= 17 ? 'comfortably above 60 FPS' : p95 <= 33.3 ? 'around 30 FPS, playable' : 'below the 30 FPS floor'
      }.`,
    });

    // 4. Microphone
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      const buf = new Uint8Array(analyser.frequencyBinCount);
      const sample = () => {
        analyser.getByteTimeDomainData(buf);
        let peak = 0;
        for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
        setLevel(Math.min(1, peak / 64));
        rafRef.current = requestAnimationFrame(sample);
      };
      sample();
      update('mic', { status: 'pass', detail: 'Microphone granted. Say something and watch the meter.' });
    } catch {
      update('mic', {
        status: 'fail',
        detail: 'Microphone permission denied. The last fifteen minutes of this game need a microphone.',
      });
    }

    // 5. Network reachability to the game server
    const wsUrl = process.env.NEXT_PUBLIC_GAME_SERVER_URL;
    if (!wsUrl) {
      update('net', { status: 'warn', detail: 'Game server address is not configured on this deployment yet.' });
    } else {
      const started = performance.now();
      try {
        const httpUrl = wsUrl.replace(/^ws/, 'http') + '/health';
        const res = await fetch(httpUrl, { cache: 'no-store' });
        const ms = Math.round(performance.now() - started);
        update('net', {
          status: res.ok ? (ms < 250 ? 'pass' : 'warn') : 'fail',
          detail: res.ok ? `Reached the game server in ${ms} ms.` : `Game server responded ${res.status}.`,
        });
      } catch {
        update('net', { status: 'fail', detail: 'Could not reach the game server.' });
      }
    }

    setRunning(false);
  }

  return (
    <div>
      <div className="stack">
        {checks.map((c) => (
          <div key={c.id} className="panel" style={{ padding: 16 }}>
            <div className="spread">
              <strong style={{ fontSize: 15 }}>{c.label}</strong>
              <StatusPill status={c.status} />
            </div>
            {c.detail && <p className="small" style={{ marginTop: 6 }}>{c.detail}</p>}
            {c.id === 'mic' && c.status === 'pass' && (
              <div style={{ marginTop: 10, height: 6, background: 'var(--bg)', borderRadius: 100, overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${Math.round(level * 100)}%`,
                    background: 'var(--accent-bright)',
                    transition: 'width 60ms linear',
                  }}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={runAll}
        className="btn btn-primary"
        style={{ marginTop: 20 }}
        disabled={running || !enabled}
      >
        {running ? 'Running checks…' : enabled ? 'Run the checks' : 'Locked until every seat is paid'}
      </button>
    </div>
  );
}

function StatusPill({ status }: { status: Status }) {
  const map: Record<Status, { text: string; color: string }> = {
    idle: { text: 'not run', color: 'var(--text-faint)' },
    running: { text: 'checking', color: 'var(--cool-light)' },
    pass: { text: 'ready', color: 'var(--ok)' },
    warn: { text: 'workable', color: 'var(--accent-bright)' },
    fail: { text: 'problem', color: '#d97362' },
  };
  const s = map[status];
  return <span className="badge" style={{ color: s.color, borderColor: 'currentColor' }}>{s.text}</span>;
}
