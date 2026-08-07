import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { adminClient } from './supabase';

/**
 * Issue triage.
 *
 * The terms promise that a reported problem is judged against what actually happened in the
 * session, not against how upset the report sounds. This module assembles the recorded evidence
 * for a session and asks Claude to classify the report as minor / moderate / major.
 *
 * Two things matter more than the model choice:
 *
 *   1. The model sees EVIDENCE, not just the complaint. It is given the session's event log,
 *      input log, adjustments and outcome, and is told to cite specific events. A report with no
 *      corroborating evidence cannot be graded major.
 *   2. The model NEVER issues credit. It produces a recommendation with a confidence score; a
 *      separate deterministic step decides what that recommendation is allowed to do, and
 *      anything expensive or uncertain is routed to a human. See applyTriage() below.
 */

export type Severity = 'minor' | 'moderate' | 'major';

export type TriageVerdict = {
  severity: Severity;
  confidence: number;
  rationale: string;
  evidence: string[];
  playerFacingMessage: string;
};

export function triageConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    severity: {
      type: 'string',
      enum: ['minor', 'moderate', 'major'],
      description:
        'major: the experience was significantly compromised — the team could not finish, a puzzle ' +
        'became unsolvable, the server failed, or a defect consumed enough of the clock to change ' +
        'the outcome. moderate: a real disruption, but the game stayed winnable. minor: cosmetic, ' +
        'brief, or with no corroborating evidence in the session record.',
    },
    confidence: {
      type: 'number',
      description: 'Confidence in this classification, 0 to 1. Be honest; low confidence routes to a human.',
    },
    rationale: {
      type: 'string',
      description: 'Two or three sentences explaining the classification, referring to the session record.',
    },
    evidence: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Specific events, timestamps or log lines from the supplied session record that support the ' +
        'classification. Empty if the record contains nothing corroborating the report.',
    },
    playerFacingMessage: {
      type: 'string',
      description:
        'A short, warm, plain-English message to the player. Do not promise credit, name a dollar ' +
        'amount, or mention a refund. Do not blame the player.',
    },
  },
  required: ['severity', 'confidence', 'rationale', 'evidence', 'playerFacingMessage'],
  additionalProperties: false,
} as const;

const SYSTEM = `You triage customer-reported issues for RealTimeEscape, a browser-based multiplayer 3D escape room.

You are given a player's report plus the recorded evidence from their session: the gameplay event
log, an input log, any automatic in-game adjustments, and the session outcome.

Classify the issue as minor, moderate or major.

Ground every classification in the session record. A report describing a catastrophic failure with
nothing in the record to corroborate it is not major — say so plainly in the rationale and let a
human look. Equally, if the record shows a serious defect the player only described mildly, grade it
on the evidence, not on their tone.

Distinguish a defect from the game working as designed. Losing is not a defect. A puzzle being hard
is not a defect. A teammate leaving is not a defect. Reaching the end of the 60-minute clock is the
game. What counts is the software failing to deliver the experience: unsolvable states, lost
progress, server failures, controls that did not respond, audio or content that did not load,
desynchronised state between players, or time consumed by a fault rather than by play.

Be fair but not credulous. This product operates under a no-refund policy where major issues cost
real money in credit, so a wrong "major" is expensive and a wrong "minor" is unjust. When the
evidence genuinely does not settle it, return your best guess with low confidence.

Never mention refunds, credit amounts, or money in the player-facing message.`;

type SessionEvidence = {
  outcome: string | null;
  timeRemainingMs: number | null;
  hintsUsed: number | null;
  playerCount: number | null;
  events: { at_ms: number; type: string; payload: unknown }[];
  inputs: { at_ms: number; kind: string; target: string | null }[];
  adjustments: { kind: string; amount_ms: number | null; reason: string }[];
};

/** Pulls the recorded evidence for a session. Bounded so a long session can't blow the context. */
export async function gatherEvidence(sessionId: string): Promise<SessionEvidence | null> {
  const db = adminClient();

  const { data: session } = await db
    .from('rte_game_sessions')
    .select('result, time_remaining_ms, hints_used, locked_player_count')
    .eq('id', sessionId)
    .maybeSingle();
  if (!session) return null;

  const { data: events } = await db
    .from('rte_session_events')
    .select('at_ms, type, payload')
    .eq('session_id', sessionId)
    .order('at_ms')
    .limit(600);

  // Inputs are high-volume; sample the shape rather than shipping every keystroke.
  const { data: inputs } = await db
    .from('rte_input_events')
    .select('at_ms, kind, target')
    .eq('session_id', sessionId)
    .order('at_ms')
    .limit(400);

  const { data: adjustments } = await db
    .from('rte_session_adjustments')
    .select('kind, amount_ms, reason')
    .eq('session_id', sessionId);

  return {
    outcome: session.result,
    timeRemainingMs: session.time_remaining_ms,
    hintsUsed: session.hints_used,
    playerCount: session.locked_player_count,
    events: events ?? [],
    inputs: inputs ?? [],
    adjustments: adjustments ?? [],
  };
}

export async function triageIssue(
  report: { description: string; occurredAtMs?: number | null },
  evidence: SessionEvidence | null,
): Promise<{ verdict: TriageVerdict; model: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');

  const client = new Anthropic({ apiKey });
  const model = 'claude-opus-5';

  const evidenceBlock = evidence
    ? [
        `Outcome: ${evidence.outcome ?? 'no result recorded'}`,
        `Time remaining at end: ${evidence.timeRemainingMs ?? 'unknown'} ms`,
        `Hints used: ${evidence.hintsUsed ?? 'unknown'}`,
        `Players: ${evidence.playerCount ?? 'unknown'}`,
        '',
        `Automatic in-game adjustments already applied (${evidence.adjustments.length}):`,
        evidence.adjustments.length
          ? evidence.adjustments.map((a) => `  ${a.kind} ${a.amount_ms ?? ''} — ${a.reason}`).join('\n')
          : '  none',
        '',
        `Gameplay events (${evidence.events.length}):`,
        evidence.events.length
          ? evidence.events.map((e) => `  [${e.at_ms}] ${e.type} ${JSON.stringify(e.payload ?? {})}`).join('\n')
          : '  none recorded',
        '',
        `Input events (${evidence.inputs.length}, sampled):`,
        evidence.inputs.length
          ? evidence.inputs.map((i) => `  [${i.at_ms}] ${i.kind} ${i.target ?? ''}`).join('\n')
          : '  none recorded',
      ].join('\n')
    : 'NO SESSION RECORD IS AVAILABLE for this report. Classify on the description alone and set confidence low.';

  const response = await client.messages.create({
    model,
    max_tokens: 4000,
    system: SYSTEM,
    output_config: {
      effort: 'high',
      format: { type: 'json_schema', schema: VERDICT_SCHEMA },
    },
    messages: [
      {
        role: 'user',
        content:
          `PLAYER REPORT\n${report.description}\n\n` +
          (report.occurredAtMs != null
            ? `Player says it happened around ${report.occurredAtMs} ms into the session.\n\n`
            : '\n') +
          `SESSION RECORD\n${evidenceBlock}`,
      },
    ],
  });

  if (response.stop_reason === 'refusal') {
    throw new Error('Triage model declined to classify this report');
  }

  const text = response.content.find((b) => b.type === 'text');
  if (!text || text.type !== 'text') throw new Error('Triage model returned no text');

  const verdict = JSON.parse(text.text) as TriageVerdict;
  return { verdict, model };
}

/**
 * Turns a verdict into an outcome. The model recommends; this decides.
 *
 * Deliberate asymmetry: a confident "minor" resolves automatically because the cost of being
 * wrong is an apology, while every "major" goes to a human because the cost of being wrong is
 * money. Automation is allowed to close cheap cases, never expensive ones.
 */
export function decideOutcome(verdict: TriageVerdict, seatPriceCents: number): {
  status: 'resolved' | 'awaiting_review';
  resolution: 'logged' | 'partial_credit' | 'full_credit' | null;
  creditCents: number;
  autoResolved: boolean;
} {
  if (verdict.severity === 'minor' && verdict.confidence >= 0.75) {
    return { status: 'resolved', resolution: 'logged', creditCents: 0, autoResolved: true };
  }

  if (verdict.severity === 'moderate' && verdict.confidence >= 0.8) {
    return {
      status: 'resolved',
      resolution: 'partial_credit',
      creditCents: Math.round(seatPriceCents / 2),
      autoResolved: true,
    };
  }

  // Major, or anything the model is unsure about, is a human decision.
  return { status: 'awaiting_review', resolution: null, creditCents: 0, autoResolved: false };
}
