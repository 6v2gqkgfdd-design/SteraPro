-- ──────────────────────────────────────────────────────────────────
-- Verwijderen van onderhoudsbeurten en planten mogelijk maken.
--
-- Symptoom: in de app lukte het niet om een onderhoudsbeurt of een
-- plant te verwijderen — de delete sloeg stil 0 rijen aan.
--
-- Oorzaak:
--   1. De DELETE-policy op maintenance_visits / plants ontbrak (of was
--      nog niet toegepast op deze database). Zonder DELETE-policy
--      blokkeert Row Level Security elke delete, en dat zonder
--      foutmelding.
--   2. Een foreign key naar plants stond mogelijk op NO ACTION /
--      RESTRICT, waardoor een plant met geschiedenis niet weg kon.
--
-- Deze migration is idempotent en mag veilig opnieuw uitgevoerd worden.
-- ──────────────────────────────────────────────────────────────────

-- 1) DELETE-policies op de maintenance-tabellen ---------------------
drop policy if exists "Authenticated can delete maintenance_visits"
  on public.maintenance_visits;
create policy "Authenticated can delete maintenance_visits"
  on public.maintenance_visits for delete to authenticated using (true);

drop policy if exists "Authenticated can delete maintenance_visit_plants"
  on public.maintenance_visit_plants;
create policy "Authenticated can delete maintenance_visit_plants"
  on public.maintenance_visit_plants for delete to authenticated using (true);

drop policy if exists "Authenticated can delete maintenance_visit_pause_logs"
  on public.maintenance_visit_pause_logs;
create policy "Authenticated can delete maintenance_visit_pause_logs"
  on public.maintenance_visit_pause_logs for delete to authenticated using (true);

drop policy if exists "Authenticated can delete maintenance_visit_logs"
  on public.maintenance_visit_logs;
create policy "Authenticated can delete maintenance_visit_logs"
  on public.maintenance_visit_logs for delete to authenticated using (true);

-- 2) DELETE-policy op plants ----------------------------------------
drop policy if exists "Authenticated can delete plants" on public.plants;
create policy "Authenticated can delete plants"
  on public.plants for delete to authenticated using (true);

-- 3) Alle foreign keys die naar plants verwijzen en die een delete
--    zouden blokkeren (NO ACTION / RESTRICT) omzetten naar
--    ON DELETE CASCADE. Zo ruimt het verwijderen van een plant haar
--    onderhoudsgeschiedenis en meldingen automatisch mee op.
do $$
declare
  fk record;
begin
  for fk in
    select con.conname,
           ns.nspname  as schema_name,
           rel.relname as table_name,
           att.attname as column_name
    from pg_constraint con
    join pg_class      rel  on rel.oid  = con.conrelid
    join pg_namespace  ns   on ns.oid   = rel.relnamespace
    join pg_class      frel on frel.oid = con.confrelid
    join pg_attribute  att  on att.attrelid = con.conrelid
                           and att.attnum   = con.conkey[1]
    where con.contype = 'f'
      and frel.relname = 'plants'
      and con.confdeltype in ('a', 'r')   -- a = no action, r = restrict
  loop
    execute format('alter table %I.%I drop constraint %I',
                   fk.schema_name, fk.table_name, fk.conname);
    execute format(
      'alter table %I.%I add constraint %I '
      || 'foreign key (%I) references public.plants(id) on delete cascade',
      fk.schema_name, fk.table_name, fk.conname, fk.column_name);
  end loop;
end $$;
