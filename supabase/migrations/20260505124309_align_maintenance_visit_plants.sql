-- Aligneer maintenance_visit_plants met de UI in app/maintenance/[id]/plants/[plantId]/page.tsx.
-- Voegt drie ontbrekende kolommen toe: action_fed, action_rotated, health_status.
-- Bestaande action_*-kolommen blijven ongemoeid.

alter table public.maintenance_visit_plants
  add column if not exists action_fed boolean default false,
  add column if not exists action_rotated boolean default false,
  add column if not exists health_status text;
