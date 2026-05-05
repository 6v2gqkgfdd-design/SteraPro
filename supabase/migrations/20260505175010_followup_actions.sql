-- Voorbereidingslijst: voeg "volgende keer"-flags toe aan
-- maintenance_visit_plants. Tijdens een onderhoud klikt de
-- onderhoudstechnicus aan wat bij het EERSTVOLGENDE bezoek gebeurd
-- moet worden. De geplande beurt verzamelt deze flags zodat hij de
-- juiste benodigdheden meeneemt (potten, aarde, snoeischaar, ...).

alter table public.maintenance_visit_plants
  add column if not exists followup_repot boolean default false,
  add column if not exists followup_prune boolean default false,
  add column if not exists followup_replace boolean default false,
  add column if not exists followup_treat boolean default false,
  add column if not exists followup_notes text;

-- Index op flags om de aggregatie per locatie snel te houden zodra er
-- veel beurten in de tabel zitten.
create index if not exists maintenance_visit_plants_followup_idx
  on public.maintenance_visit_plants(visit_id)
  where
    followup_repot = true
    or followup_prune = true
    or followup_replace = true
    or followup_treat = true
    or followup_notes is not null;
