-- Bedrijf → Locatie (adres) → Ruimte → Plant.
--
-- 1) Locations krijgt echte adresvelden.
-- 2) Nieuwe rooms-tabel: meerdere ruimtes per locatie (bv. receptie,
--    vergaderzaal, lokaal X). Heeft RLS + updated_at trigger.
-- 3) Plants krijgt room_id (nullable, met FK). location_id blijft
--    behouden als snelkoppeling zodat bestaande queries blijven werken.
-- 4) Voor elke bestaande locatie wordt automatisch een default ruimte
--    aangemaakt, en alle bestaande planten worden daaraan gelinkt.

create extension if not exists pgcrypto;

-- 1) Address fields on locations -------------------------------------------

alter table public.locations
  add column if not exists street text,
  add column if not exists number text,
  add column if not exists postal_code text,
  add column if not exists city text,
  add column if not exists country text default 'BE';

-- 2) Rooms table -----------------------------------------------------------

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  name text not null,
  floor text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists rooms_location_id_idx
  on public.rooms(location_id);

alter table public.rooms enable row level security;

drop policy if exists "Authenticated read rooms" on public.rooms;
create policy "Authenticated read rooms"
on public.rooms for select to authenticated using (true);

drop policy if exists "Authenticated insert rooms" on public.rooms;
create policy "Authenticated insert rooms"
on public.rooms for insert to authenticated with check (true);

drop policy if exists "Authenticated update rooms" on public.rooms;
create policy "Authenticated update rooms"
on public.rooms for update to authenticated using (true) with check (true);

drop policy if exists "Authenticated delete rooms" on public.rooms;
create policy "Authenticated delete rooms"
on public.rooms for delete to authenticated using (true);

drop trigger if exists set_rooms_updated_at on public.rooms;
create trigger set_rooms_updated_at
before update on public.rooms
for each row execute function public.set_updated_at();

-- Allow anonymous read so the public /p/[slug] page can show the room
-- name without exposing other data.
drop policy if exists "Anon read rooms" on public.rooms;
create policy "Anon read rooms"
on public.rooms for select to anon using (true);

-- 3) Default room per existing location -----------------------------------

insert into public.rooms (location_id, name, floor, notes)
select
  l.id,
  coalesce(nullif(trim(l.room), ''), 'Hoofdruimte') as name,
  l.floor,
  l.notes
from public.locations l
where not exists (
  select 1 from public.rooms r where r.location_id = l.id
);

-- 4) plants.room_id -------------------------------------------------------

alter table public.plants
  add column if not exists room_id uuid references public.rooms(id) on delete set null;

create index if not exists plants_room_id_idx
  on public.plants(room_id);

-- Backfill: link every existing plant to a room of its location. We use
-- the oldest room for the location (the one we just created above).
update public.plants p
set room_id = (
  select r.id
  from public.rooms r
  where r.location_id = p.location_id
  order by r.created_at asc
  limit 1
)
where p.room_id is null
  and p.location_id is not null;
