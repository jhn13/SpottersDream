-- Update 2: view-only accounts for family and friends.
-- Paste into Supabase SQL Editor and click Run. Safe to run more than once.

-- 1. A third role: 'viewer' can see everything but can't add or delete.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('admin', 'spotter', 'viewer'));

create or replace function public.can_add()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'spotter'));
$$;

-- 2. Anyone you add in Supabase starts as a viewer. (Sign-ups are switched off, so only you can add people.)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, role)
  values (new.id, coalesce(nullif(split_part(new.email, '@', 1), ''), 'Guest'), 'viewer')
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- 3. Only admin and spotter can add or change things.
drop policy if exists "members add planes"    on public.planes;
drop policy if exists "members update planes" on public.planes;
create policy "members add planes"    on public.planes for insert to authenticated with check (public.can_add());
create policy "members update planes" on public.planes for update to authenticated using (public.can_add()) with check (public.can_add());

drop policy if exists "members add sightings" on public.sightings;
create policy "members add sightings" on public.sightings for insert to authenticated with check (public.can_add() and created_by = auth.uid());

drop policy if exists "members add media" on public.media;
create policy "members add media" on public.media for insert to authenticated with check (public.can_add() and created_by = auth.uid());

drop policy if exists "members add media files" on storage.objects;
create policy "members add media files" on storage.objects for insert to authenticated with check (bucket_id = 'media' and public.can_add());

-- 4. Everyone signed in (viewers too) can record where a plane was last heard.
create or replace function public.record_position(
  p_plane uuid, p_lat double precision, p_lon double precision, p_alt integer, p_track real, p_on_ground boolean
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_member() then raise exception 'not allowed'; end if;
  update public.planes
     set last_lat = p_lat, last_lon = p_lon, last_alt = p_alt, last_track = p_track,
         last_on_ground = p_on_ground, last_seen_at = now()
   where id = p_plane;
end;
$$;
grant execute on function public.record_position(uuid, double precision, double precision, integer, real, boolean) to authenticated;

-- Check: lists everyone and their role.
select p.display_name, p.role, u.email from public.profiles p join auth.users u on u.id = p.id order by p.role;
