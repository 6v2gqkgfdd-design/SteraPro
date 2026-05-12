-- Opkuis: planten die dood zijn of voor vervanging staan, zijn niet
-- écht verpot — toch hebben we historisch saves laten passeren waar
-- action_repotted én een dood-flag samen aanstonden. Dit zet de
-- flag op false voor die inconsistente rijen, en herbouwt daarna
-- de auto-aggregaten "Binnenpot C…" en "Potgrond" per beurt.
--
-- Pot-mapping (code → liters) zit hieronder inline als CASE — niet
-- via een temp table, want Supabase's SQL Editor draait statements in
-- aparte connecties waardoor een temp table niet meer bestaat tegen
-- de tijd dat het do-blok eraan begint.

-- 1. action_repotted corrigeren voor dode/te-vervangen planten.
update public.maintenance_visit_plants vp
   set action_repotted = false
  from public.plants p
 where vp.plant_id = p.id
   and vp.action_repotted = true
   and (
        vp.health_status = 'dead'
     or vp.followup_replace = true
     or p.status in ('dead', 'replacement_needed')
   );

-- 2. Aggregaten herbouwen per visit waar er al auto-rijen zaten.
do $$
declare
  v record;
  size_row record;
  potgrond_id uuid;
  catalog_id uuid;
  catalog_description text;
  display_name text;
  total_liters numeric;
  total_count int;
  soil_liters numeric;
  liters_for_code numeric;
begin
  select id into potgrond_id
  from public.consumable_catalog
  where name = 'Potgrond' and active = true
  limit 1;

  for v in
    select distinct visit_id
    from public.maintenance_visit_consumables
    where notes like '%[auto:repot-pot:%'
       or notes like '%[auto:repot-soil:%'
  loop
    -- Oude aggregaten weg
    delete from public.maintenance_visit_consumables
    where visit_id = v.visit_id
      and (notes like '%[auto:repot-pot:%'
           or notes like '%[auto:repot-soil:%');

    total_liters := 0;
    total_count := 0;

    -- Per maat: één binnenpot-regel met aantal als quantity
    for size_row in
      select p.pot_size_code as code, count(*) as cnt
      from public.maintenance_visit_plants vp
      join public.plants p on p.id = vp.plant_id
      where vp.visit_id = v.visit_id
        and vp.action_repotted = true
        and coalesce(vp.followup_replace, false) = false
        and coalesce(vp.health_status, '') <> 'dead'
        and coalesce(p.status, '') not in ('dead', 'replacement_needed')
        and p.pot_size_code is not null
      group by p.pot_size_code
    loop
      select id, description into catalog_id, catalog_description
      from public.consumable_catalog
      where name = 'Binnenpot ' || size_row.code
        and active = true
      limit 1;

      display_name := coalesce(
        catalog_description,
        'Binnenpot ' || size_row.code
      );

      insert into public.maintenance_visit_consumables
        (visit_id, catalog_item_id, custom_name, quantity, unit, notes)
      values (
        v.visit_id,
        catalog_id,
        case when catalog_id is null
             then 'Binnenpot ' || size_row.code
             else null
        end,
        size_row.cnt,
        'stuk',
        display_name || ' [auto:repot-pot:' || v.visit_id::text || ']'
      );

      liters_for_code := case size_row.code
        when 'C1'    then 1
        when 'C1,3'  then 1.3
        when 'C1,5'  then 1.5
        when 'C2'    then 2
        when 'C2,5'  then 2.5
        when 'C3'    then 3
        when 'C4'    then 4
        when 'C5'    then 5
        when 'C7,5'  then 7.5
        when 'C10'   then 10
        when 'C12'   then 12
        when 'C15'   then 15
        when 'C20'   then 20
        when 'C25'   then 25
        when 'C30'   then 30
        when 'C35'   then 35
        when 'C45'   then 45
        when 'C55'   then 55
        when 'C70'   then 70
        when 'C90'   then 90
        when 'C130'  then 130
        when 'C180'  then 180
        else 0
      end;

      total_liters := total_liters + size_row.cnt * liters_for_code;
      total_count := total_count + size_row.cnt;
    end loop;

    -- Eén potgrond-aggregaat per beurt
    if total_liters > 0 then
      soil_liters := round((total_liters / 2)::numeric, 2);
      insert into public.maintenance_visit_consumables
        (visit_id, catalog_item_id, custom_name, quantity, unit, notes)
      values (
        v.visit_id,
        potgrond_id,
        case when potgrond_id is null then 'Potgrond' else null end,
        soil_liters,
        'L',
        'Voor ' || total_count || ' verpotte plant'
          || case when total_count = 1 then '' else 'en' end
          || ' [auto:repot-soil:' || v.visit_id::text || ']'
      );
    end if;
  end loop;
end $$;
