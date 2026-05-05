-- Consumable catalog and per-visit consumables tracking.
-- The catalog stores reusable item definitions (potgrond, voeding, ...).
-- maintenance_visit_consumables records what was actually used during a visit,
-- either by referencing a catalog item or by free-text (custom_name).

create extension if not exists pgcrypto;

-- 1) consumable_catalog ------------------------------------------------------

create table if not exists public.consumable_catalog (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  default_unit text,
  active boolean default true,
  sort_order integer default 100,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.consumable_catalog enable row level security;

drop policy if exists "Authenticated read consumable_catalog" on public.consumable_catalog;
create policy "Authenticated read consumable_catalog"
on public.consumable_catalog
for select
to authenticated
using (true);

drop policy if exists "Authenticated insert consumable_catalog" on public.consumable_catalog;
create policy "Authenticated insert consumable_catalog"
on public.consumable_catalog
for insert
to authenticated
with check (true);

drop policy if exists "Authenticated update consumable_catalog" on public.consumable_catalog;
create policy "Authenticated update consumable_catalog"
on public.consumable_catalog
for update
to authenticated
using (true)
with check (true);

drop trigger if exists set_consumable_catalog_updated_at on public.consumable_catalog;
create trigger set_consumable_catalog_updated_at
before update on public.consumable_catalog
for each row execute function public.set_updated_at();

-- 2) maintenance_visit_consumables ------------------------------------------

create table if not exists public.maintenance_visit_consumables (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references public.maintenance_visits(id) on delete cascade,
  catalog_item_id uuid references public.consumable_catalog(id) on delete set null,
  custom_name text,
  quantity numeric(10,2) not null check (quantity > 0),
  unit text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  check (catalog_item_id is not null or custom_name is not null)
);

create index if not exists maintenance_visit_consumables_visit_id_idx
  on public.maintenance_visit_consumables(visit_id);

alter table public.maintenance_visit_consumables enable row level security;

drop policy if exists "Authenticated read maintenance_visit_consumables" on public.maintenance_visit_consumables;
create policy "Authenticated read maintenance_visit_consumables"
on public.maintenance_visit_consumables
for select
to authenticated
using (true);

drop policy if exists "Authenticated insert maintenance_visit_consumables" on public.maintenance_visit_consumables;
create policy "Authenticated insert maintenance_visit_consumables"
on public.maintenance_visit_consumables
for insert
to authenticated
with check (true);

drop policy if exists "Authenticated update maintenance_visit_consumables" on public.maintenance_visit_consumables;
create policy "Authenticated update maintenance_visit_consumables"
on public.maintenance_visit_consumables
for update
to authenticated
using (true)
with check (true);

drop policy if exists "Authenticated delete maintenance_visit_consumables" on public.maintenance_visit_consumables;
create policy "Authenticated delete maintenance_visit_consumables"
on public.maintenance_visit_consumables
for delete
to authenticated
using (true);

drop trigger if exists set_maintenance_visit_consumables_updated_at on public.maintenance_visit_consumables;
create trigger set_maintenance_visit_consumables_updated_at
before update on public.maintenance_visit_consumables
for each row execute function public.set_updated_at();

-- 3) Seed default catalog ---------------------------------------------------

insert into public.consumable_catalog (name, default_unit, sort_order)
values
  ('Potgrond', 'L', 10),
  ('Hydrokorrels', 'L', 20),
  ('Voeding (Pokon)', 'ml', 30),
  ('Bladglans', 'ml', 40),
  ('Plantenpot (binnenpot)', 'stuk', 50),
  ('Cachepot (sierpot)', 'stuk', 60),
  ('Onderschotel', 'stuk', 70)
on conflict (name) do nothing;
