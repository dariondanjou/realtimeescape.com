import { NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase';
import { collate, applyCollation, collationConfigured } from '@/lib/feedback';

export const runtime = 'nodejs';
export const maxDuration = 300;

const CONTEXTS = ['in_game', 'lobby', 'debrief', 'booking', 'site', 'other'] as const;

/**
 * Accepts a piece of player feedback — written, or an audio recording.
 *
 * Storing the feedback and collating it are separated deliberately. The store always succeeds;
 * collation is best-effort. Feedback that arrives while the model is unavailable simply sits with
 * topic_id null and gets picked up by the next collation sweep, so nothing a player said is ever
 * lost to an outage.
 */
export async function POST(req: Request) {
  const contentType = req.headers.get('content-type') ?? '';
  const db = adminClient();

  let body = '';
  let medium: 'text' | 'audio' = 'text';
  let audioKey: string | null = null;
  let audioDurationMs: number | null = null;
  let context = 'other';
  let sessionId: string | null = null;
  let email: string | null = null;
  let atMs: number | null = null;
  let zone: string | null = null;

  if (contentType.includes('multipart/form-data')) {
    // Audio feedback: store the recording, queue it for transcription.
    const form = await req.formData();
    const audio = form.get('audio');
    if (!(audio instanceof Blob)) {
      return NextResponse.json({ error: 'No audio was received.' }, { status: 400 });
    }
    if (audio.size > 25 * 1024 * 1024) {
      return NextResponse.json({ error: 'That recording is too long.' }, { status: 413 });
    }

    medium = 'audio';
    context = String(form.get('context') ?? 'other');
    sessionId = (form.get('sessionId') as string) || null;
    email = ((form.get('email') as string) || '').trim().toLowerCase() || null;
    atMs = form.get('atMs') ? Number(form.get('atMs')) : null;
    zone = (form.get('zone') as string) || null;
    audioDurationMs = form.get('durationMs') ? Number(form.get('durationMs')) : null;

    const key = `feedback/${crypto.randomUUID()}.webm`;
    const { error: uploadErr } = await db.storage
      .from('feedback-audio')
      .upload(key, await audio.arrayBuffer(), {
        contentType: audio.type || 'audio/webm',
        upsert: false,
      });

    if (uploadErr) {
      // Storage bucket missing or unreachable — record the attempt rather than dropping it.
      audioKey = null;
    } else {
      audioKey = key;
    }
  } else {
    let json: Record<string, unknown>;
    try {
      json = await req.json();
    } catch {
      return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });
    }
    body = String(json.body ?? '').trim();
    context = String(json.context ?? 'other');
    sessionId = json.sessionId ? String(json.sessionId) : null;
    email = json.email ? String(json.email).trim().toLowerCase() : null;
    atMs = json.atMs != null ? Number(json.atMs) : null;
    zone = json.zone ? String(json.zone) : null;

    if (body.length < 3) {
      return NextResponse.json({ error: 'Tell us a little more.' }, { status: 400 });
    }
    if (body.length > 8000) {
      return NextResponse.json({ error: 'That is longer than we can accept.' }, { status: 400 });
    }
  }

  if (!CONTEXTS.includes(context as (typeof CONTEXTS)[number])) context = 'other';
  if (sessionId && !/^[0-9a-f-]{36}$/i.test(sessionId)) sessionId = null;

  let playerId: string | null = null;
  if (email) {
    const { data: player } = await db.from('rte_players').select('id').eq('email', email).maybeSingle();
    playerId = player?.id ?? null;
  }

  const { data: feedback, error } = await db
    .from('rte_feedback')
    .insert({
      session_id: sessionId,
      player_id: playerId,
      email,
      medium,
      body: medium === 'text' ? body : null,
      audio_storage_key: audioKey,
      audio_duration_ms: audioDurationMs,
      transcription_state: medium === 'audio' ? 'pending' : 'not_applicable',
      context,
      at_ms: Number.isFinite(atMs) ? atMs : null,
      zone,
    })
    .select('id')
    .single();

  if (error || !feedback) {
    return NextResponse.json({ error: 'Could not save your feedback.' }, { status: 500 });
  }

  // Audio waits for transcription before it can be collated.
  if (medium === 'audio') {
    return NextResponse.json({
      id: feedback.id,
      queued: true,
      message: 'Thanks — we have your recording and it goes into the queue with everything else.',
    });
  }

  if (!collationConfigured()) {
    return NextResponse.json({ id: feedback.id, queued: true, message: 'Thanks — noted.' });
  }

  try {
    const { collation, model } = await collate(body, { context, atMs, zone });
    const topicId = await applyCollation(feedback.id, collation, model);
    return NextResponse.json({
      id: feedback.id,
      topicId,
      kind: collation.kind,
      joinedExisting: Boolean(collation.matchedTopicId),
      message: collation.matchedTopicId
        ? 'Thanks — others have raised this too, so your report just pushed it up our list.'
        : 'Thanks — this is a new one for us and it is now on the list.',
    });
  } catch {
    return NextResponse.json({
      id: feedback.id,
      queued: true,
      message: 'Thanks — noted, and it will be sorted with the rest shortly.',
    });
  }
}
