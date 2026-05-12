-- Eenmalige opkuis: bestaande beurten waar binnenpotten nog één
-- regel per verpotte plant tonen, worden samengevoegd tot één
-- regel per (visit, pot-maat) met de juiste quantity.
--
-- De nieuwe save-logica doet dit automatisch, maar reeds opgeslagen
-- beurten blijven anders op het oude formaat staan.

do $$
declare
  v record;
  catalog_id uuid;
  catalog_description text;
  display_name text;
begin
  for v in
    select vc.visit_id,
           coalesce(cc.name, vc.custom_name) as size_name,
           count(*) as cnt
    from public.maintenance_visit_consumables vc
    left join public.consumable_catalog cc on cc.id = vc.catalog_item_id
    where vc.notes like '%[auto:repot:%'
      and vc.notes not like '%[auto:repot-soil:%'
      and vc.notes not like '%[auto:repot-pot:%'
      and (
        vc.custom_name like 'Binnenpot %'
        or cc.name like 'Binnenpot %'
      )
    group by vc.visit_id, coalesce(cc.name, vc.custom_name)
  loop
    -- Catalog-info voor deze maat ophalen (voor prijs én voor de
    -- notitie). Mag null zijn als de seed nog niet gerund is.
    select id, description into catalog_id, catalog_description
    from public.consumable_catalog
    where name = v.size_name and active = true
    limit 1;

    display_name := coalesce(catalog_description, v.size_name);

    -- Oude per-plant rijen voor dit (visit, maat) weggooien.
    delete from public.maintenance_visit_consumables vc
    where vc.visit_id = v.visit_id
      and vc.notes like '%[auto:repot:%'
      and vc.notes not like '%[auto:repot-soil:%'
      and vc.notes not like '%[auto:repot-pot:%'
      and (
        vc.custom_name = v.size_name
        or vc.catalog_item_id in (
          select id from public.consumable_catalog where name = v.size_name
        )
      );

    -- Eén aggregaat-rij invoegen voor dit (visit, maat).
    insert into public.maintenance_visit_consumables
      (visit_id, catalog_item_id, custom_name, quantity, unit, notes)
    values (
      v.visit_id,
      catalog_id,
      case when catalog_id is null then v.size_name else null end,
      v.cnt,
      'stuk',
      display_name || ' [auto:repot-pot:' || v.visit_id::text || ']'
    );
  end loop;
end $$;
