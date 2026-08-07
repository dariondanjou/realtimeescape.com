-- RealTimeEscape.com — credits, session recording, issue triage, player numbering
--
-- Adds the machinery behind the no-refund / credit-only policy in /legal/terms:
--   * every player gets a permanent sequential player number
--   * sessions are recorded in enough detail to prove what went wrong
--   * issue reports are triaged (by AI, then reviewable by a human) into
--     minor / moderate / major, and major issues mint credit
--   * credit is a ledger, never a cash balance
--
-- Apply after 0001_init.sql. Safe to re-run.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Player numbering
--
-- Every person who ever pays for a seat is assigned a permanent, sequential
-- number: player #1, player #2, ... The count of these is the public ticker.
-- Identity is the lowercased email, so a player keeps their number whether or
-- not they later create an account.
-- ---------------------------------------------------------------------------

create table if not exists rte_players (
  id                  uuid primary key default gen_random_uuid(),
  player_number       bigint generated always as identity,
  email               text not null,
  user_id             uuid references auth.users(id) on delete set null,
  first_seen_at       timestamptz not null default now(),
  first_played_at     timestamptz,
  sessions_played     int not null default 0,
  escapes             int not null default 0,
  constraint rte_players_email_unique unique (email),
  constraint rte_players_number_unique unique (player_number)
);

create index if not exists rte_players_user_idx on rte_players(user_id);

-- Assigns (or returns) a player's permanent number. Called when a seat is paid.
create or replace function rte_claim_player_number(p_email text, p_user_id uuid default null)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_number bigint;
begin
  insert into rte_players (email, user_id)
  values (lower(trim(p_email)), p_user_id)
  on conflict (email) do update
    set user_id = coalesce(rte_players.user_id, excluded.user_id)
  returning player_number into v_number;

  return v_number;
end;
$$;

-- ---------------------------------------------------------------------------
-- Credit ledger
--
-- Credit is append-only. A balance is the sum of the ledger, never a stored
-- number that can drift. Credit has no cash value and is never paid out —
-- there is deliberately no "withdraw" or "refund" entry kind.
-- ---------------------------------------------------------------------------

create table if not exists rte_credit_ledger (
  id                  uuid primary key default gen_random_uuid(),
  player_id           uuid not null references rte_players(id) on delete cascade,
  amount_cents        int  not null,          -- positive = issued, negative = spent
  kind                text not null check (kind in (
                        'issue_major',        -- experience significantly compromised
                        'issue_moderate',     -- partial credit after a disruption
                        'goodwill',           -- discretionary, issued by an admin
                        'promotional',
                        'spent',              -- applied against a seat
                        'reversal'            -- an issued credit withdrawn (fraud)
                      )),
  session_id          uuid references rte_game_sessions(id) on delete set null,
  issue_report_id     uuid,                   -- FK added after the reports table exists
  booking_id          uuid references rte_bookings(id) on delete set null,
  note                text,
  created_by          text not null default 'system',
  created_at          timestamptz not null default now()
);

create index if not exists rte_credit_player_idx on rte_credit_ledger(player_id, created_at desc);

-- Spending must never take a balance negative.
create or replace function rte_credit_balance_cents(p_player_id uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(amount_cents), 0)::int
  from rte_credit_ledger
  where player_id = p_player_id;
$$;

create or replace function rte_credit_guard()
returns trigger
language plpgsql
as $$
begin
  if new.amount_cents < 0
     and rte_credit_balance_cents(new.player_id) + new.amount_cents < 0 then
    raise exception 'insufficient credit balance for player %', new.player_id;
  end if;
  return new;
end;
$$;

drop trigger if exists rte_credit_guard_trg on rte_credit_ledger;
create trigger rte_credit_guard_trg
  before insert on rte_credit_ledger
  for each row execute function rte_credit_guard();

-- ---------------------------------------------------------------------------
-- Session recording
--
-- Three streams, each with its own consent gate and retention clock:
--   rte_session_events (0001)  gameplay events — always recorded
--   rte_input_events           keystrokes/clicks — always recorded, sanitised
--   rte_session_recordings     voice / video artifacts — CONSENT REQUIRED
--
-- Input capture records WHICH control was used, never free text. Chat and
-- notebook content is captured as gameplay events, not as raw keystrokes, so a
-- player's typing is never reconstructable character by character.
-- ---------------------------------------------------------------------------

create table if not exists rte_session_consents (
  id                  uuid primary key default gen_random_uuid(),
  session_id          uuid not null references rte_game_sessions(id) on delete cascade,
  seat_id             uuid references rte_booking_seats(id) on delete set null,
  player_id           uuid references rte_players(id) on delete set null,
  voice_recording     boolean not null default false,
  marketing_use       boolean not null default false,
  consented_at        timestamptz not null default now(),
  ip_hash             text,                   -- salted hash, for consent audit only
  user_agent          text,
  unique (session_id, seat_id)
);

create table if not exists rte_input_events (
  id                  bigserial primary key,
  session_id          uuid not null references rte_game_sessions(id) on delete cascade,
  seat_id             uuid references rte_booking_seats(id) on delete set null,
  at_ms               int  not null,          -- ms since session start
  kind                text not null check (kind in ('key','click','drag','dial','hold','release','nav','focus')),
  target              text,                   -- interactable id or UI control id
  value               numeric,                -- dial/slider value where relevant
  zone                text,
  created_at          timestamptz not null default now()
);

create index if not exists rte_input_session_idx on rte_input_events(session_id, at_ms);

create table if not exists rte_session_recordings (
  id                  uuid primary key default gen_random_uuid(),
  session_id          uuid not null references rte_game_sessions(id) on delete cascade,
  seat_id             uuid references rte_booking_seats(id) on delete set null,
  kind                text not null check (kind in ('voice','screen','composite')),
  storage_key         text not null,          -- object-store key; media never lives in Postgres
  duration_ms         int,
  size_bytes          bigint,
  consent_id          uuid references rte_session_consents(id) on delete set null,
  delete_after        timestamptz not null,   -- retention clock, enforced by a scheduled job
  deleted_at          timestamptz,
  created_at          timestamptz not null default now()
);

create index if not exists rte_recordings_session_idx on rte_session_recordings(session_id);
create index if not exists rte_recordings_expiry_idx  on rte_session_recordings(delete_after)
  where deleted_at is null;

-- ---------------------------------------------------------------------------
-- Issue reports and triage
-- ---------------------------------------------------------------------------

create table if not exists rte_issue_reports (
  id                  uuid primary key default gen_random_uuid(),
  session_id          uuid references rte_game_sessions(id) on delete set null,
  booking_id          uuid references rte_bookings(id) on delete set null,
  player_id           uuid references rte_players(id) on delete set null,
  reporter_email      text not null,
  description         text not null,
  occurred_at_ms      int,                    -- where in the session, if known

  -- AI triage
  ai_severity         text check (ai_severity in ('minor','moderate','major')),
  ai_confidence       numeric,
  ai_rationale        text,
  ai_evidence         jsonb,                  -- event ids / timestamps the model cited
  ai_model            text,
  ai_triaged_at       timestamptz,

  -- Final determination (human review may override the AI)
  severity            text check (severity in ('minor','moderate','major')),
  resolution          text check (resolution in ('logged','in_game_compensation','partial_credit','full_credit','rejected')),
  credit_cents        int not null default 0,
  reviewed_by         text,
  reviewed_at         timestamptz,

  status              text not null default 'received'
                        check (status in ('received','triaging','awaiting_review','resolved','rejected')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists rte_issues_session_idx on rte_issue_reports(session_id);
create index if not exists rte_issues_status_idx  on rte_issue_reports(status, created_at desc);

do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'rte_credit_issue_fk'
  ) then
    alter table rte_credit_ledger
      add constraint rte_credit_issue_fk
      foreign key (issue_report_id) references rte_issue_reports(id) on delete set null;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- In-game remedies applied automatically during a session
--
-- The moderate-issue path in the terms: freeze the clock or add time back while
-- a problem is resolved, rather than compensating after the fact.
-- ---------------------------------------------------------------------------

create table if not exists rte_session_adjustments (
  id                  uuid primary key default gen_random_uuid(),
  session_id          uuid not null references rte_game_sessions(id) on delete cascade,
  kind                text not null check (kind in ('clock_freeze','time_added','puzzle_bypass','checkpoint_restore')),
  amount_ms           int,
  reason              text not null,
  automatic           boolean not null default true,
  created_at          timestamptz not null default now()
);

create index if not exists rte_adjustments_session_idx on rte_session_adjustments(session_id);

-- ---------------------------------------------------------------------------
-- Public ticker
--
-- Exposed as a view so the anon key can read aggregate counts without any
-- access to the underlying player rows.
-- ---------------------------------------------------------------------------

create or replace view rte_public_stats as
  select
    (select count(*) from rte_players)                                    as players_registered,
    (select count(*) from rte_players where first_played_at is not null)  as players_played,
    (select count(*) from rte_game_sessions where result is not null)     as sessions_completed,
    (select count(*) from rte_game_sessions where result = 'escaped')     as sessions_escaped,
    50000::bigint                                                          as players_goal;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table rte_players             enable row level security;
alter table rte_credit_ledger       enable row level security;
alter table rte_session_consents    enable row level security;
alter table rte_input_events        enable row level security;
alter table rte_session_recordings  enable row level security;
alter table rte_issue_reports       enable row level security;
alter table rte_session_adjustments enable row level security;

do $$
begin
  -- A player can read their own row and their own credit ledger. Nothing else.
  if not exists (select 1 from pg_policies where tablename = 'rte_players' and policyname = 'players_self_read') then
    create policy players_self_read on rte_players
      for select using (user_id = auth.uid());
  end if;

  if not exists (select 1 from pg_policies where tablename = 'rte_credit_ledger' and policyname = 'credit_self_read') then
    create policy credit_self_read on rte_credit_ledger
      for select using (
        exists (select 1 from rte_players p where p.id = rte_credit_ledger.player_id and p.user_id = auth.uid())
      );
  end if;

  if not exists (select 1 from pg_policies where tablename = 'rte_issue_reports' and policyname = 'issues_self_read') then
    create policy issues_self_read on rte_issue_reports
      for select using (
        exists (select 1 from rte_players p where p.id = rte_issue_reports.player_id and p.user_id = auth.uid())
      );
  end if;
end $$;

-- Recordings, input events, consents and adjustments have NO anon policies at
-- all. They are reachable only through server-side handlers using the service
-- role, which perform their own ownership checks. A player's session recording
-- must never be queryable from a browser.

grant select on rte_public_stats to anon, authenticated;
