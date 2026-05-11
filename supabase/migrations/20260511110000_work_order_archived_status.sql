-- Voeg 'archived'-status toe aan work_orders voor contract-klanten.
--
-- Voor klanten met has_maintenance_contract = true maken we automatisch
-- een werkbon, maar die hoeft nooit verzonden of getekend te worden —
-- ze is enkel voor onze administratie. Status 'archived' weerspiegelt
-- dat: hij staat in de werkbonnen-lijst maar zit niet in de verstuur-flow.

alter table public.work_orders
  drop constraint if exists work_orders_status_check;

alter table public.work_orders
  add constraint work_orders_status_check
  check (status in ('draft', 'sent', 'signed', 'cancelled', 'archived'));
