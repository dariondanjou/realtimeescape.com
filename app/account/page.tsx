import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { currentUser, adminClient, supabaseConfigured } from '@/lib/supabase';
import { formatPrice } from '@/lib/catalog';

export const metadata: Metadata = { title: 'Your account', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  if (!supabaseConfigured()) redirect('/account/sign-in');

  const user = await currentUser();
  if (!user) redirect('/account/sign-in');

  const db = adminClient();
  const { data: bookings } = await db
    .from('rte_bookings')
    .select('id, status, kind, scheduled_for, seat_count, price_cents, created_at, rte_games(title)')
    .or(`host_user_id.eq.${user.id},host_email.eq.${user.email}`)
    .order('created_at', { ascending: false })
    .limit(25);

  return (
    <section className="section">
      <div className="wrap narrow">
        <span className="eyebrow eyebrow-dim">Account</span>
        <h1 style={{ fontSize: 32, margin: '12px 0 6px' }}>{user.email}</h1>
        <p className="small" style={{ marginBottom: 34 }}>
          Everything you have booked, and everywhere you have been.
        </p>

        <h2 style={{ fontSize: 20, marginBottom: 14 }}>Your bookings</h2>

        {!bookings?.length ? (
          <div className="panel">
            <p className="small" style={{ marginBottom: 16 }}>You have not booked a game yet.</p>
            <Link href="/book/burn-window" className="btn btn-primary btn-sm">Book Burn Window</Link>
          </div>
        ) : (
          <div className="stack">
            {bookings.map((b) => (
              <Link key={b.id} href={`/booking/${b.id}`} className="panel" style={{ display: 'block', padding: 18 }}>
                <div className="spread">
                  <div>
                    <strong>{(b.rte_games as { title?: string } | null)?.title ?? 'Burn Window'}</strong>
                    <div className="tiny">
                      {b.scheduled_for
                        ? new Date(b.scheduled_for).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
                        : 'Play when ready'}
                      {' · '}{b.seat_count} seats · {formatPrice(b.price_cents)} each
                    </div>
                  </div>
                  <span className={`badge ${b.status === 'confirmed' ? 'badge-live' : ''}`}>{b.status.replace('_', ' ')}</span>
                </div>
              </Link>
            ))}
          </div>
        )}

        <form action="/auth/sign-out" method="post" style={{ marginTop: 40 }}>
          <button type="submit" className="btn btn-ghost btn-sm">Sign out</button>
        </form>
      </div>
    </section>
  );
}
