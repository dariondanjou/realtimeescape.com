import 'server-only';
import { adminClient } from './supabase';

/**
 * Credit redemption.
 *
 * Credit is minted when a session is compromised (see docs/REFUNDS_RECORDING_AND_FEEDBACK.md).
 * This is the other half: spending it.
 *
 * Two rules the implementation exists to enforce:
 *
 *   1. Credit reduces the amount charged, and can reduce it to zero — but it is never converted
 *      to money and never leaves the system. The only way out of the ledger is a seat.
 *   2. It is applied INSIDE the checkout transaction, server-side, from the ledger balance. The
 *      browser never tells us how much credit somebody has.
 */

export type CreditApplication = {
  balanceCents: number;
  appliedCents: number;
  remainingDueCents: number;
  playerId: string | null;
};

/** Current balance for an email. Zero when the player is unknown or the tables are absent. */
export async function balanceFor(email: string): Promise<{ playerId: string | null; balanceCents: number }> {
  try {
    const db = adminClient();
    const { data: player } = await db
      .from('rte_players')
      .select('id')
      .eq('email', email.trim().toLowerCase())
      .maybeSingle();

    if (!player) return { playerId: null, balanceCents: 0 };

    const { data: balance } = await db.rpc('rte_credit_balance_cents', { p_player_id: player.id });
    return { playerId: player.id, balanceCents: Math.max(0, Number(balance ?? 0)) };
  } catch {
    return { playerId: null, balanceCents: 0 };
  }
}

/** Works out how much credit to apply to a charge, without spending anything yet. */
export async function planApplication(email: string, amountCents: number): Promise<CreditApplication> {
  const { playerId, balanceCents } = await balanceFor(email);
  const appliedCents = Math.min(balanceCents, amountCents);
  return {
    playerId,
    balanceCents,
    appliedCents,
    remainingDueCents: amountCents - appliedCents,
  };
}

/**
 * Spends credit against a booking. Writes a negative ledger entry, which the database trigger
 * rejects if it would take the balance below zero — so a race between two concurrent checkouts
 * fails loudly rather than double-spending.
 *
 * Returns false if the spend was rejected; the caller must then charge the full amount.
 */
export async function spendCredit(
  playerId: string,
  amountCents: number,
  bookingId: string,
  note: string,
): Promise<boolean> {
  if (amountCents <= 0) return true;
  try {
    const { error } = await adminClient().from('rte_credit_ledger').insert({
      player_id: playerId,
      amount_cents: -amountCents,
      kind: 'spent',
      booking_id: bookingId,
      note,
      created_by: 'checkout',
    });
    return !error;
  } catch {
    return false;
  }
}

/** Reverses a spend when checkout does not complete, so credit is never silently lost. */
export async function refundCreditToLedger(
  playerId: string,
  amountCents: number,
  bookingId: string,
): Promise<void> {
  if (amountCents <= 0) return;
  try {
    await adminClient().from('rte_credit_ledger').insert({
      player_id: playerId,
      amount_cents: amountCents,
      kind: 'goodwill',
      booking_id: bookingId,
      note: 'Returned — checkout was not completed',
      created_by: 'checkout',
    });
  } catch {
    // Best effort. A stuck spend is recoverable by an admin; a lost one is not, which is why
    // the spend happens as late as possible in the checkout path.
  }
}
