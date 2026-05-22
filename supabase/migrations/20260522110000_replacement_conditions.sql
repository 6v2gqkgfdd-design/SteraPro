-- Extra condities die tijdens het onderhoud worden vastgelegd voor een
-- plant die vervangen moet worden. Samen met de bestaande replacement_*
-- kolommen vormen ze het profiel waarmee de offerte-plantkiezer een
-- passende hydrocultuur-plant kan voorstellen.

-- Hangplant: de vervanger moet een hangplant zijn.
alter table public.maintenance_visit_plants
  add column if not exists replacement_is_hanging boolean not null default false;

-- Gewenst onderhoudsniveau: 'easy' (makkelijk) of 'hard' (moeilijk).
alter table public.maintenance_visit_plants
  add column if not exists replacement_care_level text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'mvp_replacement_care_level_check'
  ) then
    alter table public.maintenance_visit_plants
      add constraint mvp_replacement_care_level_check
      check (replacement_care_level in ('easy', 'hard'));
  end if;
end $$;

comment on column public.maintenance_visit_plants.replacement_is_hanging
  is 'Vervangingsplant moet een hangplant zijn';
comment on column public.maintenance_visit_plants.replacement_care_level
  is 'Gewenst onderhoudsniveau van de vervangingsplant: easy of hard';
