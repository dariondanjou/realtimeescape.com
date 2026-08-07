import { randomBytes } from 'node:crypto';
import { adminClient } from './supabase';
import { getGame } from './catalog';

export type PaymentMode = 'host_pays_all' | 'split';
export type BookingKind = 'instant' | 'scheduled';

export type CreateBookingInput = {
  gameSlug: string;
  seatCount: number;
  paymentMode: PaymentMode;
  kind: BookingKind;
  scheduledFor?: string | null;
  hostEmail: string;
  hostUserId?: string | null;
};

export function inviteToken(): string {
  return randomBytes(24).toString('base64url');
}

/**
 * Validates a booking request against the catalog. Never trust the client for seat count,
 * price or player limits — the browser sends intent, this decides truth.
 */
export function validateBooking(input: CreateBookingInput) {
  const game = getGame(input.gameSlug);
  if (!game) return { ok: false as const, error: 'Unknown game.' };

  if (!Number.isInteger(input.seatCount)) return { ok: false as const, error: 'Seat count must be a whole number.' };
  if (input.seatCount < game.minPlayers || input.seatCount > game.maxPlayers) {
    return { ok: false as const, error: `${game.title} supports ${game.minPlayers}–${game.maxPlayers} players.` };
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.hostEmail)) {
    return { ok: false as const, error: 'Enter a valid email address.' };
  }

  if (input.kind === 'scheduled') {
    if (!input.scheduledFor) return { ok: false as const, error: 'Pick a date and time.' };
    const when = new Date(input.scheduledFor);
    if (Number.isNaN(when.getTime())) return { ok: false as const, error: 'That date could not be read.' };
    if (when.getTime() < Date.now() + 10 * 60_000) {
      return { ok: false as const, error: 'Scheduled games must start at least 10 minutes from now.' };
    }
    if (when.getTime() > Date.now() + 180 * 24 * 3600_000) {
      return { ok: false as const, error: 'Games can be scheduled up to 180 days ahead.' };
    }
  }

  const seatsToChargeNow = input.paymentMode === 'host_pays_all' ? input.seatCount : 1;
  return {
    ok: true as const,
    game,
    seatsToChargeNow,
    amountCents: seatsToChargeNow * game.pricePerSeatCents,
  };
}

/** Creates the booking, its seats and (for split payment) one invitation per unclaimed seat. */
export async function createBooking(input: CreateBookingInput) {
  const check = validateBooking(input);
  if (!check.ok) throw new Error(check.error);

  const db = adminClient();

  const { data: game, error: gameErr } = await db
    .from('rte_games')
    .select('id')
    .eq('slug', input.gameSlug)
    .single();
  if (gameErr || !game) throw new Error('Game catalog row missing — run supabase/migrations/0001_init.sql.');

  const { data: booking, error: bookingErr } = await db
    .from('rte_bookings')
    .insert({
      game_id: game.id,
      host_user_id: input.hostUserId ?? null,
      host_email: input.hostEmail,
      seat_count: input.seatCount,
      price_cents: check.game.pricePerSeatCents,
      payment_mode: input.paymentMode,
      kind: input.kind,
      scheduled_for: input.kind === 'scheduled' ? new Date(input.scheduledFor!).toISOString() : null,
      status: 'created',
    })
    .select('id')
    .single();
  if (bookingErr || !booking) throw new Error(bookingErr?.message ?? 'Could not create booking.');

  const seats = Array.from({ length: input.seatCount }, (_, i) => ({
    booking_id: booking.id,
    seat_index: i,
    claimed_by_user_id: i === 0 ? input.hostUserId ?? null : null,
    claimed_email: i === 0 ? input.hostEmail : null,
  }));

  const { data: seatRows, error: seatErr } = await db
    .from('rte_booking_seats')
    .insert(seats)
    .select('id, seat_index');
  if (seatErr) throw new Error(seatErr.message);

  // Split payment: every seat except the host's gets a claim token.
  if (input.paymentMode === 'split' && seatRows) {
    const expires = new Date(
      input.kind === 'scheduled'
        ? new Date(input.scheduledFor!).getTime()
        : Date.now() + 24 * 3600_000,
    ).toISOString();

    const invites = seatRows
      .filter((s) => s.seat_index > 0)
      .map((s) => ({
        booking_id: booking.id,
        seat_id: s.id,
        token: inviteToken(),
        expires_at: expires,
      }));
    if (invites.length) {
      const { error } = await db.from('rte_invitations').insert(invites);
      if (error) throw new Error(error.message);
    }
  }

  return { bookingId: booking.id as string, ...check };
}

export type BookingDetail = Awaited<ReturnType<typeof loadBooking>>;

export async function loadBooking(bookingId: string) {
  const db = adminClient();

  const { data: booking } = await db
    .from('rte_bookings')
    .select('*, rte_games(slug, title)')
    .eq('id', bookingId)
    .single();
  if (!booking) return null;

  const { data: seats } = await db
    .from('rte_booking_seats')
    .select('*')
    .eq('booking_id', bookingId)
    .order('seat_index');

  const { data: invites } = await db
    .from('rte_invitations')
    .select('id, seat_id, token, state, expires_at')
    .eq('booking_id', bookingId);

  return { booking, seats: seats ?? [], invites: invites ?? [] };
}
