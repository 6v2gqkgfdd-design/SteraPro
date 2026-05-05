-- Verzorgingstips per plant. Wordt automatisch gegenereerd door Claude op
-- basis van de plant.species zodra een plant wordt aangemaakt of als de
-- soort bijgewerkt wordt. Klant en uitvoerder zien daardoor meteen de
-- belangrijkste verzorgingsinstructies.

alter table public.plants
  add column if not exists care_tips text,
  add column if not exists care_tips_species text,
  add column if not exists care_tips_updated_at timestamptz;
