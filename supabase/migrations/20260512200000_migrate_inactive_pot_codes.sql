-- Migreer plant pot_size_codes van potmaten die Stera niet voert
-- naar de actieve maten (zie ACTIVE_POT_CODES in lib/pot-sizes.ts).
-- Deactiveer ook de catalog-items voor die maten zodat ze niet meer
-- in dropdowns verschijnen, en her-aggregeer de auto-rijen voor
-- alle visits zodat de werkbon meteen de juiste binnenpot/prijs toont.

-- 1) Plant pot_size_codes migreren naar actieve maten
update public.plants
   set pot_size_code = case pot_size_code
     when 'C1'    then 'C1,5'
     when 'C1,3'  then 'C1,5'
     when 'C2,5'  then 'C3'
     when 'C12'   then 'C10'
     when 'C25'   then 'C20'
     when 'C30'   then 'C20'
     when 'C35'   then 'C20'
     when 'C45'   then 'C20'
     when 'C55'   then 'C20'
     when 'C70'   then 'C20'
     when 'C90'   then 'C20'
     when 'C130'  then 'C20'
     when 'C180'  then 'C20'
     else pot_size_code
   end
 where pot_size_code in (
   'C1','C1,3','C2,5','C12','C25','C30','C35','C45','C55','C70','C90','C130','C180'
 );

-- 2) Catalog-items van niet-gebruikte maten deactiveren
update public.consumable_catalog
   set active = false
 where name in (
   'Binnenpot C1', 'Binnenpot C1,3', 'Binnenpot C2,5',
   'Binnenpot C12', 'Binnenpot C25', 'Binnenpot C30',
   'Binnenpot C35', 'Binnenpot C45', 'Binnenpot C55',
   'Binnenpot C70', 'Binnenpot C90', 'Binnenpot C130',
   'Binnenpot C180'
 );

-- 3) Her-aggregeer alle auto-rijen voor visits die ze hebben.
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
    delete from public.maintenance_visit_consumables
    where visit_id = v.visit_id
      and (notes like '%[auto:repot-pot:%'
           or notes like '%[auto:repot-soil:%');

    total_liters := 0;
    total_count := 0;

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
        when 'C1,5'  then 1.5
        when 'C2'    then 2
        when 'C3'    then 3
        when 'C4'    then 4
        when 'C5'    then 5
        when 'C7,5'  then 7.5
        when 'C10'   then 10
        when 'C15'   then 15
        when 'C20'   then 20
        else 0
      end;

      total_liters := total_liters + size_row.cnt * liters_for_code;
      total_count := total_count + size_row.cnt;
    end loop;

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
