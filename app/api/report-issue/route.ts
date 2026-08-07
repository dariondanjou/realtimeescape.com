import { NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase';
import { gatherEvidence, triageIssue, decideOutcome, triageConfigured } from '@/lib/triage';
import { getGame } from '@/lib/catalog';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * A player reports that their session was compromised.
 *
 * The report is always recorded, whether or not triage can run — a player must never lose their
 * report because a downstream service was down. Triage then classifies it against the session
 * record, and only a cheap, confident verdict resolves automatically.
 */
export async function POST(req: Request) {
  let body: { sessionId?: string; email?: string; description?: string; occurredAtMs?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });
  }

  const email = String(body.email ?? '').trim().toLowerCase();
  const description = String(body.description ?? '').trim();
  const sessionId = body.sessionId ? String(body.sessionId) : null;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  }
  if (description.length < 20) {
    return NextResponse.json(
      { error: 'Tell us a bit more about what happened — at least a sentence or two.' },
      { status: 400 },
    );
  }
  if (description.length > 8000) {
    return NextResponse.json({ error: 'That report is too long.' }, { status: 400 });
  }

  const db = adminClient();

  // Resolve the player so the report and any credit attach to a permanent identity.
  const { data: playerNumber } = await db.rpc('rte_claim_player_number', { p_email: email });
  const { data: player } = await db
    .from('rte_players')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  const { data: report, error: insertErr } = await db
    .from('rte_issue_reports')
    .insert({
      session_id: sessionId,
      player_id: player?.id ?? null,
      reporter_email: email,
      description,
      occurred_at_ms: body.occurredAtMs ?? null,
      status: triageConfigured() ? 'triaging' : 'awaiting_review',
    })
    .select('id')
    .single();

  if (insertErr || !report) {
    return NextResponse.json({ error: 'Could not record your report. Please email support.' }, { status: 500 });
  }

  // Report is safely stored. Everything past here is best-effort.
  if (!triageConfigured()) {
    return NextResponse.json({
      reportId: report.id,
      playerNumber,
      status: 'awaiting_review',
      message:
        'Thank you — your report is logged and a person will review it. We aim to respond within ' +
        'one business day.',
    });
  }

  try {
    const evidence = sessionId ? await gatherEvidence(sessionId) : null;
    const { verdict, model } = await triageIssue({ description, occurredAtMs: body.occurredAtMs }, evidence);

    const seatPrice = getGame('burn-window')?.pricePerSeatCents ?? 2000;
    const outcome = decideOutcome(verdict, seatPrice);

    await db
      .from('rte_issue_reports')
      .update({
        ai_severity: verdict.severity,
        ai_confidence: verdict.confidence,
        ai_rationale: verdict.rationale,
        ai_evidence: verdict.evidence,
        ai_model: model,
        ai_triaged_at: new Date().toISOString(),
        severity: outcome.autoResolved ? verdict.severity : null,
        resolution: outcome.resolution,
        credit_cents: outcome.creditCents,
        status: outcome.status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', report.id);

    // Mint credit only where the deterministic step authorised it.
    if (outcome.creditCents > 0 && player?.id) {
      await db.from('rte_credit_ledger').insert({
        player_id: player.id,
        amount_cents: outcome.creditCents,
        kind: verdict.severity === 'major' ? 'issue_major' : 'issue_moderate',
        session_id: sessionId,
        issue_report_id: report.id,
        note: verdict.rationale.slice(0, 500),
        created_by: 'triage',
      });
    }

    return NextResponse.json({
      reportId: report.id,
      playerNumber,
      status: outcome.status,
      severity: outcome.autoResolved ? verdict.severity : null,
      creditCents: outcome.creditCents,
      message: outcome.autoResolved
        ? verdict.playerFacingMessage
        : 'Thank you — your report is with a person now. We aim to respond within one business day.',
    });
  } catch {
    // Triage failed. The report survives and a human picks it up.
    await db
      .from('rte_issue_reports')
      .update({ status: 'awaiting_review', updated_at: new Date().toISOString() })
      .eq('id', report.id);

    return NextResponse.json({
      reportId: report.id,
      playerNumber,
      status: 'awaiting_review',
      message:
        'Thank you — your report is logged and a person will review it. We aim to respond within ' +
        'one business day.',
    });
  }
}
