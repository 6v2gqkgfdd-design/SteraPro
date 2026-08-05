-- Locatie-filter: "missing" en badges alleen voor types waar standplaats zinvol is
-- (combinaties, planten, potten, mos — niet artificial/accessoires/other).

create or replace function public.admin_catalog_search(
  p_tab text default 'all',
  p_type text default null,
  p_location text default null,
  p_stock text default null,
  p_photo text default null,
  p_offered text default null,
  p_price_min numeric default null,
  p_price_max numeric default null,
  p_height_min numeric default null,
  p_height_max numeric default null,
  p_brand text default null,
  p_plantsoort text default null,
  p_q text default null,
  p_page int default 1,
  p_page_size int default 40
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_offset int;
  v_limit int;
  v_total int := 0;
  v_items jsonb := '[]'::jsonb;
  v_open_changes int := 0;
  v_offered_total int := 0;
  v_brands jsonb := '[]'::jsonb;
  v_plantsoorten jsonb := '[]'::jsonb;
  v_type_counts jsonb := '{}'::jsonb;
  v_need_tags boolean;
begin
  if not public.is_staff() then
    raise exception 'not_staff' using errcode = '42501';
  end if;

  v_limit := greatest(coalesce(p_page_size, 40), 1);
  v_offset := greatest(0, (greatest(coalesce(p_page, 1), 1) - 1) * v_limit);
  v_need_tags := (coalesce(p_brand, '') <> '');

  select count(*)::int into v_open_changes
  from public.catalog_changes where acknowledged_at is null;

  select count(*)::int into v_offered_total
  from public.shopify_offered_items where offered = true;

  with base as (
    select
      np.itemcode,
      np.description,
      np.item_description_nl,
      np.sales_price,
      np.main_group_description_nl,
      np.product_group_description_nl,
      np.group_description_nl,
      np.item_variety_nl,
      np.pot_size,
      np.diameter,
      np.height,
      np.length,
      np.width,
      np.item_picture_name,
      np.delivery_time_in_days,
      np.is_active_at_source,
      np.show_on_website,
      coalesce(ns.stock_available, 0)::numeric as stock_available,
      (oi.itemcode is not null) as offered,
      case
        when coalesce(np.group_description_nl, '') ~* '^Combinaties' then 'combinaties'
        when coalesce(np.product_group_description_nl, '') ~* 'Mos|Mummie|Groene wanden' then 'mos'
        when coalesce(np.product_group_description_nl, '') ilike '%Artificial%'
          or coalesce(np.group_description_nl, '') ilike '%Artificial%' then 'artificial'
        when coalesce(np.product_group_description_nl, '') ilike '%Plantenbakken%' then 'potten'
        when coalesce(np.main_group_description_nl, '') = 'Planten' then 'planten'
        when coalesce(np.product_group_description_nl, '')
          ~* 'Hulpmiddelen|Decoratie|Substraat|Voeding|Documentatie|All-in' then 'accessoires'
        else 'other'
      end as catalog_type,
      nullif(
        initcap(split_part(split_part(coalesce(np.description, ''), ' in ', 1), ' ', 1)),
        ''
      ) as plantsoort,
      case when v_need_tags then np.tags::text else null end as tags_text,
      public.nk_location_from_tags(np.tags) as nk_locations,
      pe.location_binnen as enr_binnen,
      pe.location_buiten as enr_buiten,
      pe.ready_for_shopify as ready_for_shopify,
      case
        when cardinality(public.nk_location_from_tags(np.tags)) > 0
          then public.nk_location_from_tags(np.tags)
        else array_remove(
          array[
            case when pe.location_binnen is true then 'Binnen' end,
            case when pe.location_buiten is true then 'Buiten' end
          ],
          null
        )
      end as effective_locations,
      case
        when cardinality(public.nk_location_from_tags(np.tags)) > 0 then 'nieuwkoop'
        when pe.location_binnen is true or pe.location_buiten is true then coalesce(pe.location_source, 'manual')
        else 'none'
      end as location_source
    from public.nieuwkoop_products np
    left join public.nieuwkoop_stock ns on ns.itemcode = np.itemcode
    left join public.shopify_offered_items oi
      on oi.itemcode = np.itemcode and oi.offered is true
    left join public.product_enrichment pe on pe.itemcode = np.itemcode
  ),
  enriched as (
    select
      b.*,
      -- Standplaats is alleen zinvol voor planten/potten/combis/mos
      (b.catalog_type in ('combinaties', 'planten', 'potten', 'mos')) as location_relevant
    from base b
  ),
  filtered as (
    select e.*
    from enriched e
    where
      case
        when coalesce(p_tab, 'all') = 'discontinued' then e.is_active_at_source is false
        when coalesce(p_tab, 'all') = 'offered' then e.offered is true
        when coalesce(p_tab, 'all') = 'oos' then
          coalesce(e.is_active_at_source, true) is true and e.stock_available <= 0
        else coalesce(e.is_active_at_source, true) is true
      end
      and (coalesce(p_type, '') = '' or e.catalog_type = p_type)
      and (
        coalesce(p_location, '') = ''
        or (
          -- Ontbreekt: alleen bij types waar locatie telt
          p_location = 'missing'
          and e.location_relevant
          and cardinality(coalesce(e.effective_locations, '{}'::text[])) = 0
        )
        or (
          p_location in ('Binnen', 'Buiten')
          and e.location_relevant
          and p_location = any (coalesce(e.effective_locations, '{}'::text[]))
        )
      )
      and (
        coalesce(p_stock, '') = ''
        or (p_stock = 'in' and e.stock_available > 0)
        or (p_stock = 'out' and e.stock_available <= 0)
      )
      and (
        coalesce(p_photo, '') = ''
        or (p_photo = 'yes' and nullif(trim(e.item_picture_name), '') is not null)
        or (p_photo = 'no' and nullif(trim(e.item_picture_name), '') is null)
      )
      and (
        coalesce(p_offered, '') = ''
        or (p_offered = 'yes' and e.offered is true)
        or (p_offered = 'no' and e.offered is false)
      )
      and (p_price_min is null or e.sales_price >= p_price_min)
      and (p_price_max is null or e.sales_price < p_price_max)
      and (p_height_min is null or (e.height is not null and e.height >= p_height_min))
      and (p_height_max is null or (e.height is not null and e.height < p_height_max))
      and (
        coalesce(p_brand, '') = ''
        or (e.tags_text is not null and e.tags_text ilike '%' || p_brand || '%')
      )
      and (
        coalesce(p_plantsoort, '') = ''
        or e.plantsoort ilike p_plantsoort
        or e.description ilike p_plantsoort || '%'
      )
      and (
        coalesce(p_q, '') = ''
        or e.description ilike '%' || p_q || '%'
        or e.itemcode ilike '%' || p_q || '%'
        or coalesce(e.item_description_nl, '') ilike '%' || p_q || '%'
        or coalesce(e.item_variety_nl, '') ilike '%' || p_q || '%'
      )
  ),
  counted as (
    select count(*)::int as total from filtered
  ),
  page as (
    select f.*
    from filtered f
    order by f.description nulls last, f.itemcode
    limit v_limit
    offset v_offset
  )
  select
    (select total from counted),
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'itemcode', p.itemcode,
            'description', coalesce(p.description, p.itemcode),
            'detail', p.item_description_nl,
            'costPrice', p.sales_price,
            'mainGroup', p.main_group_description_nl,
            'productGroup', p.product_group_description_nl,
            'group', p.group_description_nl,
            'variety', p.item_variety_nl,
            'potSize', p.pot_size,
            'diameter', p.diameter,
            'height', p.height,
            'length', p.length,
            'width', p.width,
            'imageItemcode', case
              when nullif(trim(p.item_picture_name), '') is not null then p.itemcode
              else null
            end,
            'deliveryDays', p.delivery_time_in_days,
            'activeAtSource', coalesce(p.is_active_at_source, true),
            'stock', p.stock_available,
            'offered', p.offered,
            'showOnWebsite', p.show_on_website,
            'catalogType', p.catalog_type,
            'plantsoort', p.plantsoort,
            'locations', to_jsonb(coalesce(p.effective_locations, '{}'::text[])),
            'locationSource', case
              when not p.location_relevant then 'na'
              else p.location_source
            end,
            'locationRelevant', p.location_relevant,
            'readyForShopify', coalesce(p.ready_for_shopify, false)
          )
          order by p.description nulls last, p.itemcode
        )
        from page p
      ),
      '[]'::jsonb
    )
  into v_total, v_items;

  select coalesce(jsonb_object_agg(catalog_type, cnt), '{}'::jsonb)
  into v_type_counts
  from (
    select
      case
        when coalesce(group_description_nl, '') ~* '^Combinaties' then 'combinaties'
        when coalesce(product_group_description_nl, '') ~* 'Mos|Mummie|Groene wanden' then 'mos'
        when coalesce(product_group_description_nl, '') ilike '%Artificial%' then 'artificial'
        when coalesce(product_group_description_nl, '') ilike '%Plantenbakken%' then 'potten'
        when coalesce(main_group_description_nl, '') = 'Planten' then 'planten'
        when coalesce(product_group_description_nl, '')
          ~* 'Hulpmiddelen|Decoratie|Substraat|Voeding|Documentatie|All-in' then 'accessoires'
        else 'other'
      end as catalog_type,
      count(*)::int as cnt
    from public.nieuwkoop_products
    where coalesce(is_active_at_source, true) is true
    group by 1
  ) t;

  select coalesce(
    jsonb_agg(jsonb_build_object('name', name, 'count', cnt) order by cnt desc),
    '[]'::jsonb
  )
  into v_plantsoorten
  from (
    select
      initcap(split_part(split_part(coalesce(description, ''), ' in ', 1), ' ', 1)) as name,
      count(*)::int as cnt
    from public.nieuwkoop_products
    where coalesce(is_active_at_source, true) is true
      and main_group_description_nl = 'Planten'
      and length(trim(split_part(split_part(coalesce(description, ''), ' in ', 1), ' ', 1))) > 2
    group by 1
    having count(*) >= 8
    order by 2 desc
    limit 40
  ) p;

  begin
    select coalesce(
      jsonb_agg(jsonb_build_object('name', name, 'count', cnt) order by cnt desc),
      '[]'::jsonb
    )
    into v_brands
    from (
      select v->>'Description_NL' as name, count(*)::int as cnt
      from public.nieuwkoop_products np
      cross join lateral jsonb_array_elements(coalesce(np.tags, '[]'::jsonb)) t
      cross join lateral jsonb_array_elements(coalesce(t->'Values', '[]'::jsonb)) v
      where coalesce(np.is_active_at_source, true) is true
        and (
          coalesce(np.product_group_description_nl, '') ilike '%Plantenbakken%'
          or coalesce(np.group_description_nl, '') ~* '^Combinaties'
        )
        and t->>'Code' = 'Brand'
        and nullif(trim(v->>'Description_NL'), '') is not null
      group by 1
      order by 2 desc
      limit 40
    ) b;
  exception when others then
    v_brands := '[]'::jsonb;
  end;

  return jsonb_build_object(
    'ok', true,
    'tab', coalesce(p_tab, 'all'),
    'page', greatest(coalesce(p_page, 1), 1),
    'pageSize', v_limit,
    'total', coalesce(v_total, 0),
    'openChanges', coalesce(v_open_changes, 0),
    'offeredTotal', coalesce(v_offered_total, 0),
    'typeCounts', coalesce(v_type_counts, '{}'::jsonb),
    'brands', coalesce(v_brands, '[]'::jsonb),
    'plantsoorten', coalesce(v_plantsoorten, '[]'::jsonb),
    'items', coalesce(v_items, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.admin_catalog_search from public;
grant execute on function public.admin_catalog_search to authenticated;
