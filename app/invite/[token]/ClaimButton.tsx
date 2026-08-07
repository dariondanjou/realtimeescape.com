'use client';

import { useState } from 'react';

export default function ClaimButton({ token, amount }: { token: string; amount: string }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function claim(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not start checkout.');
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start checkout.');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={claim} style={{ marginTop: 22 }}>
      <div className="field">
        <label htmlFor="claim-email">Your email</label>
        <input
          id="claim-email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      {error && <div className="notice notice-warn" role="alert" style={{ marginBottom: 14 }}>{error}</div>}
      <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={busy}>
        {busy ? 'Opening checkout…' : `Claim my seat — ${amount}`}
      </button>
    </form>
  );
}
