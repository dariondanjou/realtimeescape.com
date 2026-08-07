-- RealTimeEscape.com — initial schema
--
-- This project shares a Supabase instance with unrelated applications (see ADR-005 in
-- docs/ARCHITECTURE.md). Every table therefore carries the rte_ prefix so the schema can be
-- lifted into a dedicated project later without collisions.
--
-- Apply with either:
--   supabase db execute --file supabase/migrations/0001_init.sql
-- or by pasting into the Supabase SQL editor.
--
-- Safe to re-run: every statement is guarded.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Catalog
-- ---------------------------------------------------------------------------

create table if not exists rte_games (
  id                  uuid primary key default gen_random_uuid(),
  slug                text unique not null,
  title               text not null,
  duration_minutes    int  not null default 60,
  min_players         int  not null default 3,
  max_players         int  not null default 8,
  price_cents         int  not null default 2000,
  status              text not null default 'beta' check (status in ('soon','beta','live','retired')),
  created_at          timestamptz not null default now()
);

create table if not exists rte_game_versions (
  id                  uuid primary key default gen_random_uuid(),
  game_id             uuid not null references rte_games(id) on delete cascade,
  version             text not null,
  room_package_hash   text,
  is_active           boolean not null default false,
  released_at         timestamptz,
  created_at          timestamptz not null default now(),
  unique (game_id, version)
);

-- ---------------------------------------------------------------------------
-- Players
-- ---------------------------------------------------------------------------

create table if not exists rte_player_profiles (
  user_id             uuid primary key references auth.users(id) on delete cascade,
  display_name        text,
  avatar_preset       text default 'preset-01',
  prefers_guided_move boolean not null default false,
  reduced_motion      boolean not null default false,
  subtitles           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Bookings, seats, invitations
-- ---------------------------------------------------------------------------

create table if not exists rte_bookings (
  id                  uuid primary key default gen_random_uuid(),
  game_id             uuid not null references rte_games(id),
  game_version_id     uuid references rte_game_versions(id),
  host_user_id        uuid references auth.users(id) on delete set null,
  host_email          text not null,
  seat_count          int  not null check (seat_count between 3 and 8),
  price_cents         int  not null,
  payment_mode        text not null check (payment_mode in ('host_pays_all','split')),
  kind                text not null check (kind in ('instant','scheduled')),
  scheduled_for       timestamptz,                    -- always stored UTC
  status              text not null default 'created'
                        check (status in ('created','awaiting_seats','confirmed','cancelled','expired','completed')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists rte_bookings_host_idx        on rte_bookings(host_user_id);
create index if not exists rte_bookings_host_email_idx  on rte_bookings(lower(host_email));
create index if not exists rte_bookings_scheduled_idx   on rte_bookings(scheduled_for);

create table if not exists rte_booking_seats (
  id                  uuid primary key default gen_random_uuid(),
  booking_id          uuid not null references rte_bookings(id) on delete cascade,
  seat_index          int  not null,
  claimed_by_user_id  uuid references auth.users(id) on delete set null,
  claimed_email       text,
  paid                boolean not null default false,
  paid_at             timestamptz,
  amount_cents        int,
  created_at          timestamptz not null default now(),
  unique (booking_id, seat_index)
);

create index if not exists rte_seats_booking_idx on rte_booking_seats(booking_id);

create table if not exists rte_invitations (
  id                  uuid primary key default gen_random_uuid(),
  booking_id          uuid not null references rte_bookings(id) on delete cascade,
  seat_id             uuid references rte_booking_seats(id) on delete set null,
  token               text unique not null,           -- unguessable, generated server-side
  recipient_email     text,
  state               text not null default 'sent' check (state in ('sent','viewed','claimed','revoked','expired')),
  expires_at          timestamptz not null,
  claimed_at          timestamptz,
  created_at          timestamptz not null default now()
);

create index if not exists rte_invites_booking_idx on rte_invitations(booking_id);

-- ---------------------------------------------------------------------------
-- Payments — references only. Raw card data is never stored anywhere in this system.
-- ---------------------------------------------------------------------------

create table if not exists rte_payments (
  id                        uuid primary key default gen_random_uuid(),
  booking_id                uuid references rte_bookings(id) on delete set null,
  seat_id                   uuid references rte_booking_seats(id) on delete set null,
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id  text,
  stripe_customer_id        text,
  amount_cents              int not null,
  currency                  text not null default 'usd',
  status                    text not null default 'pending'
                              check (status in ('pending','paid','failed','refunded','cancelled')),
  raw_event_id              text,                      -- Stripe event id, for idempotency
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

-- Idempotency backstop: a Stripe event may only ever be applied once.
create table if not exists rte_stripe_events (
  event_id            text primary key,
  type                text not null,
  processed_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Sessions
-- ---------------------------------------------------------------------------

create table if not exists rte_game_sessions (
  id                  uuid primary key default gen_random_uuid(),
  booking_id          uuid not null references rte_bookings(id) on delete cascade,
  game_version_id     uuid references rte_game_versions(id),
  colyseus_room_id    text,
  random_seed         text not null,
  phase               text not null default 'created'
                        check (phase in ('created','lobby_open','ready','briefing','active','escaped','failed','debrief','archived')),
  locked_player_count int,
  started_at          timestamptz,
  ended_at            timestamptz,
  result              text check (result in ('escaped','failed')),
  time_remaining_ms   int,
  hints_used          int not null default 0,
  created_at          timestamptz not null default now()
);

create index if not exists rte_sessions_booking_idx on rte_game_sessions(booking_id);

create table if not exists rte_session_players (
  id                  uuid primary key default gen_random_uuid(),
  session_id          uuid not null references rte_game_sessions(id) on delete cascade,
  seat_id             uuid references rte_booking_seats(id) on delete set null,
  user_id             uuid references auth.users(id) on delete set null,
  display_name        text,
  avatar_preset       text,
  role_hint           text,
  joined_at           timestamptz,
  last_seen_at        timestamptz,
  disconnect_count    int not null default 0,
  unique (session_id, seat_id)
);

create table if not exists rte_session_checkpoints (
  id                  uuid primary key default gen_random_uuid(),
  session_id          uuid not null references rte_game_sessions(id) on delete cascade,
  taken_at            timestamptz not null default now(),
  reason              text not null,
  state               jsonb not null
);

create index if not exists rte_checkpoints_session_idx on rte_session_checkpoints(session_id, taken_at desc);

create table if not exists rte_session_events (
  id                  bigserial primary key,
  session_id          uuid not null references rte_game_sessions(id) on delete cascade,
  at_ms               int not null,                   -- ms since session start
  type                text not null,
  actor_seat_id       uuid,
  payload             jsonb,
  created_at          timestamptz not null default now()
);

create index if not exists rte_events_session_idx on rte_session_events(session_id, at_ms);

create table if not exists rte_media_artifacts (
  id                  uuid primary key default gen_random_uuid(),
  session_id          uuid not null references rte_game_sessions(id) on delete cascade,
  kind                text not null check (kind in ('team_image','certificate','recap')),
  storage_key         text,
  public_token        text unique,
  created_at          timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Waitlist (pre-launch capture, used by game pages)
-- ---------------------------------------------------------------------------

create table if not exists rte_waitlist (
  id                  uuid primary key default gen_random_uuid(),
  email               text not null,
  source              text,
  created_at          timestamptz not null default now(),
  unique (email, source)
);

-- ---------------------------------------------------------------------------
-- Row level security
--
-- Default posture: deny. The service role (used only by server-side route handlers and the
-- Stripe webhook) bypasses RLS entirely; these policies govern what a signed-in player's
-- own anon-key session may read.
-- ---------------------------------------------------------------------------

alter table rte_player_profiles     enable row level security;
alter table rte_bookings            enable row level security;
alter table rte_booking_seats       enable row level security;
alter table rte_invitations         enable row level security;
alter table rte_payments            enable row level security;
alter table rte_game_sessions       enable row level security;
alter table rte_session_players     enable row level security;
alter table rte_session_checkpoints enable row level security;
alter table rte_session_events      enable row level security;
alter table rte_media_artifacts     enable row level security;
alter table rte_waitlist            enable row level security;

-- Catalog is public read.
alter table rte_games         enable row level security;
alter table rte_game_versions enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'rte_games' and policyname = 'games_public_read') then
    create policy games_public_read on rte_games for select using (true);
  end if;

  if not exists (select 1 from pg_policies where tablename = 'rte_game_versions' and policyname = 'versions_public_read') then
    create policy versions_public_read on rte_game_versions for select using (is_active);
  end if;

  -- A player owns their profile.
  if not exists (select 1 from pg_policies where tablename = 'rte_player_profiles' and policyname = 'profile_self_all') then
    create policy profile_self_all on rte_player_profiles
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;

  -- A player can read a booking they host or hold a seat in.
  if not exists (select 1 from pg_policies where tablename = 'rte_bookings' and policyname = 'booking_participant_read') then
    create policy booking_participant_read on rte_bookings
      for select using (
        auth.uid() = host_user_id
        or exists (
          select 1 from rte_booking_seats s
          where s.booking_id = rte_bookings.id and s.claimed_by_user_id = auth.uid()
        )
      );
  end if;

  if not exists (select 1 from pg_policies where tablename = 'rte_booking_seats' and policyname = 'seat_participant_read') then
    create policy seat_participant_read on rte_booking_seats
      for select using (
        claimed_by_user_id = auth.uid()
        or exists (
          select 1 from rte_bookings b
          where b.id = rte_booking_seats.booking_id and b.host_user_id = auth.uid()
        )
      );
  end if;

  if not exists (select 1 from pg_policies where tablename = 'rte_game_sessions' and policyname = 'session_participant_read') then
    create policy session_participant_read on rte_game_sessions
      for select using (
        exists (
          select 1 from rte_bookings b
          left join rte_booking_seats s on s.booking_id = b.id
          where b.id = rte_game_sessions.booking_id
            and (b.host_user_id = auth.uid() or s.claimed_by_user_id = auth.uid())
        )
      );
  end if;

  if not exists (select 1 from pg_policies where tablename = 'rte_session_players' and policyname = 'session_players_participant_read') then
    create policy session_players_participant_read on rte_session_players
      for select using (
        user_id = auth.uid()
        or exists (
          select 1 from rte_game_sessions gs
          join rte_bookings b on b.id = gs.booking_id
          where gs.id = rte_session_players.session_id and b.host_user_id = auth.uid()
        )
      );
  end if;

  -- Anyone may join the waitlist; nobody may read it back with the anon key.
  if not exists (select 1 from pg_policies where tablename = 'rte_waitlist' and policyname = 'waitlist_insert') then
    create policy waitlist_insert on rte_waitlist for insert with check (true);
  end if;
end $$;

-- Invitations, payments, checkpoints, events and media artifacts intentionally have NO anon
-- policies. They are reachable only through server-side handlers using the service role, which
-- perform their own token and ownership checks. Invitation tokens are claimed via a route
-- handler, never by querying this table from the browser.

-- ---------------------------------------------------------------------------
-- Seed catalog
-- ---------------------------------------------------------------------------

insert into rte_games (slug, title, duration_minutes, min_players, max_players, price_cents, status)
values ('burn-window', 'Burn Window', 60, 3, 8, 2000, 'beta')
on conflict (slug) do update
  set title = excluded.title,
      duration_minutes = excluded.duration_minutes,
      min_players = excluded.min_players,
      max_players = excluded.max_players,
      price_cents = excluded.price_cents,
      status = excluded.status;

insert into rte_game_versions (game_id, version, is_active, released_at)
select id, '1.0.0-graybox', true, now() from rte_games where slug = 'burn-window'
on conflict (game_id, version) do nothing;
