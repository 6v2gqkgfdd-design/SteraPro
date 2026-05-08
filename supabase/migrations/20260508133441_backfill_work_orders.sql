-- Backfill werkbonnen voor onderhoudsbeurten die al voltooid waren
-- vóór de werkbonnen-feature live ging. Eén werkbon per beurt
-- (status = draft) zodat ze meteen in 'Nog te versturen' verschijnen.

insert into public.work_orders (visit_id)
select v.id
from public.maintenance_visits v
where v.status = 'completed'
  and not exists (
    select 1 from public.work_orders wo where wo.visit_id = v.id
  );
