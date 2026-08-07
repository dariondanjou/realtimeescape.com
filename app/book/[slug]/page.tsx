import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getGame, formatPrice } from '@/lib/catalog';
import { stripeConfigured, isTestMode } from '@/lib/stripe';
import { currentUser } from '@/lib/supabase';
import BookingForm from './BookingForm';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const game = getGame(slug);
  return { title: game ? `Book ${game.title}` : 'Book' };
}

export default async function BookPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const game = getGame(slug);
  if (!game) notFound();

  const user = await currentUser();

  return (
    <section className="section">
      <div className="wrap">
        <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1fr)', gap: 48 }}>
          <div>
            <span className="eyebrow eyebrow-dim">Booking</span>
            <h1 style={{ fontSize: 36, margin: '12px 0 8px' }}>{game.title}</h1>
            <p className="lede" style={{ marginBottom: 34 }}>
              {game.durationMinutes} minutes · {game.minPlayers}–{game.maxPlayers} players ·{' '}
              {formatPrice(game.pricePerSeatCents)} each · private to your group
            </p>

            <BookingForm
              game={game}
              paymentsLive={stripeConfigured()}
              testMode={isTestMode()}
              defaultEmail={user?.email ?? ''}
            />
          </div>

          <aside>
            <div className="panel" style={{ position: 'sticky', top: 84 }}>
              <h3 style={{ fontSize: 17, marginBottom: 14 }}>What happens next</h3>
              <ol className="small" style={{ paddingLeft: 18, display: 'grid', gap: 12 }}>
                <li>Stripe takes the payment. You come straight back here.</li>
                <li>You get a booking page with a private invite link for every seat.</li>
                <li>Send those links to your group however you like — text, chat, email.</li>
                <li>
                  The lobby opens 15 minutes before the start. Everyone picks an avatar and tests
                  their microphone.
                </li>
                <li>The room starts itself. Nobody from RealTimeEscape joins your session.</li>
              </ol>

              <hr className="rule" style={{ margin: '20px 0' }} />

              <h3 style={{ fontSize: 17, marginBottom: 10 }}>Before you book</h3>
              <ul className="small" style={{ paddingLeft: 18, display: 'grid', gap: 8 }}>
                <li>Everyone needs a desktop or laptop, not a phone.</li>
                <li>Chrome or Edge, updated. Headphones strongly recommended.</li>
                <li>Everyone needs a working microphone — the ending depends on talking.</li>
              </ul>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
