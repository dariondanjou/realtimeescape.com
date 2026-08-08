import { NextResponse } from 'next/server';
import { DEMO_COOKIE, demoAvailable, demoOpen } from '@/lib/demo';

export const runtime = 'nodejs';

/**
 * Turns demo mode on or off.
 *
 * When DEMO_MODE_OPEN is 'true' anyone may enable it with one click; otherwise the shared key is
 * required. Either way the cookie stores the key itself rather than a boolean, so a forged
 * `rte_demo=true` is worthless — the server compares it against DEMO_MODE_KEY on every request
 * rather than trusting the client's claim.
 */
export async function POST(req: Request) {
  if (!demoAvailable()) {
    return NextResponse.json({ error: 'Demo mode is not enabled on this deployment.' }, { status: 404 });
  }

  let body: { enable?: boolean; key?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });
  }

  if (!body.enable) {
    const res = NextResponse.json({ demo: false });
    res.cookies.set(DEMO_COOKIE, '', { maxAge: 0, path: '/' });
    return res;
  }

  // Open mode skips the passkey entirely.
  if (!demoOpen() && String(body.key ?? '') !== process.env.DEMO_MODE_KEY) {
    return NextResponse.json({ error: 'That key is not right.' }, { status: 403 });
  }

  const res = NextResponse.json({ demo: true });
  res.cookies.set(DEMO_COOKIE, process.env.DEMO_MODE_KEY!, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
