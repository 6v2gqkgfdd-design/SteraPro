-- Snellere admin_catalog_search:
-- 1) zware location/tags alleen voor de pagina-rijen (40), niet voor alle 30k
-- 2) has_nk_photo filter zonder extra joins
-- 3) typeCounts/brands/plantsoorten lichter
-- Doel: photo=yes onder ~2s i.p.v. ~8s (PostgREST timeout)

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
  p_page_size int default 40,
  p_optimized text default null
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
  v_need_location boolean;
  v_need_brand boolean;
  v_photo text;
begin
  if not public.is_staff() then
    raise exception 'not_staff' using errcode = '42501';
  end if;

  v_limit := greatest(coalesce(p_page_size, 40), 1);
  v_offset := greatest(0, (greatest(coalesce(p_page, 1), 1) - 1) * v_limit);
  v_need_location := (coalesce(p_location, '') <> '');
  v_need_brand := (coalesce(p_brand, '') <> '');
  -- normaliseer foto-filter (defensief tegen labels / casing)
  v_photo := lower(trim(coalesce(p_photo, '')));
  if v_photo in ('met nk-foto', 'met_nk_foto', 'with', 'true', '1') then
    v_photo := 'yes';
  elsif v_photo in ('zonder nk-foto', 'zonder_nk_foto', 'without', 'false', '0') then
    v_photo := 'no';
  elsif v_photo not in ('yes', 'no', '') then
    v_photo := '';
  end if;

  select count(*)::int into v_open_changes
  from public.catalog_changes where acknowledged_at is null;

  select count(*)::int into v_offered_total
  from public.shopify_offered_items where offered = true;

  -- Lichte basisfilter: géén tags/location op alle rijen
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
      np.has_image,
      np.delivery_time_in_days,
      np.is_active_at_source,
      np.show_on_website,
      np.tags,
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
      pe.location_binnen as enr_binnen,
      pe.location_buiten as enr_buiten,
      pe.location_source as enr_location_source,
      pe.ready_for_shopify as ready_for_shopify,
      pe.studio_image_path as studio_image_path,
      coalesce(pe.optimized, false) as optimized,
      case
        when np.has_image is true then true
        when np.has_image is false then false
        when nullif(trim(np.item_picture_name), '') is not null then true
        else false
      end as has_nk_photo
    from public.nieuwkoop_products np
    left join public.nieuwkoop_stock ns on ns.itemcode = np.itemcode
    left join public.shopify_offered_items oi
      on oi.itemcode = np.itemcode and oi.offered is true
    left join public.product_enrichment pe on pe.itemcode = np.itemcode
  ),
  filtered as (
    select b.*
    from base b
    where
      case
        when coalesce(p_tab, 'all') = 'discontinued' then b.is_active_at_source is false
        when coalesce(p_tab, 'all') = 'offered' then b.offered is true
        when coalesce(p_tab, 'all') = 'oos' then
          coalesce(b.is_active_at_source, true) is true and b.stock_available <= 0
        else coalesce(b.is_active_at_source, true) is true
      end
      and (coalesce(p_type, '') = '' or b.catalog_type = p_type)
      and (
        coalesce(p_stock, '') = ''
        or (p_stock = 'in' and b.stock_available > 0)
        or (p_stock = 'out' and b.stock_available <= 0)
      )
      and (
        v_photo = ''
        or (v_photo = 'yes' and b.has_nk_photo is true)
        or (v_photo = 'no' and b.has_nk_photo is false)
      )
      and (
        coalesce(p_offered, '') = ''
        or (p_offered = 'yes' and b.offered is true)
        or (p_offered = 'no' and b.offered is false)
      )
      and (p_price_min is null or b.sales_price >= p_price_min)
      and (p_price_max is null or b.sales_price < p_price_max)
      and (p_height_min is null or (b.height is not null and b.height >= p_height_min))
      and (p_height_max is null or (b.height is not null and b.height < p_height_max))
      and (
        coalesce(p_plantsoort, '') = ''
        or b.plantsoort ilike p_plantsoort
        or b.description ilike p_plantsoort || '%'
      )
      and (
        coalesce(p_q, '') = ''
        or b.description ilike '%' || p_q || '%'
        or b.itemcode ilike '%' || p_q || '%'
        or coalesce(b.item_description_nl, '') ilike '%' || p_q || '%'
        or coalesce(b.item_variety_nl, '') ilike '%' || p_q || '%'
      )
      and (
        coalesce(p_optimized, '') = ''
        or (p_optimized = 'yes' and b.optimized is true)
        or (p_optimized = 'no' and b.optimized is not true)
      )
      -- brand alleen als gevraagd (tags scan)
      and (
        not v_need_brand
        or (b.tags is not null and b.tags::text ilike '%' || p_brand || '%')
      )
      -- location: alleen evalueren als filter actief
      and (
        not v_need_location
        or (
          b.catalog_type in ('combinaties', 'planten', 'potten', 'mos')
          and (
            (
              p_location = 'missing'
              and cardinality(coalesce(public.nk_location_from_tags(b.tags), '{}'::text[])) = 0
              and b.enr_binnen is not true
              and b.enr_buiten is not true
            )
            or (
              p_location in ('Binnen', 'Buiten')
              and (
                p_location = any (coalesce(public.nk_location_from_tags(b.tags), '{}'::text[]))
                or (p_location = 'Binnen' and b.enr_binnen is true)
                or (p_location = 'Buiten' and b.enr_buiten is true)
              )
            )
          )
        )
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
  ),
  page_enriched as (
    select
      p.*,
      (p.catalog_type in ('combinaties', 'planten', 'potten', 'mos')) as location_relevant,
      case
        when cardinality(coalesce(public.nk_location_from_tags(p.tags), '{}'::text[])) > 0
          then public.nk_location_from_tags(p.tags)
        else array_remove(
          array[
            case when p.enr_binnen is true then 'Binnen' end,
            case when p.enr_buiten is true then 'Buiten' end
          ],
          null
        )
      end as effective_locations,
      case
        when cardinality(coalesce(public.nk_location_from_tags(p.tags), '{}'::text[])) > 0 then 'nieuwkoop'
        when p.enr_binnen is true or p.enr_buiten is true then coalesce(p.enr_location_source, 'manual')
        else 'none'
      end as location_source
    from page p
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
            'imageItemcode', case when p.has_nk_photo then p.itemcode else null end,
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
            'readyForShopify', coalesce(p.ready_for_shopify, false),
            'optimized', coalesce(p.optimized, false),
            'hasStudioImage', (p.studio_image_path is not null and trim(p.studio_image_path) <> ''),
            'studioImagePath', p.studio_image_path
          )
          order by p.description nulls last, p.itemcode
        )
        from page_enriched p
      ),
      '[]'::jsonb
    )
  into v_total, v_items;

  -- Type counts: één scan, actieve items
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

  -- Brands: alleen bij brand-filter of altijd licht houden (top 40)
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
    'items', coalesce(v_items, '[]'::jsonb),
    'debugPhoto', v_photo
  );
end;
$$;

revoke all on function public.admin_catalog_search from public;
grant execute on function public.admin_catalog_search to authenticated;
