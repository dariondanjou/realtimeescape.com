import { NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase';
import { collate, applyCollation, collationConfigured } from '@/lib/feedback';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * Collation sweep.
 *
 * Feedback is always stored immediately and collated separately, so an outage in the model or a
 * lapsed API key can never lose what somebody said — it just leaves `topic_id` null. This route
 * picks up that backlog.
 *
 * Runs hourly (see vercel.json) and can be triggered by hand. Authorised with CRON_SECRET, which
 * Vercel Cron sends automatically as a bearer token.
 *
 * GET and POST both work: Vercel Cron issues a GET, and POST is the more natural verb for a
 * manual trigger.
 */
export async function GET(req: Request) {
  return sweep(req);
}

export async function POST(req: Request) {
  return sweep(req);
}

async function sweep(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET is not configured.' }, { status: 503 });
  }

  const auth = req.headers.get('authorization') ?? '';
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Not authorised.' }, { status: 401 });
  }

  if (!collationConfigured()) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not set.' }, { status: 503 });
  }

  const db = adminClient();

  // Only text is collatable. Audio waits for transcription, which sets `body` and flips
  // transcription_state to 'done' — at which point a later sweep picks it up here.
  const { data: pending, error } = await db
    .from('rte_feedback')
    .select('id, body, context, at_ms, zone')
    .is('topic_id', null)
    .eq('medium', 'text')
    .not('body', 'is', null)
    .order('created_at')
    .limit(40);

  if (error) {
    return NextResponse.json({ error: 'Could not read the feedback backlog.' }, { status: 500 });
  }
  if (!pending?.length) {
    return NextResponse.json({ swept: 0, message: 'Nothing waiting to be collated.' });
  }

  const results: { id: string; topicId: string | null; joinedExisting: boolean }[] = [];
  let failed = 0;

  // Sequential rather than parallel: each collation reads the topic list, and running them
  // concurrently would have several requests propose the same "new" topic from an identical
  // stale snapshot. The slug upsert would converge them, but the weights would be wrong.
  for (const row of pending) {
    try {
      const { collation, model } = await collate(row.body as string, {
        context: row.context as string,
        atMs: row.at_ms as number | null,
        zone: row.zone as string | null,
      });
      const topicId = await applyCollation(row.id as string, collation, model);
      results.push({
        id: row.id as string,
        topicId,
        joinedExisting: Boolean(collation.matchedTopicId),
      });
    } catch {
      failed++;
    }
  }

  return NextResponse.json({
    swept: results.length,
    failed,
    newTopics: results.filter((r) => !r.joinedExisting).length,
    joinedExisting: results.filter((r) => r.joinedExisting).length,
  });
}
