-- RealTimeEscape.com — feedback capture and the clustered bug/feature queue
--
-- Players can leave written or spoken feedback at any time. Every piece is collated into a
-- TOPIC: similar reports collapse onto the same topic, and each one adds weight. Topics are
-- ranked by that weight against a stated description of what fixing it is worth.
--
-- Apply after 0002. Safe to re-run.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Raw feedback
--
-- One row per thing a player said. Never edited or deleted by the clustering
-- process — clustering only ever sets topic_id, so the original record of what
-- somebody actually said always survives.
-- ---------------------------------------------------------------------------

create table if not exists rte_feedback (
  id                  uuid primary key default gen_random_uuid(),
  session_id          uuid references rte_game_sessions(id) on delete set null,
  booking_id          uuid references rte_bookings(id) on delete set null,
  player_id           uuid references rte_players(id) on delete set null,
  seat_id             uuid references rte_booking_seats(id) on delete set null,
  email               text,

  medium              text not null default 'text' check (medium in ('text','audio')),
  body                text,                  -- written feedback, or the transcript of audio
  audio_storage_key   text,                  -- object-store key when medium = 'audio'
  audio_duration_ms   int,
  transcription_state text not null default 'not_applicable'
                        check (transcription_state in ('not_applicable','pending','done','failed')),

  -- Where in the experience it was left
  context             text not null default 'other'
                        check (context in ('in_game','lobby','debrief','booking','site','other')),
  at_ms               int,                   -- ms into the session, when left in-game
  zone                text,

  -- Classification (set by the collation pass)
  kind                text check (kind in ('bug','feature','praise','confusion','other')),
  topic_id            uuid,                  -- FK added below
  sentiment           text check (sentiment in ('positive','neutral','negative')),
  classified_at       timestamptz,
  classifier_model    text,

  created_at          timestamptz not null default now()
);

create index if not exists rte_feedback_session_idx on rte_feedback(session_id);
create index if not exists rte_feedback_topic_idx   on rte_feedback(topic_id);
create index if not exists rte_feedback_unsorted_idx on rte_feedback(created_at)
  where topic_id is null;

-- ---------------------------------------------------------------------------
-- Topics — the collated queue
--
-- A topic is one idea, however many people raised it. `weight` is the accrued
-- signal: every piece of feedback that lands on a topic adds to it, so the
-- queue reflects how many people hit the thing, not just that somebody did.
-- ---------------------------------------------------------------------------

create table if not exists rte_feedback_topics (
  id                  uuid primary key default gen_random_uuid(),
  slug                text unique not null,
  title               text not null,
  summary             text not null,
  kind                text not null check (kind in ('bug','feature','praise','confusion','other')),

  -- Why it is worth doing. Written once per topic, in plain language.
  value_statement     text,
  effort              text check (effort in ('trivial','small','medium','large','unknown')) default 'unknown',
  severity            text check (severity in ('minor','moderate','major')),

  weight              numeric not null default 0,   -- accrued signal
  mention_count       int     not null default 0,
  distinct_players    int     not null default 0,
  first_seen_at       timestamptz not null default now(),
  last_seen_at        timestamptz not null default now(),

  status              text not null default 'open'
                        check (status in ('open','planned','in_progress','shipped','declined','duplicate')),
  merged_into         uuid references rte_feedback_topics(id) on delete set null,
  area                text,                  -- e.g. 'burn-window/act-iv', 'lobby', 'commerce'

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists rte_topics_rank_idx on rte_feedback_topics(status, weight desc);

do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints where constraint_name = 'rte_feedback_topic_fk'
  ) then
    alter table rte_feedback
      add constraint rte_feedback_topic_fk
      foreign key (topic_id) references rte_feedback_topics(id) on delete set null;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Weighting
--
-- Each mention contributes a base weight, scaled by how much it matters:
--   severity        major 3x, moderate 1.75x, minor 1x
--   kind            a bug outweighs a feature request at equal volume
--   distinct player one person saying it five times is not five people
--
-- Recomputed from the feedback rows rather than incremented, so a
-- reclassification or a merge can never leave a stale score behind.
-- ---------------------------------------------------------------------------

create or replace function rte_recompute_topic_weight(p_topic_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mentions        int;
  v_distinct        int;
  v_kind            text;
  v_severity        text;
  v_kind_factor     numeric;
  v_severity_factor numeric;
begin
  select count(*), count(distinct coalesce(player_id::text, email, id::text))
    into v_mentions, v_distinct
    from rte_feedback where topic_id = p_topic_id;

  select kind, severity into v_kind, v_severity
    from rte_feedback_topics where id = p_topic_id;

  v_kind_factor := case v_kind
    when 'bug'       then 1.6
    when 'confusion' then 1.3
    when 'feature'   then 1.0
    when 'praise'    then 0.4
    else 0.8 end;

  v_severity_factor := case v_severity
    when 'major'    then 3.0
    when 'moderate' then 1.75
    else 1.0 end;

  -- Distinct players dominate; repeat mentions from the same person still count,
  -- but with sharply diminishing returns.
  update rte_feedback_topics
     set weight = round(
           (v_distinct + sqrt(greatest(v_mentions - v_distinct, 0))) * v_kind_factor * v_severity_factor,
           2),
         mention_count    = v_mentions,
         distinct_players = v_distinct,
         last_seen_at     = greatest(
           last_seen_at,
           coalesce((select max(created_at) from rte_feedback where topic_id = p_topic_id), last_seen_at)
         ),
         updated_at = now()
   where id = p_topic_id;
end;
$$;

-- Keep weights correct whenever feedback lands on, moves between, or leaves a topic.
create or replace function rte_feedback_topic_changed()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if old.topic_id is not null then perform rte_recompute_topic_weight(old.topic_id); end if;
    return old;
  end if;

  if new.topic_id is not null then perform rte_recompute_topic_weight(new.topic_id); end if;
  if tg_op = 'UPDATE' and old.topic_id is not null and old.topic_id is distinct from new.topic_id then
    perform rte_recompute_topic_weight(old.topic_id);
  end if;
  return new;
end;
$$;

drop trigger if exists rte_feedback_topic_trg on rte_feedback;
create trigger rte_feedback_topic_trg
  after insert or update of topic_id or delete on rte_feedback
  for each row execute function rte_feedback_topic_changed();

-- ---------------------------------------------------------------------------
-- The prioritised queue
--
-- Ranking blends accrued weight with effort: a cheap fix that several people
-- hit outranks an expensive one a couple of people mentioned. Effort is a
-- divisor rather than a filter, so a large-but-important item still climbs.
-- ---------------------------------------------------------------------------

create or replace view rte_feedback_queue as
  select
    t.id,
    t.slug,
    t.title,
    t.summary,
    t.kind,
    t.severity,
    t.effort,
    t.value_statement,
    t.area,
    t.status,
    t.weight,
    t.mention_count,
    t.distinct_players,
    t.first_seen_at,
    t.last_seen_at,
    round(
      t.weight / case t.effort
        when 'trivial' then 0.5
        when 'small'   then 0.8
        when 'medium'  then 1.3
        when 'large'   then 2.2
        else 1.3 end,
      2
    ) as priority_score
  from rte_feedback_topics t
  where t.status in ('open', 'planned', 'in_progress')
    and t.merged_into is null
  order by priority_score desc, t.weight desc;

-- ---------------------------------------------------------------------------
-- Media consent — images and video for social use, default ON with an opt-out
-- ---------------------------------------------------------------------------

alter table rte_session_consents
  add column if not exists media_social_use boolean not null default true;

alter table rte_session_consents
  add column if not exists media_opted_out_at timestamptz;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table rte_feedback        enable row level security;
alter table rte_feedback_topics enable row level security;

do $$
begin
  -- Anyone may leave feedback; nobody may read it back with the anon key.
  if not exists (select 1 from pg_policies where tablename = 'rte_feedback' and policyname = 'feedback_insert') then
    create policy feedback_insert on rte_feedback for insert with check (true);
  end if;

  -- A signed-in player can read their own feedback.
  if not exists (select 1 from pg_policies where tablename = 'rte_feedback' and policyname = 'feedback_self_read') then
    create policy feedback_self_read on rte_feedback
      for select using (
        exists (select 1 from rte_players p where p.id = rte_feedback.player_id and p.user_id = auth.uid())
      );
  end if;
end $$;

-- Topics carry no personal data, so the collated queue can be public if we ever
-- want a public roadmap. Raw feedback rows stay private.
grant select on rte_feedback_queue to anon, authenticated;
