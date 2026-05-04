create extension if not exists pgcrypto;

create table if not exists public.maintenance_visits (
  id uuid primary key default gen_random_uuid()
);

alter table public.maintenance_visits
  add column if not exists company_id uuid,
  add column if not exists location_id uuid,
  add column if not exists title text,
  add column if not exists scheduled_start timestamptz,
  add column if not exists scheduled_end timestamptz,
  add column if not exists status text default 'scheduled',
  add column if not exists planned_tasks text,
  add column if not exists previous_visit_summary text,
  add column if not exists previous_visit_actions text,
  add column if not exists access_notes text,
  add column if not exists internal_notes text,
  add column if not exists general_notes text,
  add column if not exists started_at timestamptz,
  add column if not exists ended_at timestamptz,
  add column if not exists pause_total_minutes integer default 0,
  add column if not exists report_sent_at timestamptz,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'maintenance_visits_location_id_fkey'
  ) then
    alter table public.maintenance_visits
      add constraint maintenance_visits_location_id_fkey
      foreign key (location_id) references public.locations(id) on delete cascade;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'maintenance_visits_status_check'
  ) then
    alter table public.maintenance_visits
      add constraint maintenance_visits_status_check
      check (status in ('scheduled', 'in_progress', 'paused', 'completed', 'cancelled'));
  end if;
end $$;

create table if not exists public.maintenance_visit_plants (
  id uuid primary key default gen_random_uuid()
);

alter table public.maintenance_visit_plants
  add column if not exists visit_id uuid,
  add column if not exists plant_id uuid,
  add column if not exists scanned_at timestamptz default now(),
  add column if not exists action_checked boolean default false,
  add column if not exists action_watered boolean default false,
  add column if not exists action_pruned boolean default false,
  add column if not exists action_repotted boolean default false,
  add column if not exists action_replaced boolean default false,
  add column if not exists action_cleaned boolean default false,
  add column if not exists new_plant boolean default false,
  add column if not exists notes text,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'maintenance_visit_plants_visit_id_fkey'
  ) then
    alter table public.maintenance_visit_plants
      add constraint maintenance_visit_plants_visit_id_fkey
      foreign key (visit_id) references public.maintenance_visits(id) on delete cascade;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'maintenance_visit_plants_plant_id_fkey'
  ) then
    alter table public.maintenance_visit_plants
      add constraint maintenance_visit_plants_plant_id_fkey
      foreign key (plant_id) references public.plants(id) on delete cascade;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'maintenance_visit_plants_visit_id_plant_id_key'
  ) then
    alter table public.maintenance_visit_plants
      add constraint maintenance_visit_plants_visit_id_plant_id_key
      unique (visit_id, plant_id);
  end if;
end $$;

create table if not exists public.maintenance_visit_pause_logs (
  id uuid primary key default gen_random_uuid()
);

alter table public.maintenance_visit_pause_logs
  add column if not exists visit_id uuid,
  add column if not exists started_at timestamptz,
  add column if not exists ended_at timestamptz,
  add column if not exists duration_minutes integer,
  add column if not exists created_at timestamptz default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'maintenance_visit_pause_logs_visit_id_fkey'
  ) then
    alter table public.maintenance_visit_pause_logs
      add constraint maintenance_visit_pause_logs_visit_id_fkey
      foreign key (visit_id) references public.maintenance_visits(id) on delete cascade;
  end if;
end $$;

create table if not exists public.maintenance_visit_logs (
  id uuid primary key default gen_random_uuid()
);

alter table public.maintenance_visit_logs
  add column if not exists visit_id uuid,
  add column if not exists event_type text,
  add column if not exists payload jsonb,
  add column if not exists created_at timestamptz default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'maintenance_visit_logs_visit_id_fkey'
  ) then
    alter table public.maintenance_visit_logs
      add constraint maintenance_visit_logs_visit_id_fkey
      foreign key (visit_id) references public.maintenance_visits(id) on delete cascade;
  end if;
end $$;

create index if not exists maintenance_visits_location_id_idx
  on public.maintenance_visits(location_id);

create index if not exists maintenance_visits_scheduled_start_idx
  on public.maintenance_visits(scheduled_start);

create index if not exists maintenance_visit_plants_visit_id_idx
  on public.maintenance_visit_plants(visit_id);

create index if not exists maintenance_visit_plants_plant_id_idx
  on public.maintenance_visit_plants(plant_id);

create index if not exists maintenance_visit_pause_logs_visit_id_idx
  on public.maintenance_visit_pause_logs(visit_id);

create index if not exists maintenance_visit_logs_visit_id_idx
  on public.maintenance_visit_logs(visit_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_maintenance_visits_updated_at on public.maintenance_visits;
create trigger set_maintenance_visits_updated_at
before update on public.maintenance_visits
for each row execute function public.set_updated_at();

drop trigger if exists set_maintenance_visit_plants_updated_at on public.maintenance_visit_plants;
create trigger set_maintenance_visit_plants_updated_at
before update on public.maintenance_visit_plants
for each row execute function public.set_updated_at();

alter table public.maintenance_visits enable row level security;
alter table public.maintenance_visit_plants enable row level security;
alter table public.maintenance_visit_pause_logs enable row level security;
alter table public.maintenance_visit_logs enable row level security;

drop policy if exists "Authenticated can read maintenance_visits" on public.maintenance_visits;
create policy "Authenticated can read maintenance_visits"
on public.maintenance_visits
for select
to authenticated
using (true);

drop policy if exists "Authenticated can insert maintenance_visits" on public.maintenance_visits;
create policy "Authenticated can insert maintenance_visits"
on public.maintenance_visits
for insert
to authenticated
with check (true);

drop policy if exists "Authenticated can update maintenance_visits" on public.maintenance_visits;
create policy "Authenticated can update maintenance_visits"
on public.maintenance_visits
for update
to authenticated
using (true)
with check (true);

drop policy if exists "Authenticated can read maintenance_visit_plants" on public.maintenance_visit_plants;
create policy "Authenticated can read maintenance_visit_plants"
on public.maintenance_visit_plants
for select
to authenticated
using (true);

drop policy if exists "Authenticated can insert maintenance_visit_plants" on public.maintenance_visit_plants;
create policy "Authenticated can insert maintenance_visit_plants"
on public.maintenance_visit_plants
for insert
to authenticated
with check (true);

drop policy if exists "Authenticated can update maintenance_visit_plants" on public.maintenance_visit_plants;
create policy "Authenticated can update maintenance_visit_plants"
on public.maintenance_visit_plants
for update
to authenticated
using (true)
with check (true);

drop policy if exists "Authenticated can read maintenance_visit_pause_logs" on public.maintenance_visit_pause_logs;
create policy "Authenticated can read maintenance_visit_pause_logs"
on public.maintenance_visit_pause_logs
for select
to authenticated
using (true);

drop policy if exists "Authenticated can insert maintenance_visit_pause_logs" on public.maintenance_visit_pause_logs;
create policy "Authenticated can insert maintenance_visit_pause_logs"
on public.maintenance_visit_pause_logs
for insert
to authenticated
with check (true);

drop policy if exists "Authenticated can update maintenance_visit_pause_logs" on public.maintenance_visit_pause_logs;
create policy "Authenticated can update maintenance_visit_pause_logs"
on public.maintenance_visit_pause_logs
for update
to authenticated
using (true)
with check (true);

drop policy if exists "Authenticated can read maintenance_visit_logs" on public.maintenance_visit_logs;
create policy "Authenticated can read maintenance_visit_logs"
on public.maintenance_visit_logs
for select
to authenticated
using (true);

drop policy if exists "Authenticated can insert maintenance_visit_logs" on public.maintenance_visit_logs;
create policy "Authenticated can insert maintenance_visit_logs"
on public.maintenance_visit_logs
for insert
to authenticated
with check (true);
