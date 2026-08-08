'use client';

import { useState } from 'react';

/**
 * Demo-mode switch in the site header.
 *
 * An iOS Settings-style toggle: a fully-rounded track with a white knob that slides across.
 * Accent fill when on, neutral greyscale when off, so state reads at a glance without the label.
 * Proportions follow the iOS switch (track roughly 1.7× its height, knob inset 2px).
 *
 * When DEMO_MODE_OPEN is set it flips in one click. Otherwise clicking opens the passkey prompt.
 */
export default function DemoToggle({ active, open = false }: { active: boolean; open?: boolean }) {
  const [promptOpen, setPromptOpen] = useState(false);
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

  function onClick() {
    if (active) return void set(false);
    if (open) return void set(true);
    setPromptOpen((v) => !v);
  }

  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
      <button
        type="button"
        role="switch"
        aria-checked={active}
        aria-label="Demo mode"
        onClick={onClick}
        disabled={busy}
        title={
          active
            ? 'Demo mode is on — free seats, solo play. Click to turn off.'
            : 'Turn on demo mode — free seats, solo play allowed'
        }
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 9,
          padding: 0,
          border: 0,
          background: 'transparent',
          cursor: busy ? 'wait' : 'pointer',
          font: 'inherit',
          fontSize: 11,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          fontFamily: 'var(--font-mono)',
          color: active ? 'var(--accent-bright)' : 'var(--text-faint)',
          transition: 'color 0.2s',
          opacity: busy ? 0.55 : 1,
        }}
      >
        <span>demo</span>

        {/* Track — fully rounded, accent when on, neutral grey when off */}
        <span
          aria-hidden="true"
          style={{
            position: 'relative',
            width: 38,
            height: 22,
            borderRadius: 999,
            flex: 'none',
            transition: 'background-color 0.22s ease',
            background: active ? 'var(--accent)' : '#3a4247',
            boxShadow: active ? 'none' : 'inset 0 0 0 1px rgba(255,255,255,0.07)',
          }}
        >
          {/* Knob — white, inset 2px, with the soft drop shadow iOS uses to lift it off the track */}
          <span
            style={{
              position: 'absolute',
              top: 2,
              left: active ? 18 : 2,
              width: 18,
              height: 18,
              borderRadius: '50%',
              background: '#ffffff',
              boxShadow: '0 1px 3px rgba(0,0,0,0.4), 0 0 1px rgba(0,0,0,0.2)',
              transition: 'left 0.22s cubic-bezier(0.32, 0.72, 0, 1)',
            }}
          />
        </span>
      </button>

      {promptOpen && !active && !open && (
        <form
          onSubmit={(e) => { e.preventDefault(); void set(true, key); }}
          style={{
            position: 'absolute', right: 0, top: 34, zIndex: 90, width: 250,
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
            <button type="button" onClick={() => setPromptOpen(false)} className="btn btn-ghost btn-sm">
              Cancel
            </button>
          </div>
          <p className="tiny" style={{ marginTop: 10 }}>
            Free seats, solo play allowed, and nothing counts toward the public stats.
          </p>
        </form>
      )}

      {error && (open || active) && (
        <span className="tiny" style={{ color: '#d97362', marginLeft: 8 }}>{error}</span>
      )}
    </div>
  );
}
