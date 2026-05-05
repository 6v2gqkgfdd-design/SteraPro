-- Klantmeldingen: een klant kan vanaf de publieke /p/[slug] pagina
-- aangeven dat er iets mis is met een plant (vervangen, ziek,
-- beschadigd, ongedierte, anders). Stera ontvangt deze melding in
-- de app (en optioneel via e-mail).

create table if not exists public.plant_reports (
  id uuid primary key default gen_random_uuid(),
  plant_id uuid not null,
  issue_type text not null check (
    issue_type in ('replace', 'sick', 'damaged', 'pest', 'other')
  ),
  message text,
  reporter_name text,
  reporter_email text,
  status text not null default 'new' check (
    status in ('new', 'seen', 'handled')
  ),
  handled_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'plant_reports_plant_id_fkey'
  ) then
    alter table public.plant_reports
      add constraint plant_reports_plant_id_fkey
      foreign key (plant_id)
      references public.plants (id)
      on delete cascade;
  end if;
end$$;

create index if not exists plant_reports_plant_id_idx
  on public.plant_reports(plant_id);

create index if not exists plant_reports_status_idx
  on public.plant_reports(status)
  where status <> 'handled';

drop trigger if exists set_plant_reports_updated_at on public.plant_reports;
create trigger set_plant_reports_updated_at
before update on public.plant_reports
for each row execute function public.set_updated_at();

alter table public.plant_reports enable row level security;

-- Anon kan inserten — dit is hoe een klant via de QR-pagina meldt.
-- We controleren wel dat de plant_id matcht een bestaande plant.
drop policy if exists "Anon can insert plant_reports" on public.plant_reports;
create policy "Anon can insert plant_reports"
on public.plant_reports
for insert
to anon, authenticated
with check (
  exists (
    select 1 from public.plants where id = plant_id
  )
);

-- Authenticated (wij) kunnen alles lezen en bijwerken.
drop policy if exists "Authenticated can read plant_reports" on public.plant_reports;
create policy "Authenticated can read plant_reports"
on public.plant_reports
for select
to authenticated
using (true);

drop policy if exists "Authenticated can update plant_reports" on public.plant_reports;
create policy "Authenticated can update plant_reports"
on public.plant_reports
for update
to authenticated
using (true)
with check (true);

drop policy if exists "Authenticated can delete plant_reports" on public.plant_reports;
create policy "Authenticated can delete plant_reports"
on public.plant_reports
for delete
to authenticated
using (true);
