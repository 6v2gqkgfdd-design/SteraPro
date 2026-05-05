-- Foto per plant per onderhoudsbeurt.
-- Tijdens het onderhoud kan de uitvoerder een foto nemen van elke
-- behandelde plant; die wordt apart bewaard zodat klant + Stera de
-- evolutie over verschillende beurten heen zien.

alter table public.maintenance_visit_plants
  add column if not exists photo_path text,
  add column if not exists photo_url text;
