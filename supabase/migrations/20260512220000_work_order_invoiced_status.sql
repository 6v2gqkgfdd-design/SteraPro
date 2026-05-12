-- 'invoiced' toelaten als geldige werkbon-status. Het veld
-- invoiced_at bestond al sinds de eerste werkbon-migration, maar de
-- check-constraint blokkeerde de status-update. Hier breiden we hem
-- uit met 'invoiced' (en hernemen 'archived' dat al gebruikt werd).

alter table public.work_orders
  drop constraint if exists work_orders_status_check;

alter table public.work_orders
  add constraint work_orders_status_check
  check (status in (
    'draft', 'sent', 'signed', 'invoiced', 'cancelled', 'archived'
  ));
