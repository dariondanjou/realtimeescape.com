import Stripe from 'stripe';

let cached: Stripe | null = null;

/** True when Stripe is configured. Booking pages show a clear message when it is not. */
export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function stripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set');
  // Pin the API version so Stripe dashboard upgrades cannot silently change our payloads.
  if (!cached) cached = new Stripe(key, { apiVersion: '2025-02-24.acacia' });
  return cached;
}

export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://realtimeescape.com').replace(/\/$/, '');
}

/** True while running against Stripe test keys — surfaced in the UI so nobody is confused. */
export function isTestMode(): boolean {
  return (process.env.STRIPE_SECRET_KEY ?? '').startsWith('sk_test_');
}
