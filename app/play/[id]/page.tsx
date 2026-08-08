import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata, Viewport } from 'next';
import { loadBooking } from '@/lib/bookings';
import { gameClientAvailable } from '@/lib/demo';
import Boarding from './Boarding';

export const metadata: Metadata = { title: 'Burn Window', robots: { index: false } };

// Pinch-zoom fights the touch controls mid-game; the game page pins the viewport.
export const viewport: Viewport = { width: 'device-width', initialScale: 1, maximumScale: 1, userScalable: false };

export default async function PlayPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ name?: string }>;
}) {
  const { id } = await params;
  const { name } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const data = await loadBooking(id);
  if (!data) notFound();

  const { booking, seats } = data;
  const allPaid = seats.length > 0 && seats.every((s) => s.paid);

  if (!allPaid) {
    return (
      <Gate title="This booking is not ready to fly">
        {seats.filter((s) => s.paid).length} of {seats.length} seats are paid. The ship boards when
        the whole group is in. <Link href={`/booking/${id}`} style={{ color: 'var(--accent-bright)' }}>Back to the booking.</Link>
      </Gate>
    );
  }

  // Local dev: NEXT_PUBLIC_GAME_SERVER_URL may point at localhost, which gameClientAvailable
  // rejects for production honesty. Allow it here so the game is testable before deploy.
  const serverUrl = process.env.NEXT_PUBLIC_GAME_SERVER_URL ?? '';
  const usable = gameClientAvailable() || /^wss?:\/\/(localhost|127\.0\.0\.1)/.test(serverUrl);

  if (!usable) {
    return (
      <Gate title="The ship is not accepting boarders yet">
        The game server has not been deployed. Once it is,{' '}
        <span className="mono">NEXT_PUBLIC_GAME_SERVER_URL</span> points at it and this page comes
        alive. <Link href="/demo" style={{ color: 'var(--accent-bright)' }}>Play the final manoeuvre</Link>{' '}
        in the meantime.
      </Gate>
    );
  }

  const displayName =
    (name ?? '').slice(0, 24).trim() ||
    (booking.host_email as string | null)?.split('@')[0] ||
    'Passenger';

  return <Boarding bookingId={id} serverUrl={serverUrl} displayName={displayName} />;
}

function Gate({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="section">
      <div className="wrap narrow">
        <div className="panel panel-accent">
          <h1 style={{ fontSize: 24, marginBottom: 10 }}>{title}</h1>
          <p className="small">{children}</p>
        </div>
      </div>
    </section>
  );
}
