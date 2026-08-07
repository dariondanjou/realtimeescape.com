'use client';

import { useState } from 'react';

export default function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard blocked — the value is visible and selectable regardless.
    }
  }

  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <input type="text" readOnly value={value} onFocus={(e) => e.currentTarget.select()} className="mono" style={{ fontSize: 13 }} />
      <button type="button" onClick={copy} className="btn btn-ghost btn-sm" style={{ flex: 'none' }}>
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}
