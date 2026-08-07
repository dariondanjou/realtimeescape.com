import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { adminClient } from './supabase';

/**
 * Feedback collation.
 *
 * Every piece of feedback is matched against the existing topics. If it is the same idea somebody
 * has already raised, it joins that topic and adds weight. If it is genuinely new, it opens a
 * topic with a value statement explaining what fixing it is worth.
 *
 * The rule that keeps the queue honest: the model may only ever pick an EXISTING topic by id, or
 * declare a new one. It cannot rewrite, merge or delete topics, and it never sets weight — weight
 * is computed in the database from the feedback rows themselves, so the ranking can always be
 * traced back to how many real people said the thing.
 */

export type FeedbackKind = 'bug' | 'feature' | 'praise' | 'confusion' | 'other';

export type Collation = {
  matchedTopicId: string | null;
  newTopic: {
    slug: string;
    title: string;
    summary: string;
    kind: FeedbackKind;
    severity: 'minor' | 'moderate' | 'major' | null;
    effort: 'trivial' | 'small' | 'medium' | 'large' | 'unknown';
    valueStatement: string;
    area: string | null;
  } | null;
  kind: FeedbackKind;
  sentiment: 'positive' | 'neutral' | 'negative';
};

export function collationConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

const COLLATION_SCHEMA = {
  type: 'object',
  properties: {
    matchedTopicId: {
      type: ['string', 'null'],
      description:
        'The id of an existing topic this feedback belongs to, or null if it is a genuinely new ' +
        'idea. Match on the underlying problem, not on wording.',
    },
    newTopic: {
      type: ['object', 'null'],
      description: 'Set only when matchedTopicId is null.',
      properties: {
        slug: { type: 'string', description: 'kebab-case, stable, specific. e.g. starboard-dial-unresponsive' },
        title: { type: 'string', description: 'One short line naming the problem or request.' },
        summary: { type: 'string', description: 'Two or three sentences describing the issue neutrally.' },
        kind: { type: 'string', enum: ['bug', 'feature', 'praise', 'confusion', 'other'] },
        severity: {
          type: ['string', 'null'],
          enum: ['minor', 'moderate', 'major', null],
          description: 'For bugs: how badly it damages the experience. Null for non-bugs.',
        },
        effort: {
          type: 'string',
          enum: ['trivial', 'small', 'medium', 'large', 'unknown'],
          description: 'Rough engineering cost. Use unknown when you genuinely cannot tell.',
        },
        valueStatement: {
          type: 'string',
          description:
            'One or two sentences on what is gained by fixing or building this — concretely, in ' +
            'terms of the player experience or the business. Not a restatement of the problem.',
        },
        area: { type: ['string', 'null'], description: 'Where it lives, e.g. burn-window/act-iv, lobby, commerce.' },
      },
      required: ['slug', 'title', 'summary', 'kind', 'severity', 'effort', 'valueStatement', 'area'],
      additionalProperties: false,
    },
    kind: { type: 'string', enum: ['bug', 'feature', 'praise', 'confusion', 'other'] },
    sentiment: { type: 'string', enum: ['positive', 'neutral', 'negative'] },
  },
  required: ['matchedTopicId', 'newTopic', 'kind', 'sentiment'],
  additionalProperties: false,
} as const;

const SYSTEM = `You collate player feedback for RealTimeEscape, a browser-based multiplayer 3D escape room whose first game is Burn Window.

You are given one piece of feedback and the list of topics that already exist. Decide whether it is
the same underlying idea as an existing topic, or something new.

Match on the problem, not the phrasing. "The dial didn't do anything", "starboard thruster froze"
and "couldn't set the gimbal at the second station" are very likely the same topic. Two players
describing genuinely different problems in similar words are not.

Prefer matching. A queue with three near-duplicate topics ranks each of them a third as urgent as
the real signal deserves, which is worse than an occasional over-merge — a topic that turns out to
cover two things can be split later, but signal spread across duplicates is invisible.

When you do open a new topic, the value statement is the part that matters most. Say what is
actually gained: which players it affects, at what point in the experience, and what it changes for
them. "Players lose the last five minutes of the game to a control that looks functional but isn't,
which is the moment the whole hour has been building toward" is useful. "Fixes the dial bug" is not.

Judge severity by damage to the experience, not by how annoyed the player sounds. Judge effort
honestly and say unknown when you cannot tell.`;

type ExistingTopic = { id: string; slug: string; title: string; summary: string; kind: string };

export async function collate(
  feedbackBody: string,
  context: { context: string; atMs?: number | null; zone?: string | null },
): Promise<{ collation: Collation; model: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');

  const db = adminClient();
  const { data: topics } = await db
    .from('rte_feedback_topics')
    .select('id, slug, title, summary, kind')
    .is('merged_into', null)
    .in('status', ['open', 'planned', 'in_progress'])
    .order('weight', { ascending: false })
    .limit(120);

  const existing: ExistingTopic[] = topics ?? [];

  const client = new Anthropic({ apiKey });
  const model = 'claude-opus-5';

  const topicList = existing.length
    ? existing
        .map((t) => `- id: ${t.id}\n  [${t.kind}] ${t.title}\n  ${t.summary}`)
        .join('\n')
    : '(no topics exist yet — this is the first piece of feedback)';

  const response = await client.messages.create({
    model,
    max_tokens: 3000,
    system: SYSTEM,
    output_config: {
      effort: 'medium',
      format: { type: 'json_schema', schema: COLLATION_SCHEMA },
    },
    messages: [
      {
        role: 'user',
        content:
          `EXISTING TOPICS\n${topicList}\n\n` +
          `NEW FEEDBACK\n` +
          `Left during: ${context.context}` +
          (context.atMs != null ? ` (${Math.round(context.atMs / 1000)}s into the session)` : '') +
          (context.zone ? ` in zone ${context.zone}` : '') +
          `\n\n"${feedbackBody}"`,
      },
    ],
  });

  if (response.stop_reason === 'refusal') throw new Error('Collation model declined');

  const text = response.content.find((b) => b.type === 'text');
  if (!text || text.type !== 'text') throw new Error('Collation model returned no text');

  return { collation: JSON.parse(text.text) as Collation, model };
}

/** Applies a collation: attaches the feedback to a topic, creating one if needed. */
export async function applyCollation(feedbackId: string, collation: Collation, model: string) {
  const db = adminClient();
  let topicId = collation.matchedTopicId;

  if (!topicId && collation.newTopic) {
    const t = collation.newTopic;
    // Upsert on slug so a concurrent collation proposing the same new topic converges
    // rather than creating a duplicate.
    const { data: created } = await db
      .from('rte_feedback_topics')
      .upsert(
        {
          slug: t.slug,
          title: t.title,
          summary: t.summary,
          kind: t.kind,
          severity: t.severity,
          effort: t.effort,
          value_statement: t.valueStatement,
          area: t.area,
          status: 'open',
        },
        { onConflict: 'slug', ignoreDuplicates: false },
      )
      .select('id')
      .single();
    topicId = created?.id ?? null;
  }

  // Setting topic_id fires the database trigger that recomputes the topic's weight.
  await db
    .from('rte_feedback')
    .update({
      topic_id: topicId,
      kind: collation.kind,
      sentiment: collation.sentiment,
      classified_at: new Date().toISOString(),
      classifier_model: model,
    })
    .eq('id', feedbackId);

  return topicId;
}

export type QueueItem = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  kind: string;
  severity: string | null;
  effort: string;
  value_statement: string | null;
  area: string | null;
  status: string;
  weight: number;
  mention_count: number;
  distinct_players: number;
  priority_score: number;
  last_seen_at: string;
};

export async function loadQueue(limit = 100): Promise<QueueItem[]> {
  try {
    const { data } = await adminClient()
      .from('rte_feedback_queue')
      .select('*')
      .limit(limit);
    return (data ?? []) as QueueItem[];
  } catch {
    return [];
  }
}
