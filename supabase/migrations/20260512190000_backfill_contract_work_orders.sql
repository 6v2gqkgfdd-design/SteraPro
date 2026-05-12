-- Backfill: voor elke afgewerkte beurt van een contract-klant
-- waarvoor nog géén werkbon bestaat, maken we automatisch een
-- 'archived' werkbon aan. Sinds de auto-aanmaak in maintenance-
-- actions.tsx (status='archived' bij has_maintenance_contract)
-- gebeurt dit voor nieuwe beurten al — deze script kuist enkel
-- de historische data op.

insert into public.work_orders (visit_id, status)
select v.id, 'archived'
from public.maintenance_visits v
join public.companies c on c.id = v.company_id
where v.status = 'completed'
  and c.has_maintenance_contract = true
  and not exists (
    select 1 from public.work_orders wo where wo.visit_id = v.id
  );
