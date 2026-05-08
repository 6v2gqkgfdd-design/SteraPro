-- Vervangingsspecificaties op maintenance_visit_plants.
--
-- Wanneer een plant tijdens een onderhoudsbeurt gemarkeerd wordt
-- voor vervanging (followup_replace = true), willen we meteen weten
-- WELKE plant we moeten leveren bij het volgende bezoek. Daarom
-- houden we lichtniveau, hoogte, pot-diameter en outdoor-pot-flag
-- bij. Later komt hier nog 'replacement_status' (besteld / geleverd)
-- en koppelingen naar leveranciers (bv. Nieuwkoop API) bij.

alter table public.maintenance_visit_plants
  add column if not exists replacement_light_level text
    check (replacement_light_level in ('high', 'medium', 'low')),
  add column if not exists replacement_height_cm integer
    check (replacement_height_cm is null or replacement_height_cm > 0),
  add column if not exists replacement_pot_diameter_cm integer
    check (replacement_pot_diameter_cm is null or replacement_pot_diameter_cm > 0),
  add column if not exists replacement_needs_outer_pot boolean default false,
  add column if not exists replacement_notes text;

create index if not exists maintenance_visit_plants_replacement_idx
  on public.maintenance_visit_plants(visit_id)
  where followup_replace = true;
