-- =====================================================================
-- Admin catalogus-zoekfunctie met filters (full catalog)
-- =====================================================================

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
  v_total int;
  v_items jsonb;
  v_open_changes int;
  v_offered_total int;
  v_brands jsonb;
  v_plantsoorten jsonb;
  v_type_counts jsonb;
begin
  -- Enkel staff
  if not public.is_staff() then
    raise exception 'not_staff' using errcode = '42501';
  end if;

  v_offset := greatest(0, (greatest(coalesce(p_page, 1), 1) - 1) * greatest(coalesce(p_page_size, 40), 1));

  -- Tellingen voor UI
  select count(*)::int into v_open_changes
  from public.catalog_changes
  where acknowledged_at is null;

  select count(*)::int into v_offered_total
  from public.shopify_offered_items
  where offered = true;

  -- Basis-CTE met type + tags-afgeleiden
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
      np.tags,
      coalesce(ns.stock_available, 0)::numeric as stock_available,
      coalesce(oi.offered, false) as offered,
      case
        when coalesce(np.group_description_nl, '') ~* '^Combinaties' then 'combinaties'
        when coalesce(np.product_group_description_nl, '') ~* 'Mos|Mummie|Groene wanden'
          or coalesce(np.group_description_nl, '') ~* '\mmos\M' then 'mos'
        when coalesce(np.product_group_description_nl, '') ilike '%Artificial%'
          or coalesce(np.group_description_nl, '') ilike '%Artificial%' then 'artificial'
        when coalesce(np.product_group_description_nl, '') ilike '%Plantenbakken%' then 'potten'
        when coalesce(np.main_group_description_nl, '') = 'Planten' then 'planten'
        when coalesce(np.product_group_description_nl, '') ~* 'Hulpmiddelen|Decoratie|Substraat|Voeding|Documentatie|All-in'
          then 'accessoires'
        else 'other'
      end as catalog_type,
      (
        select string_agg(distinct v->>'Description_NL', '|')
        from jsonb_array_elements(coalesce(np.tags, '[]'::jsonb)) t
        cross join lateral jsonb_array_elements(coalesce(t->'Values', '[]'::jsonb)) v
        where t->>'Code' = 'Brand'
          and nullif(trim(v->>'Description_NL'), '') is not null
      ) as brands,
      (
        select string_agg(distinct v->>'Description_NL', '|')
        from jsonb_array_elements(coalesce(np.tags, '[]'::jsonb)) t
        cross join lateral jsonb_array_elements(coalesce(t->'Values', '[]'::jsonb)) v
        where t->>'Code' = 'Location'
          and nullif(trim(v->>'Description_NL'), '') is not null
      ) as locations,
      initcap(
        split_part(
          split_part(coalesce(np.description, ''), ' in ', 1),
          ' ',
          1
        )
      ) as plantsoort
    from public.nieuwkoop_products np
    left join public.nieuwkoop_stock ns on ns.itemcode = np.itemcode
    left join public.shopify_offered_items oi
      on oi.itemcode = np.itemcode and oi.offered = true
  ),
  filtered as (
    select *
    from base b
    where
      -- tab
      case
        when p_tab = 'discontinued' then b.is_active_at_source = false
        when p_tab = 'offered' then b.offered = true
        when p_tab = 'oos' then coalesce(b.is_active_at_source, true) = true
          and b.stock_available <= 0
        else coalesce(b.is_active_at_source, true) = true
      end
      -- type
      and (p_type is null or p_type = '' or b.catalog_type = p_type)
      -- location
      and (
        p_location is null or p_location = ''
        or (b.locations is not null and b.locations ilike '%' || p_location || '%')
      )
      -- stock
      and (
        p_stock is null or p_stock = ''
        or (p_stock = 'in' and b.stock_available > 0)
        or (p_stock = 'out' and b.stock_available <= 0)
      )
      -- photo
      and (
        p_photo is null or p_photo = ''
        or (p_photo = 'yes' and nullif(trim(b.item_picture_name), '') is not null)
        or (p_photo = 'no' and nullif(trim(b.item_picture_name), '') is null)
      )
      -- offered (extra, naast tab)
      and (
        p_offered is null or p_offered = ''
        or (p_offered = 'yes' and b.offered = true)
        or (p_offered = 'no' and b.offered = false)
      )
      -- price
      and (p_price_min is null or b.sales_price >= p_price_min)
      and (p_price_max is null or b.sales_price < p_price_max)
      -- height
      and (p_height_min is null or b.height >= p_height_min)
      and (p_height_max is null or b.height < p_height_max)
      -- brand
      and (
        p_brand is null or p_brand = ''
        or (b.brands is not null and b.brands ilike '%' || p_brand || '%')
      )
      -- plantsoort
      and (
        p_plantsoort is null or p_plantsoort = ''
        or b.plantsoort ilike p_plantsoort
        or b.description ilike p_plantsoort || '%'
      )
      -- free text
      and (
        p_q is null or p_q = ''
        or b.description ilike '%' || p_q || '%'
        or b.itemcode ilike '%' || p_q || '%'
        or coalesce(b.item_description_nl, '') ilike '%' || p_q || '%'
        or coalesce(b.item_variety_nl, '') ilike '%' || p_q || '%'
      )
  )
  select count(*)::int into v_total from filtered;

  select coalesce(jsonb_agg(row_to_json(x)::jsonb), '[]'::jsonb)
  into v_items
  from (
    select
      f.itemcode,
      coalesce(f.description, f.itemcode) as description,
      f.item_description_nl as detail,
      f.sales_price as "costPrice",
      f.main_group_description_nl as "mainGroup",
      f.product_group_description_nl as "productGroup",
      f.group_description_nl as "group",
      f.item_variety_nl as variety,
      f.pot_size as "potSize",
      f.diameter,
      f.height,
      f.length,
      f.width,
      case when nullif(trim(f.item_picture_name), '') is not null then f.itemcode else null end as "imageItemcode",
      f.delivery_time_in_days as "deliveryDays",
      coalesce(f.is_active_at_source, true) as "activeAtSource",
      f.stock_available as stock,
      f.offered,
      f.show_on_website as "showOnWebsite",
      f.catalog_type as "catalogType",
      f.brands as brand,
      f.locations as location,
      f.plantsoort
    from filtered f
    order by f.description nulls last, f.itemcode
    limit greatest(coalesce(p_page_size, 40), 1)
    offset v_offset
  ) x;

  -- Facet-opties (op actieve catalogus, niet op huidige filter — top N)
  select coalesce(jsonb_agg(jsonb_build_object('name', name, 'count', cnt) order by cnt desc), '[]'::jsonb)
  into v_brands
  from (
    select v->>'Description_NL' as name, count(*)::int as cnt
    from public.nieuwkoop_products np
    cross join lateral jsonb_array_elements(coalesce(np.tags, '[]'::jsonb)) t
    cross join lateral jsonb_array_elements(coalesce(t->'Values', '[]'::jsonb)) v
    where coalesce(np.is_active_at_source, true) = true
      and t->>'Code' = 'Brand'
      and nullif(trim(v->>'Description_NL'), '') is not null
    group by 1
    order by 2 desc
    limit 40
  ) b;

  select coalesce(jsonb_agg(jsonb_build_object('name', name, 'count', cnt) order by cnt desc), '[]'::jsonb)
  into v_plantsoorten
  from (
    select
      initcap(split_part(split_part(coalesce(description, ''), ' in ', 1), ' ', 1)) as name,
      count(*)::int as cnt
    from public.nieuwkoop_products
    where coalesce(is_active_at_source, true) = true
      and main_group_description_nl = 'Planten'
      and nullif(trim(split_part(split_part(coalesce(description, ''), ' in ', 1), ' ', 1)), '') is not null
    group by 1
    having count(*) >= 5
    order by 2 desc
    limit 50
  ) p;

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
        when coalesce(product_group_description_nl, '') ~* 'Hulpmiddelen|Decoratie|Substraat|Voeding|Documentatie|All-in'
          then 'accessoires'
        else 'other'
      end as catalog_type,
      count(*)::int as cnt
    from public.nieuwkoop_products
    where coalesce(is_active_at_source, true) = true
    group by 1
  ) t;

  return jsonb_build_object(
    'ok', true,
    'tab', p_tab,
    'page', greatest(coalesce(p_page, 1), 1),
    'pageSize', greatest(coalesce(p_page_size, 40), 1),
    'total', v_total,
    'openChanges', v_open_changes,
    'offeredTotal', v_offered_total,
    'typeCounts', v_type_counts,
    'brands', v_brands,
    'plantsoorten', v_plantsoorten,
    'items', v_items
  );
end;
$$;

revoke all on function public.admin_catalog_search from public;
grant execute on function public.admin_catalog_search to authenticated;
