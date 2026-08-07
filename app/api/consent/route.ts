import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase';

export const runtime = 'nodejs';

/**
 * Records a player's recording-consent choices.
 *
 * Consent is stored per seat per session, with a salted hash of the request IP and the user agent
 * so we can later prove *that* consent was given without retaining the IP itself.
 */
export async function POST(req: Request) {
  let body: {
    sessionId?: string;
    seatId?: string;
    voiceRecording?: boolean;
    mediaSocialUse?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });
  }

  const sessionId = String(body.sessionId ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) {
    return NextResponse.json({ error: 'Invalid session.' }, { status: 400 });
  }

  const salt = process.env.CONSENT_IP_SALT ?? 'rte-consent';
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    '';
  const ipHash = ip ? createHash('sha256').update(`${salt}:${ip}`).digest('hex') : null;

  // Media use is opt-OUT: absent means consented. Voice is opt-IN: absent means declined.
  const mediaSocialUse = body.mediaSocialUse !== false;

  const db = adminClient();
  const { error } = await db
    .from('rte_session_consents')
    .upsert(
      {
        session_id: sessionId,
        seat_id: body.seatId ?? null,
        voice_recording: Boolean(body.voiceRecording),
        media_social_use: mediaSocialUse,
        media_opted_out_at: mediaSocialUse ? null : new Date().toISOString(),
        marketing_use: mediaSocialUse,
        consented_at: new Date().toISOString(),
        ip_hash: ipHash,
        user_agent: req.headers.get('user-agent')?.slice(0, 400) ?? null,
      },
      { onConflict: 'session_id,seat_id' },
    );

  if (error) {
    return NextResponse.json({ error: 'Could not save your choices.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
