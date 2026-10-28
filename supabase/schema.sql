-- Spotter's Logbook database
-- Paste this whole file into Supabase: SQL Editor -> New query -> Run.
-- It is safe to run more than once.

-- ---------------------------------------------------------------
-- Who is allowed in. Only people with a row here can use the app.
-- role: 'admin' (can delete and fix things) or 'spotter'
-- ---------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  role         text not null check (role in ('admin', 'spotter')),
  created_at   timestamptz not null default now()
);

create or replace function public.is_member()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid());
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- ---------------------------------------------------------------
-- One row per aircraft, plus the last place we heard it.
-- ---------------------------------------------------------------
create table if not exists public.planes (
  id             uuid primary key default gen_random_uuid(),
  reg            text not null unique check (reg = upper(reg)),
  hex            text,
  icao_type      text,
  type_name      text not null default '',
  airline        text not null default '',
  airline_icao   text,
  last_lat       double precision,
  last_lon       double precision,
  last_alt       integer,
  last_track     real,
  last_on_ground boolean,
  last_seen_at   timestamptz,
  created_by     uuid references auth.users (id) default auth.uid(),
  created_at     timestamptz not null default now()
);

-- Each time he spots a plane.
create table if not exists public.sightings (
  id         uuid primary key default gen_random_uuid(),
  plane_id   uuid not null references public.planes (id) on delete cascade,
  airport    text not null,
  spotted_on date not null,
  note       text not null default '',
  created_by uuid references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists sightings_plane_idx on public.sightings (plane_id);

-- Photos and videos attached to a sighting (files live in the 'media' storage bucket).
create table if not exists public.media (
  id          uuid primary key default gen_random_uuid(),
  sighting_id uuid not null references public.sightings (id) on delete cascade,
  kind        text not null check (kind in ('photo', 'video')),
  path        text not null,
  poster_path text,
  created_by  uuid references auth.users (id) default auth.uid(),
  created_at  timestamptz not null default now()
);
create index if not exists media_sighting_idx on public.media (sighting_id);

-- ---------------------------------------------------------------
-- Security: the database itself checks every request.
-- ---------------------------------------------------------------
alter table public.profiles  enable row level security;
alter table public.planes    enable row level security;
alter table public.sightings enable row level security;
alter table public.media     enable row level security;

drop policy if exists "members read profiles" on public.profiles;
create policy "members read profiles" on public.profiles for select to authenticated using (public.is_member());

drop policy if exists "members read planes"   on public.planes;
drop policy if exists "members add planes"    on public.planes;
drop policy if exists "members update planes" on public.planes;
drop policy if exists "admin deletes planes"  on public.planes;
create policy "members read planes"   on public.planes for select to authenticated using (public.is_member());
create policy "members add planes"    on public.planes for insert to authenticated with check (public.is_member());
create policy "members update planes" on public.planes for update to authenticated using (public.is_member()) with check (public.is_member());
create policy "admin deletes planes"  on public.planes for delete to authenticated using (public.is_admin());

drop policy if exists "members read sightings"  on public.sightings;
drop policy if exists "members add sightings"   on public.sightings;
drop policy if exists "owner or admin updates"  on public.sightings;
drop policy if exists "admin deletes sightings" on public.sightings;
create policy "members read sightings"  on public.sightings for select to authenticated using (public.is_member());
create policy "members add sightings"   on public.sightings for insert to authenticated with check (public.is_member() and created_by = auth.uid());
create policy "owner or admin updates"  on public.sightings for update to authenticated using (public.is_admin() or created_by = auth.uid());
create policy "admin deletes sightings" on public.sightings for delete to authenticated using (public.is_admin());

drop policy if exists "members read media"  on public.media;
drop policy if exists "members add media"   on public.media;
drop policy if exists "admin deletes media" on public.media;
create policy "members read media"  on public.media for select to authenticated using (public.is_member());
create policy "members add media"   on public.media for insert to authenticated with check (public.is_member() and created_by = auth.uid());
create policy "admin deletes media" on public.media for delete to authenticated using (public.is_admin());

-- ---------------------------------------------------------------
-- Private storage for photos and videos (50 MB per file, the free-plan maximum).
-- ---------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', false, 52428800, array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "members read media files"  on storage.objects;
drop policy if exists "members add media files"   on storage.objects;
drop policy if exists "admin deletes media files" on storage.objects;
create policy "members read media files"  on storage.objects for select to authenticated using (bucket_id = 'media' and public.is_member());
create policy "members add media files"   on storage.objects for insert to authenticated with check (bucket_id = 'media' and public.is_member());
create policy "admin deletes media files" on storage.objects for delete to authenticated using (bucket_id = 'media' and public.is_admin());
