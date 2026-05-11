-- Sommige planten zijn kunstmatig (plastiek/zijde). Die krijgen geen
-- water of voeding tijdens onderhoud, alleen bladglans-spuitbus.

alter table public.plants
  add column if not exists is_artificial boolean default false;

create index if not exists plants_is_artificial_idx
  on public.plants(is_artificial) where is_artificial = true;
