import Link from 'next/link';
import type { Metadata } from 'next';
import { loadQueue, type QueueItem } from '@/lib/feedback';

export const metadata: Metadata = {
  title: 'What we are fixing next',
  description:
    'The live queue of bugs and feature requests, built from player feedback and ranked by how many ' +
    'people hit each one against what fixing it is worth.',
};

export const dynamic = 'force-dynamic';

export default async function RoadmapPage() {
  const queue = await loadQueue(60);

  const bugs = queue.filter((t) => t.kind === 'bug' || t.kind === 'confusion');
  const features = queue.filter((t) => t.kind === 'feature');

  return (
    <section className="section">
      <div className="wrap">
        <span className="eyebrow eyebrow-dim">Roadmap</span>
        <h1 style={{ fontSize: 38, margin: '14px 0 12px' }}>What we are fixing next</h1>
        <p className="lede" style={{ maxWidth: 680 }}>
          Every piece of feedback we get is collated onto a topic. When several people hit the same
          thing, it does not become several entries — it becomes one entry that weighs more. This is
          that list, in the order we are actually working through it.
        </p>

        {queue.length === 0 ? (
          <div className="panel" style={{ marginTop: 36 }}>
            <h2 style={{ fontSize: 20, marginBottom: 10 }}>Nothing here yet</h2>
            <p className="small" style={{ marginBottom: 16 }}>
              No feedback has been collated so far. The first person to tell us something starts this
              list — and there is a feedback button in the corner of every page, including during a
              game.
            </p>
            <Link href="/report" className="btn btn-ghost btn-sm">Report a problem</Link>
          </div>
        ) : (
          <>
            <div className="grid grid-4" style={{ marginTop: 34, gap: 16 }}>
              <Stat label="Open topics" value={String(queue.length)} />
              <Stat label="Bugs & confusion" value={String(bugs.length)} />
              <Stat label="Feature requests" value={String(features.length)} />
              <Stat
                label="Total mentions"
                value={String(queue.reduce((n, t) => n + t.mention_count, 0))}
              />
            </div>

            <h2 style={{ fontSize: 22, margin: '44px 0 6px' }}>Priority queue</h2>
            <p className="small" style={{ marginBottom: 20 }}>
              Ranked by accrued weight against estimated effort. Weight comes from how many distinct
              players raised it and how badly it damages the experience — one person mentioning
              something five times does not outrank five people mentioning it once.
            </p>

            <div className="stack">
              {queue.map((t, i) => <TopicRow key={t.id} topic={t} rank={i + 1} />)}
            </div>
          </>
        )}

        <div className="panel" style={{ marginTop: 40 }}>
          <h2 style={{ fontSize: 19, marginBottom: 10 }}>How something gets on this list</h2>
          <p className="small">
            You tell us — by typing or speaking into the feedback button, in the debrief, or by
            reporting a problem. We collate it against everything already on the list: if it is the
            same underlying issue somebody else raised, it joins that topic and pushes it up. If it
            is new, it opens a topic with a plain statement of what fixing it is worth. Nothing is
            ranked by who complained loudest.
          </p>
        </div>
      </div>
    </section>
  );
}

function TopicRow({ topic, rank }: { topic: QueueItem; rank: number }) {
  const tone =
    topic.severity === 'major' ? 'var(--accent-bright)'
    : topic.kind === 'bug' ? 'var(--accent)'
    : 'var(--text-faint)';

  return (
    <div className="panel" style={{ padding: 20, borderLeft: `2px solid ${tone}` }}>
      <div className="spread" style={{ alignItems: 'flex-start', marginBottom: 8 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'baseline', minWidth: 0 }}>
          <span className="mono" style={{ color: 'var(--text-faint)', fontSize: 13, flex: 'none' }}>
            {String(rank).padStart(2, '0')}
          </span>
          <h3 style={{ fontSize: 17, margin: 0 }}>{topic.title}</h3>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: 'none' }}>
          <span className="badge">{topic.kind}</span>
          {topic.severity && (
            <span className={`badge ${topic.severity === 'major' ? 'badge-live' : ''}`}>{topic.severity}</span>
          )}
          {topic.status !== 'open' && <span className="badge badge-live">{topic.status.replace('_', ' ')}</span>}
        </div>
      </div>

      <p className="small" style={{ marginBottom: 12 }}>{topic.summary}</p>

      {topic.value_statement && (
        <div style={{ borderLeft: '2px solid var(--border-strong)', paddingLeft: 12, marginBottom: 14 }}>
          <div className="tiny mono" style={{ textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>
            Value of doing it
          </div>
          <p className="small" style={{ margin: 0 }}>{topic.value_statement}</p>
        </div>
      )}

      <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
        <Meta label="Priority" value={topic.priority_score.toFixed(1)} strong />
        <Meta label="Weight" value={topic.weight.toFixed(1)} />
        <Meta label="Players" value={String(topic.distinct_players)} />
        <Meta label="Mentions" value={String(topic.mention_count)} />
        <Meta label="Effort" value={topic.effort} />
        {topic.area && <Meta label="Area" value={topic.area} />}
      </div>
    </div>
  );
}

function Meta({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <div className="tiny mono" style={{ textTransform: 'uppercase', letterSpacing: '0.1em' }}>{label}</div>
      <div
        className="mono"
        style={{ fontSize: strong ? 17 : 14, color: strong ? 'var(--accent-bright)' : 'var(--text)', marginTop: 2 }}
      >
        {value}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel" style={{ padding: 16 }}>
      <div className="tiny mono" style={{ textTransform: 'uppercase', letterSpacing: '0.1em' }}>{label}</div>
      <div className="mono" style={{ fontSize: 26, marginTop: 4 }}>{value}</div>
    </div>
  );
}
