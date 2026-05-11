-- Phase 1 van de vervangings-offerte feature: foto van de ruimte waar
-- de nieuwe plant moet komen. Slaan we per visit_plant op zodat we
-- later (Phase 4) een AI-render kunnen genereren waarop de
-- voorgestelde plant in dezelfde ruimte staat.

alter table public.maintenance_visit_plants
  add column if not exists replacement_room_photo_path text,
  add column if not exists replacement_room_photo_url  text;
