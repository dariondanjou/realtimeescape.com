'use client';

import { useMemo, useState } from 'react';
import type { Game } from '@/lib/catalog';
import { formatPrice } from '@/lib/catalog';

type Props = { game: Game; paymentsLive: boolean; testMode: boolean; defaultEmail: string };

export default function BookingForm({ game, paymentsLive, testMode, defaultEmail }: Props) {
  const [seatCount, setSeatCount] = useState(Math.max(game.minPlayers, 5));
  const [kind, setKind] = useState<'instant' | 'scheduled'>('instant');
  const [paymentMode, setPaymentMode] = useState<'host_pays_all' | 'split'>('host_pays_all');
  const [scheduledFor, setScheduledFor] = useState('');
  const [hostEmail, setHostEmail] = useState(defaultEmail);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const seatsNow = paymentMode === 'host_pays_all' ? seatCount : 1;
  const dueNow = seatsNow * game.pricePerSeatCents;

  const minLocal = useMemo(() => {
    const d = new Date(Date.now() + 20 * 60_000);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameSlug: game.slug,
          seatCount,
          paymentMode,
          kind,
          scheduledFor: kind === 'scheduled' ? new Date(scheduledFor).toISOString() : null,
          hostEmail,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong.');
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      {testMode && (
        <div className="notice notice-warn" style={{ marginBottom: 22 }}>
          Stripe is in <strong>test mode</strong>. Use card 4242 4242 4242 4242 with any future
          expiry and any CVC. No money moves.
        </div>
      )}

      {!paymentsLive && (
        <div className="notice notice-warn" style={{ marginBottom: 22 }}>
          Payments are not switched on yet, so checkout is disabled. Everything else on this page
          is live.
        </div>
      )}

      <fieldset style={{ border: 0, marginBottom: 26 }}>
        <legend className="eyebrow eyebrow-dim" style={{ marginBottom: 12 }}>1 · When</legend>
        <div className="grid grid-2" style={{ gap: 12 }}>
          <Choice
            checked={kind === 'instant'}
            onSelect={() => setKind('instant')}
            title="Play now"
            body="Creates a private lobby immediately and gives you a link to send your group."
          />
          <Choice
            checked={kind === 'scheduled'}
            onSelect={() => setKind('scheduled')}
            title="Schedule"
            body="Pick a date and time. The lobby opens 15 minutes before it starts."
          />
        </div>
        {kind === 'scheduled' && (
          <div className="field" style={{ marginTop: 16 }}>
            <label htmlFor="when">Date and time (your local time zone)</label>
            <input
              id="when"
              type="datetime-local"
              required
              min={minLocal}
              value={scheduledFor}
              onChange={(e) => setScheduledFor(e.target.value)}
            />
          </div>
        )}
      </fieldset>

      <fieldset style={{ border: 0, marginBottom: 26 }}>
        <legend className="eyebrow eyebrow-dim" style={{ marginBottom: 12 }}>2 · How many of you</legend>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {Array.from({ length: game.maxPlayers - game.minPlayers + 1 }, (_, i) => game.minPlayers + i).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setSeatCount(n)}
              className={`btn btn-sm ${seatCount === n ? 'btn-primary' : 'btn-ghost'}`}
              style={{ minWidth: 46 }}
              aria-pressed={seatCount === n}
            >
              {n}
            </button>
          ))}
        </div>
        <p className="tiny" style={{ marginTop: 10 }}>
          Best with {game.recommended}. The ending needs at least one person in the cockpit and two
          at separate thruster stations.
        </p>
      </fieldset>

      <fieldset style={{ border: 0, marginBottom: 26 }}>
        <legend className="eyebrow eyebrow-dim" style={{ marginBottom: 12 }}>3 · Who pays</legend>
        <div className="grid grid-2" style={{ gap: 12 }}>
          <Choice
            checked={paymentMode === 'host_pays_all'}
            onSelect={() => setPaymentMode('host_pays_all')}
            title="I'll pay for everyone"
            body={`One payment of ${formatPrice(seatCount * game.pricePerSeatCents)} now. Send everyone a link and they just show up.`}
          />
          <Choice
            checked={paymentMode === 'split'}
            onSelect={() => setPaymentMode('split')}
            title="Everyone pays their own"
            body={`You pay ${formatPrice(game.pricePerSeatCents)} for your seat. Each friend gets a private link to pay for theirs.`}
          />
        </div>
      </fieldset>

      <fieldset style={{ border: 0, marginBottom: 26 }}>
        <legend className="eyebrow eyebrow-dim" style={{ marginBottom: 12 }}>4 · Where we send it</legend>
        <div className="field">
          <label htmlFor="email">Your email</label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            value={hostEmail}
            onChange={(e) => setHostEmail(e.target.value)}
          />
          <p className="tiny" style={{ marginTop: 6 }}>
            Booking confirmation, invite links and your results go here.
          </p>
        </div>
      </fieldset>

      {/* The no-refund term is the one commercial condition a buyer most needs to have seen.
          It is acknowledged explicitly rather than buried in a linked document. */}
      <div className="panel" style={{ borderColor: 'var(--accent-deep)', marginBottom: 18 }}>
        <label
          style={{
            display: 'flex', gap: 11, alignItems: 'flex-start', cursor: 'pointer',
            margin: 0, color: 'inherit', fontSize: 'inherit',
          }}
        >
          <input
            type="checkbox"
            required
            checked={acceptedTerms}
            onChange={(e) => setAcceptedTerms(e.target.checked)}
            style={{ width: 17, height: 17, marginTop: 3, flex: 'none', accentColor: 'var(--accent)' }}
          />
          <span className="small">
            I understand this is a <strong>premium beta experience</strong> and that{' '}
            <strong>all sales are final</strong>. If a problem significantly compromises the
            experience, I will receive <strong>account credit</strong> toward a replay or another
            game — <strong>not a refund</strong>. Credit has no cash value. I have read the{' '}
            <a
              href="/legal/terms"
              target="_blank"
              rel="noreferrer"
              style={{ color: 'var(--accent-bright)', textDecoration: 'underline' }}
            >
              terms
            </a>.
          </span>
        </label>
      </div>

      <div className="panel" style={{ background: 'var(--bg)' }}>
        <div className="spread">
          <div>
            <div className="tiny mono" style={{ textTransform: 'uppercase', letterSpacing: '0.1em' }}>Due now</div>
            <div style={{ fontSize: 30, marginTop: 2 }}>{formatPrice(dueNow)}</div>
          </div>
          <div className="small" style={{ textAlign: 'right', color: 'var(--text-faint)' }}>
            {seatsNow} of {seatCount} {seatCount === 1 ? 'seat' : 'seats'}
            <br />
            {formatPrice(game.pricePerSeatCents)} per player
          </div>
        </div>

        {error && (
          <div className="notice notice-warn" style={{ marginTop: 16 }} role="alert">{error}</div>
        )}

        <button
          type="submit"
          className="btn btn-primary btn-block btn-lg"
          style={{ marginTop: 18 }}
          disabled={busy || !paymentsLive || !acceptedTerms}
        >
          {busy
            ? 'Opening checkout…'
            : acceptedTerms
              ? `Pay ${formatPrice(dueNow)} and create the booking`
              : 'Please accept the terms above'}
        </button>
        <p className="tiny center" style={{ marginTop: 12 }}>
          Card details are handled entirely by Stripe. We never see or store them.
        </p>
      </div>
    </form>
  );
}

function Choice({
  checked, onSelect, title, body,
}: { checked: boolean; onSelect: () => void; title: string; body: string }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={checked}
      className="panel"
      style={{
        textAlign: 'left',
        cursor: 'pointer',
        borderColor: checked ? 'var(--accent)' : 'var(--border)',
        background: checked ? 'rgba(200,106,50,0.07)' : 'var(--bg-panel)',
        padding: 18,
        font: 'inherit',
        color: 'inherit',
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 5 }}>{title}</div>
      <div className="small">{body}</div>
    </button>
  );
}
