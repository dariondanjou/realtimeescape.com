import { NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase';

export const runtime = 'nodejs';

/**
 * Records a finished game session, called by the game server (see BurnWindowRoom.reportResult).
 * Authorised with CRON_SECRET as a bearer token. Best-effort on the game side — the outcome was
 * already decided and broadcast; this is the durable record and the player-number trigger.
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'Not configured.' }, { status: 503 });
  if ((req.headers.get('authorization') ?? '') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Not authorised.' }, { status: 401 });
  }

  let body: {
    bookingId?: string; seed?: string; result?: string;
    timeRemainingMs?: number; hintsUsed?: number; players?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });
  }

  const bookingId = String(body.bookingId ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(bookingId)) {
    return NextResponse.json({ error: 'Invalid booking.' }, { status: 400 });
  }
  const result = body.result === 'escaped' ? 'escaped' : 'failed';
  const db = adminClient();
  const now = new Date().toISOString();

  const { data: session } = await db
    .from('rte_game_sessions')
    .select('id')
    .eq('booking_id', bookingId)
    .maybeSingle();

  if (session) {
    await db.from('rte_game_sessions').update({
      phase: result,
      result,
      time_remaining_ms: Math.max(0, Math.round(Number(body.timeRemainingMs) || 0)),
      hints_used: Math.max(0, Math.round(Number(body.hintsUsed) || 0)),
      locked_player_count: Math.max(1, Math.round(Number(body.players) || 1)),
      ended_at: now,
    }).eq('id', session.id);
  }

  await db.from('rte_bookings').update({ status: 'completed', updated_at: now }).eq('id', bookingId);

  // First-flight stamp for the player ticker — demo bookings are excluded by the stats view.
  const { data: booking } = await db
    .from('rte_bookings')
    .select('host_email, is_demo')
    .eq('id', bookingId)
    .maybeSingle();

  if (booking?.host_email) {
    await db.rpc('rte_claim_player_number', { p_email: booking.host_email });
    await db
      .from('rte_players')
      .update({ first_played_at: now, is_demo: Boolean(booking.is_demo) })
      .eq('email', booking.host_email.toLowerCase())
      .is('first_played_at', null);
  }

  return NextResponse.json({ ok: true });
}
