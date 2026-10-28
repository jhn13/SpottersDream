-- Update 3: plane alerts and push notifications.
-- Paste into Supabase SQL Editor and click Run. Safe to run more than once.

-- Each person's own alerts, e.g. "tell me when G-JZHA is within 10 miles of Leeds Bradford".
create table if not exists public.alerts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  reg           text not null check (reg = upper(reg)),
  kind          text not null check (kind in ('near', 'takeoff', 'landing')),
  place         text check (place in ('airport', 'home', 'me')),
  place_name    text,
  lat           double precision,
  lon           double precision,
  radius_mi     integer not null default 10 check (radius_mi between 1 and 250),
  active        boolean not null default true,
  state         jsonb not null default '{}'::jsonb,
  last_fired_at timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists alerts_user_idx on public.alerts (user_id);

-- Phones and iPads that have said yes to notifications.
create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);

-- Home, last known location, and quiet hours (24h clock, UK time).
create table if not exists public.user_settings (
  user_id     uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  home_lat    double precision,
  home_lon    double precision,
  here_lat    double precision,
  here_lon    double precision,
  here_at     timestamptz,
  quiet_start smallint not null default 21 check (quiet_start between 0 and 23),
  quiet_end   smallint not null default 7 check (quiet_end between 0 and 23),
  updated_at  timestamptz not null default now()
);

-- Keys the server uses to sign notifications. No policies, so only the server can read it.
create table if not exists public.app_secrets (
  name  text primary key,
  value text not null
);

-- The background job checks a few planes each run, oldest first.
alter table public.planes add column if not exists last_checked_at timestamptz;

alter table public.alerts             enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.user_settings      enable row level security;
alter table public.app_secrets        enable row level security;

drop policy if exists "own alerts" on public.alerts;
create policy "own alerts" on public.alerts for all to authenticated
  using (user_id = auth.uid() and public.is_member()) with check (user_id = auth.uid() and public.is_member());

drop policy if exists "own push subscriptions" on public.push_subscriptions;
create policy "own push subscriptions" on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_member());

drop policy if exists "own settings" on public.user_settings;
create policy "own settings" on public.user_settings for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_member());

select 'Alerts are set up' as result;
