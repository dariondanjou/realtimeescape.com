'use client';

import { useState } from 'react';

type Row = { label: string; value: string; ok: boolean | null };

export default function DeviceCheck() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [verdict, setVerdict] = useState<'good' | 'ok' | 'bad' | null>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    const out: Row[] = [];

    const ua = navigator.userAgent;
    const chromium = /Chrome|Edg/.test(ua) && !/OPR/.test(ua);
    const safari = /Safari/.test(ua) && !/Chrome/.test(ua);
    out.push({
      label: 'Browser',
      value: chromium ? 'Chrome or Edge' : safari ? 'Safari' : 'Other',
      ok: chromium ? true : safari ? null : null,
    });

    const mobile = /Android|iPhone|iPad|iPod/i.test(ua);
    out.push({
      label: 'Device type',
      value: mobile ? 'Phone or tablet — touch controls' : 'Desktop or laptop',
      ok: mobile ? null : true,
    });

    let gpu = 'None';
    let gpuOk = false;
    if ('gpu' in navigator) {
      try {
        const adapter = await (navigator as Navigator & { gpu: { requestAdapter(): Promise<unknown> } }).gpu.requestAdapter();
        if (adapter) { gpu = 'WebGPU'; gpuOk = true; }
      } catch { /* ignore */ }
    }
    if (!gpuOk) {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (gl) {
        gpuOk = true;
        const dbg = gl.getExtension('WEBGL_debug_renderer_info');
        gpu = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)).slice(0, 48) : 'WebGL2';
      }
    }
    out.push({ label: 'Graphics', value: gpu, ok: gpuOk });

    const frames: number[] = [];
    await new Promise<void>((resolve) => {
      let last = performance.now();
      const t0 = last;
      const step = (now: number) => {
        frames.push(now - last);
        last = now;
        if (now - t0 < 800) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
    frames.sort((a, b) => a - b);
    const p95 = frames[Math.floor(frames.length * 0.95)] ?? 999;
    out.push({
      label: 'Frame performance',
      value: `p95 ${p95.toFixed(1)} ms (~${Math.round(1000 / p95)} FPS)`,
      ok: p95 <= 33.3,
    });

    const cores = navigator.hardwareConcurrency ?? 0;
    out.push({ label: 'CPU threads', value: cores ? String(cores) : 'unknown', ok: cores === 0 ? null : cores >= 4 });

    const hasMic = Boolean(navigator.mediaDevices?.getUserMedia);
    out.push({ label: 'Microphone API', value: hasMic ? 'Available' : 'Unavailable', ok: hasMic });

    setRows(out);
    const fails = out.filter((r) => r.ok === false).length;
    setVerdict(fails === 0 ? 'good' : fails === 1 ? 'ok' : 'bad');
    setBusy(false);
  }

  return (
    <div>
      {!rows && (
        <button type="button" onClick={run} className="btn btn-primary btn-lg" disabled={busy}>
          {busy ? 'Checking…' : 'Check this computer'}
        </button>
      )}

      {rows && (
        <>
          <div className={`notice ${verdict === 'good' ? 'notice-ok' : 'notice-warn'}`} style={{ marginBottom: 20 }}>
            {verdict === 'good' && 'This computer will run the game well.'}
            {verdict === 'ok' && 'This computer will probably run the game, with one thing worth fixing below.'}
            {verdict === 'bad' && 'This computer is likely to struggle. Check the rows marked below.'}
          </div>

          <div className="panel">
            <table>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.label}>
                    <td style={{ color: 'var(--text-faint)' }}>{r.label}</td>
                    <td className="mono">{r.value}</td>
                    <td style={{ textAlign: 'right' }}>
                      <span style={{ color: r.ok === true ? 'var(--ok)' : r.ok === false ? '#d97362' : 'var(--accent-bright)' }}>
                        {r.ok === true ? 'good' : r.ok === false ? 'problem' : 'workable'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button type="button" onClick={run} className="btn btn-ghost btn-sm" style={{ marginTop: 16 }}>
            Run again
          </button>
        </>
      )}
    </div>
  );
}
