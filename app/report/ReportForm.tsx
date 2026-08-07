'use client';

import { useState } from 'react';

type Result = {
  reportId: string;
  playerNumber?: number;
  status: string;
  severity?: string | null;
  creditCents?: number;
  message: string;
};

export default function ReportForm({ sessionId = '' }: { sessionId?: string }) {
  const [email, setEmail] = useState('');
  const [session, setSession] = useState(sessionId);
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/report-issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, sessionId: session || null, description }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not submit your report.');
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit your report.');
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    const credit = result.creditCents ?? 0;
    return (
      <div className={`panel ${credit > 0 ? 'panel-accent' : ''}`}>
        <h2 style={{ fontSize: 20, marginBottom: 12 }}>
          {credit > 0 ? 'Credit has been added to your account' : 'Report received'}
        </h2>
        <p className="small" style={{ marginBottom: 14 }}>{result.message}</p>

        {credit > 0 && (
          <div className="notice notice-ok" style={{ marginBottom: 14 }}>
            <strong>${(credit / 100).toFixed(2)} in credit</strong> is on your account, ready to
            spend on a replay or on any other game. Credit has no cash value and is not refundable.
          </div>
        )}

        {result.status === 'awaiting_review' && (
          <p className="small" style={{ marginBottom: 14 }}>
            This one is going to a person rather than being decided automatically — either because it
            looks serious, or because the session record did not clearly settle it. We would rather a
            human made that call.
          </p>
        )}

        <dl style={{ marginTop: 6 }}>
          <div className="kv"><dt>Reference</dt><dd className="mono">{result.reportId.slice(0, 8)}</dd></div>
          {result.playerNumber != null && (
            <div className="kv"><dt>Your player number</dt><dd className="mono">#{result.playerNumber}</dd></div>
          )}
        </dl>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="panel">
      <div className="field">
        <label htmlFor="email">Your email</label>
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

      <div className="field">
        <label htmlFor="session">Session ID (optional, but it helps a lot)</label>
        <input
          id="session"
          type="text"
          placeholder="From your debrief page or results email"
          value={session}
          onChange={(e) => setSession(e.target.value)}
        />
        <p className="tiny" style={{ marginTop: 6 }}>
          With this we can replay exactly what happened. Without it we are working from your
          description alone.
        </p>
      </div>

      <div className="field">
        <label htmlFor="description">What happened?</label>
        <textarea
          id="description"
          required
          rows={7}
          minLength={20}
          maxLength={8000}
          placeholder="Tell us what went wrong, roughly when in the hour it happened, and what you were trying to do at the time."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <p className="tiny" style={{ marginTop: 6 }}>
          Specifics beat adjectives. &ldquo;The starboard thruster dial stopped responding about
          forty minutes in&rdquo; is far more useful than &ldquo;it was broken&rdquo;.
        </p>
      </div>

      {error && <div className="notice notice-warn" role="alert" style={{ marginBottom: 14 }}>{error}</div>}

      <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
        {busy ? 'Checking your session record…' : 'Submit report'}
      </button>
      <p className="tiny center" style={{ marginTop: 12 }}>
        Qualifying issues are resolved with account credit. We do not issue refunds.
      </p>
    </form>
  );
}
