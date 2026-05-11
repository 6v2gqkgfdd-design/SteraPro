-- Optionele foto bij een klantmelding (klant kan op /p/[slug]/report
-- een foto nemen van wat er fout is).

alter table public.plant_reports
  add column if not exists photo_path text,
  add column if not exists photo_url  text;
