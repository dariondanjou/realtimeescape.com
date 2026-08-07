-- RealTimeEscape.com — demo bookings and credit redemption
--
-- Apply after 0003. Safe to re-run.

-- ---------------------------------------------------------------------------
-- Demo bookings
--
-- Free, solo-capable bookings for testing. Flagged so they never reach revenue
-- figures, the public player ticker, or the escape-rate statistics — a demo
-- game that counted toward "players flown" would make the ticker a lie.
-- ---------------------------------------------------------------------------

alter table rte_bookings   add column if not exists is_demo boolean not null default false;
alter table rte_players    add column if not exists is_demo boolean not null default false;

create index if not exists rte_bookings_demo_idx on rte_bookings(is_demo) where is_demo;

-- Demo bookings may be smaller than the game's real minimum party size.
do $$
begin
  if exists (
    select 1 from information_schema.constraint_column_usage
    where table_name = 'rte_bookings' and constraint_name = 'rte_bookings_seat_count_check'
  ) then
    alter table rte_bookings drop constraint rte_bookings_seat_count_check;
  end if;
end $$;

alter table rte_bookings
  add constraint rte_bookings_seat_count_check
  check (seat_count between 1 and 8);

-- ---------------------------------------------------------------------------
-- Keep demo activity out of the public numbers
-- ---------------------------------------------------------------------------

create or replace view rte_public_stats as
  select
    (select count(*) from rte_players where not is_demo)                   as players_registered,
    (select count(*) from rte_players
       where first_played_at is not null and not is_demo)                  as players_played,
    (select count(*) from rte_game_sessions gs
       join rte_bookings b on b.id = gs.booking_id
      where gs.result is not null and not b.is_demo)                       as sessions_completed,
    (select count(*) from rte_game_sessions gs
       join rte_bookings b on b.id = gs.booking_id
      where gs.result = 'escaped' and not b.is_demo)                       as sessions_escaped,
    50000::bigint                                                          as players_goal;

grant select on rte_public_stats to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Credit redemption
--
-- 0002 created the ledger with a 'spent' entry kind but nothing that used it.
-- This adds the accounting view the checkout path reads from, and a guard so a
-- redemption can never be recorded against a booking that does not exist.
-- ---------------------------------------------------------------------------

create or replace view rte_credit_balances as
  select
    p.id                     as player_id,
    p.email,
    p.player_number,
    coalesce(sum(l.amount_cents) filter (where l.amount_cents > 0), 0)::int as issued_cents,
    coalesce(abs(sum(l.amount_cents) filter (where l.amount_cents < 0)), 0)::int as spent_cents,
    coalesce(sum(l.amount_cents), 0)::int                                   as balance_cents
  from rte_players p
  left join rte_credit_ledger l on l.player_id = p.id
  group by p.id, p.email, p.player_number;

-- A spend must reference the booking it paid for, so every redemption is auditable.
create or replace function rte_credit_spend_guard()
returns trigger
language plpgsql
as $$
begin
  if new.kind = 'spent' and new.booking_id is null then
    raise exception 'a credit spend must reference the booking it was applied to';
  end if;
  if new.kind = 'spent' and new.amount_cents >= 0 then
    raise exception 'a credit spend must be negative';
  end if;
  return new;
end;
$$;

drop trigger if exists rte_credit_spend_guard_trg on rte_credit_ledger;
create trigger rte_credit_spend_guard_trg
  before insert on rte_credit_ledger
  for each row execute function rte_credit_spend_guard();
