-- DELETE-policies op de maintenance-tabellen.
-- Tot nu toe enkel select/insert/update; daardoor sloeg een delete vanuit
-- de UI silently 0 rijen aan. Beheerder mag in de UI een onderhoudsbeurt
-- verwijderen — daarvoor moet de policy expliciet zijn.

drop policy if exists "Authenticated can delete maintenance_visits"
  on public.maintenance_visits;
create policy "Authenticated can delete maintenance_visits"
  on public.maintenance_visits
  for delete
  to authenticated
  using (true);

drop policy if exists "Authenticated can delete maintenance_visit_plants"
  on public.maintenance_visit_plants;
create policy "Authenticated can delete maintenance_visit_plants"
  on public.maintenance_visit_plants
  for delete
  to authenticated
  using (true);

drop policy if exists "Authenticated can delete maintenance_visit_pause_logs"
  on public.maintenance_visit_pause_logs;
create policy "Authenticated can delete maintenance_visit_pause_logs"
  on public.maintenance_visit_pause_logs
  for delete
  to authenticated
  using (true);

drop policy if exists "Authenticated can delete maintenance_visit_logs"
  on public.maintenance_visit_logs;
create policy "Authenticated can delete maintenance_visit_logs"
  on public.maintenance_visit_logs
  for delete
  to authenticated
  using (true);
