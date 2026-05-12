-- acknowledged_at op work_orders: zet timestamp wanneer Jelle een
-- goedgekeurde werkbon voor het eerst opent. Dashboard toont enkel
-- goedgekeurde werkbonnen waarvan acknowledged_at nog null is — zo
-- verdwijnt de melding vanzelf na bekijken.

alter table public.work_orders
  add column if not exists acknowledged_at timestamptz;

create index if not exists work_orders_signed_unack_idx
  on public.work_orders(signed_at)
  where status = 'signed' and acknowledged_at is null;
