'use client';

import { useState } from 'react';
import { browserClient } from '@/lib/supabase-browser';

export default function SignInForm() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const supabase = browserClient();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) throw error;
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the link.');
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="notice notice-ok">
        Check <strong>{email}</strong> for a sign-in link. It expires in an hour.
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="panel">
      <div className="field">
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      {error && <div className="notice notice-warn" role="alert" style={{ marginBottom: 14 }}>{error}</div>}
      <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
        {busy ? 'Sending…' : 'Email me a sign-in link'}
      </button>
      <p className="tiny" style={{ marginTop: 12 }}>
        No password to forget. We email you a link that signs you in.
      </p>
    </form>
  );
}
