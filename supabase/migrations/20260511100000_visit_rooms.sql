-- Een onderhoudsbeurt kan over één of meerdere ruimtes gaan.
-- Standaard werkt Jelle per ruimte (bv. 'Gelijkvloers gebouw links'),
-- maar voor kleinere klanten doet hij soms meerdere ruimtes in één keer.
-- Daarom een M2M-koppeltabel ipv een directe room_id FK.

create extension if not exists pgcrypto;

create table if not exists public.maintenance_visit_rooms (
  visit_id uuid not null references public.maintenance_visits(id) on delete cascade,
  room_id  uuid not null references public.rooms(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (visit_id, room_id)
);

create index if not exists maintenance_visit_rooms_room_id_idx
  on public.maintenance_visit_rooms(room_id);

alter table public.maintenance_visit_rooms enable row level security;

drop policy if exists "Authenticated read maintenance_visit_rooms"
  on public.maintenance_visit_rooms;
create policy "Authenticated read maintenance_visit_rooms"
  on public.maintenance_visit_rooms for select to authenticated using (true);

drop policy if exists "Authenticated insert maintenance_visit_rooms"
  on public.maintenance_visit_rooms;
create policy "Authenticated insert maintenance_visit_rooms"
  on public.maintenance_visit_rooms for insert to authenticated with check (true);

drop policy if exists "Authenticated delete maintenance_visit_rooms"
  on public.maintenance_visit_rooms;
create policy "Authenticated delete maintenance_visit_rooms"
  on public.maintenance_visit_rooms for delete to authenticated using (true);

-- Backfill: voor elke bestaande beurt waarvan de titel exact matcht met
-- een ruimte-naam op die locatie, link de beurt aan die ruimte.
-- (Best-effort — bv. Vanden Broele 29/04 had titel 'Onderhoud Vanden
-- Broele – gelijkvloers gebouw links' en de ruimte heet
-- 'Gelijkvloers – gebouw links', dus ilike matchen we niet exact.
-- Liever expliciet via de UI achteraf koppelen.)

insert into public.maintenance_visit_rooms (visit_id, room_id)
select v.id, r.id
from public.maintenance_visits v
join public.rooms r
  on r.location_id = v.location_id
 and v.title ilike '%' || r.name || '%'
on conflict do nothing;
