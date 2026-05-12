-- Bestaande visit_consumables-rijen koppelen aan hun catalog-item
-- via custom_name. Nodig omdat de auto-aggregatie (Verpot → binnenpot
-- + potgrond) in vroegere builds rijen wegschreef met enkel
-- custom_name, zonder catalog_item_id, op momenten dat de catalog-
-- entries nog niet bestonden.
--
-- Resultaat: catalog-prijzen worden voortaan dynamisch gelezen door
-- de werkbon, ook voor afgewerkte beurten. Volgende prijswijziging
-- werkt automatisch overal door.

update public.maintenance_visit_consumables vc
   set catalog_item_id = cc.id,
       custom_name = null
  from public.consumable_catalog cc
 where vc.catalog_item_id is null
   and vc.custom_name is not null
   and cc.name = vc.custom_name
   and cc.active = true;
