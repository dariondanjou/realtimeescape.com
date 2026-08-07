'use client';

import { useState } from 'react';

/**
 * Demo-mode switch in the site header.
 *
 * On: seats are free, and a game can be started solo. Turning it on asks for the demo key once,
 * then it persists until switched off.
 */
export default function DemoToggle({ active }: { active: boolean }) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function set(enable: boolean, withKey?: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enable, key: withKey }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not change demo mode.');
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change demo mode.');
      setBusy(false);
    }
  }

  if (active) {
    return (
      <button
        type="button"
        onClick={() => set(false)}
        disabled={busy}
        className="badge badge-live"
        title="Demo mode is on — seats are free and you can play solo. Click to turn off."
        style={{ cursor: 'pointer', background: 'transparent', font: 'inherit', fontSize: 11 }}
      >
        {busy ? 'exiting…' : 'demo mode ✕'}
      </button>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="badge"
        style={{ cursor: 'pointer', background: 'transparent', font: 'inherit', fontSize: 11 }}
        title="Enter demo mode"
      >
        demo
      </button>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      <form
        onSubmit={(e) => { e.preventDefault(); void set(true, key); }}
        style={{
          position: 'absolute', right: 0, top: 26, zIndex: 90, width: 250,
          background: 'var(--bg-panel)', border: '1px solid var(--border-strong)',
          borderRadius: 'var(--radius)', padding: 14, boxShadow: '0 8px 28px rgba(0,0,0,0.5)',
        }}
      >
        <label htmlFor="demo-key" style={{ fontSize: 12 }}>Demo key</label>
        <input
          id="demo-key"
          type="password"
          autoFocus
          value={key}
          onChange={(e) => setKey(e.target.value)}
          style={{ fontSize: 13, marginBottom: 8 }}
        />
        {error && <p className="tiny" style={{ color: '#d97362', marginBottom: 8 }}>{error}</p>}
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="submit" className="btn btn-primary btn-sm" style={{ flex: 1 }} disabled={busy}>
            {busy ? '…' : 'Enable'}
          </button>
          <button type="button" onClick={() => setOpen(false)} className="btn btn-ghost btn-sm">
            Cancel
          </button>
        </div>
        <p className="tiny" style={{ marginTop: 10 }}>
          Free seats, solo play allowed, and nothing counts toward the public stats.
        </p>
      </form>
    </div>
  );
}
