-- Sync visit_plant.health_status met plants.status voor dode/te-
-- vervangen planten. Historisch zijn er visit_plant-rijen aangemaakt
-- door applyStandardMaintenance die altijd health_status='healthy'
-- zetten, ook al was plant.status='dead'. Dat liet zo'n plant
-- verkeerd in de "Gezond"-bucket van de werkbon belanden.
--
-- De code zelf is intussen aangepast om dit niet meer te doen voor
-- nieuwe rijen — deze script kuist de bestaande boel op.

update public.maintenance_visit_plants vp
   set health_status = 'dead'
  from public.plants p
 where vp.plant_id = p.id
   and p.status in ('dead', 'replacement_needed')
   and coalesce(vp.health_status, '') <> 'dead';
