-- Run this AFTER creating both accounts in Supabase (Authentication -> Users -> Add user).
-- Paste into SQL Editor and click Run.

insert into public.profiles (id, display_name, role)
select id, 'Dad', 'admin' from auth.users where email = 'joshnaylor@me.com'
on conflict (id) do update set role = excluded.role, display_name = excluded.display_name;

insert into public.profiles (id, display_name, role)
select id, 'Spotter', 'spotter' from auth.users where email = 'farmybob@icloud.com'
on conflict (id) do update set role = excluded.role, display_name = excluded.display_name;

-- Check it worked: you should see two rows.
select p.display_name, p.role, u.email from public.profiles p join auth.users u on u.id = p.id;
