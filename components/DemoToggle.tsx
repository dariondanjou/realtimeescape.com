'use client';

import { useState } from 'react';

/**
 * Demo-mode switch in the site header.
 *
 * A pill toggle: accent-coloured and knob-right when demo mode is on, monochrome and knob-left
 * when off, so its state is readable at a glance without reading the label.
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
          gap: 8,
          padding: '4px 9px 4px 11px',
          borderRadius: 100,
          cursor: busy ? 'wait' : 'pointer',
          font: 'inherit',
          fontSize: 11,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          fontFamily: 'var(--font-mono)',
          transition: 'background 0.18s, border-color 0.18s, color 0.18s',
          // On: accent fill with dark text. Off: monochrome — no colour at all.
          background: active ? 'var(--accent)' : 'transparent',
          border: `1px solid ${active ? 'var(--accent)' : 'var(--border-strong)'}`,
          color: active ? 'var(--on-accent)' : 'var(--text-dim)',
          opacity: busy ? 0.6 : 1,
        }}
      >
        <span>demo</span>

        {/* Track */}
        <span
          aria-hidden="true"
          style={{
            position: 'relative',
            width: 26,
            height: 14,
            borderRadius: 100,
            flex: 'none',
            transition: 'background 0.18s',
            background: active ? 'rgba(4, 32, 46, 0.5)' : 'var(--structure-cool)',
          }}
        >
          {/* Knob */}
          <span
            style={{
              position: 'absolute',
              top: 2,
              left: active ? 14 : 2,
              width: 10,
              height: 10,
              borderRadius: '50%',
              transition: 'left 0.18s ease, background 0.18s',
              background: active ? '#ffffff' : 'var(--near-white)',
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
