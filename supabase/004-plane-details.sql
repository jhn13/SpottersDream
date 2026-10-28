-- Update 4: plane facts (age, serial number, engines). Paste into SQL Editor and click Run.
alter table public.planes add column if not exists details jsonb;
select 'Plane details column added' as result;
