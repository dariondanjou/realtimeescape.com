-- Fix: rte_recompute_topic_weight raised
--   ERROR 42883: function round(double precision, integer) does not exist
--
-- sqrt() returns double precision, which made the whole weight expression double precision.
-- Postgres only provides round(numeric, int) — there is no two-argument round for floats.
--
-- Because the recompute runs inside an AFTER trigger on rte_feedback, this aborted every
-- statement that set topic_id, so collated feedback silently failed to attach to its topic and
-- every topic sat at weight 0. Casting the expression to numeric fixes it.
--
-- Apply after 0004. Safe to re-run.

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
  v_raw             numeric;
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

  -- Distinct players dominate; repeat mentions from the same person still count, but with
  -- sharply diminishing returns. sqrt() yields double precision, so cast before rounding.
  v_raw := (v_distinct + sqrt(greatest(v_mentions - v_distinct, 0)))::numeric
           * v_kind_factor * v_severity_factor;

  update rte_feedback_topics
     set weight           = round(v_raw, 2),
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

-- Repair anything already collated while the function was broken.
do $$
declare r record;
begin
  for r in select distinct topic_id from rte_feedback where topic_id is not null loop
    perform rte_recompute_topic_weight(r.topic_id);
  end loop;
end $$;
