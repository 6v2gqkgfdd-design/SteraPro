-- Eenmalige opkuis: bestaande beurten waar potgrond nog per verpotte
-- plant geregistreerd staat (oude versie van de auto-flow), worden
-- geconsolideerd tot één aggregaat-rij per beurt.
--
-- De nieuwe save-logica (zie app/maintenance/[id]/plants/[plantId]/
-- page.tsx) doet dit automatisch bij elke save, maar reeds afgewerkte
-- beurten zitten nog vast op het oude formaat tot deze script eens
-- gerund wordt.

do $$
declare
  v record;
  potgrond_id uuid;
begin
  select id into potgrond_id
  from public.consumable_catalog
  where name = 'Potgrond' and active = true
  limit 1;

  for v in
    select vc.visit_id,
           sum(vc.quantity) as total_l,
           count(*)         as cnt
    from public.maintenance_visit_consumables vc
    where vc.notes like '%[auto:repot:%'
      and vc.notes not like '%[auto:repot-soil:%'
      and (
        vc.custom_name = 'Potgrond'
        or vc.catalog_item_id in (
          select id from public.consumable_catalog where name = 'Potgrond'
        )
      )
    group by vc.visit_id
  loop
    delete from public.maintenance_visit_consumables
    where visit_id = v.visit_id
      and notes like '%[auto:repot:%'
      and notes not like '%[auto:repot-soil:%'
      and (
        custom_name = 'Potgrond'
        or catalog_item_id in (
          select id from public.consumable_catalog where name = 'Potgrond'
        )
      );

    insert into public.maintenance_visit_consumables
      (visit_id, catalog_item_id, custom_name, quantity, unit, notes)
    values (
      v.visit_id,
      potgrond_id,
      case when potgrond_id is null then 'Potgrond' else null end,
      v.total_l,
      'L',
      'Voor ' || v.cnt || ' verpotte plant' ||
        case when v.cnt = 1 then '' else 'en' end ||
        ' (½ van het totale potvolume) [auto:repot-soil:' || v.visit_id::text || ']'
    );
  end loop;
end $$;
