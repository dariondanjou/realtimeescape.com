import { NextResponse } from 'next/server';
import { balanceFor } from '@/lib/credit';

export const runtime = 'nodejs';

/**
 * Looks up the credit balance for an email so the booking form can show it before checkout.
 *
 * Returns a balance for any email that has one, which is by design — the same information is
 * already visible to anyone who reaches the checkout with that address, and the alternative
 * (silently surprising people with a discount at Stripe) is worse. No other player data is
 * exposed, and the balance is re-derived server-side at checkout regardless of what this said.
 */
export async function POST(req: Request) {
  let body: { email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });
  }

  const email = String(body.email ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ balanceCents: 0 });
  }

  const { balanceCents } = await balanceFor(email);
  return NextResponse.json({ balanceCents });
}
