-- Inkoopprijs afschermen voor niet-beheerders.
--
-- In v_nieuwkoop_with_margin zijn cost_price (= nieuwkoop_products.sales_price)
-- en effective_margin_factor enkel zichtbaar voor beheerders (via is_staff()).
-- Voor de webshop, anonieme bezoekers en ingelogde klanten staan ze op NULL.
-- De verkoopprijs (suggested_sale_price) blijft voor iedereen zichtbaar en
-- wordt intern nog steeds met de echte inkoop berekend.
--
-- Let op de casts: zonder ::numeric(10,2) / ::numeric(5,3) faalt CREATE OR
-- REPLACE met "cannot change data type of view column".

create or replace view public.v_nieuwkoop_with_margin as
 SELECT itemcode,
    description,
    item_picture_name,
    (CASE WHEN public.is_staff() THEN sales_price ELSE NULL END)::numeric(10,2) AS cost_price,
    (CASE WHEN public.is_staff() THEN COALESCE(( SELECT margin_config.margin_factor
           FROM margin_config
          WHERE margin_config.scope = 'item'::text AND margin_config.scope_value = np.itemcode), ( SELECT margin_config.margin_factor
           FROM margin_config
          WHERE margin_config.scope = 'product_group'::text AND margin_config.scope_value = np.product_group_code), ( SELECT margin_config.margin_factor
           FROM margin_config
          WHERE margin_config.scope = 'main_group'::text AND margin_config.scope_value = np.main_group_code), ( SELECT margin_config.margin_factor
           FROM margin_config
          WHERE margin_config.scope = 'default'::text)) ELSE NULL END)::numeric(5,3) AS effective_margin_factor,
    round(sales_price * COALESCE(( SELECT margin_config.margin_factor
           FROM margin_config
          WHERE margin_config.scope = 'item'::text AND margin_config.scope_value = np.itemcode), ( SELECT margin_config.margin_factor
           FROM margin_config
          WHERE margin_config.scope = 'product_group'::text AND margin_config.scope_value = np.product_group_code), ( SELECT margin_config.margin_factor
           FROM margin_config
          WHERE margin_config.scope = 'main_group'::text AND margin_config.scope_value = np.main_group_code), ( SELECT margin_config.margin_factor
           FROM margin_config
          WHERE margin_config.scope = 'default'::text)), 2) AS suggested_sale_price,
    main_group_code,
    main_group_description_nl,
    product_group_code,
    product_group_description_nl,
    height,
    width,
    diameter,
    diameter_culture_pot,
    pot_size,
    location_icon_nl,
    show_on_website,
    is_stock_item,
    item_status
   FROM nieuwkoop_products np;

-- Herprijzing bij klant-wijziging op /q/: inkoop rechtstreeks uit
-- nieuwkoop_products (niet uit de afgeschermde view), zodat de offerte-marge
-- blijft werken ook al is de klant geen beheerder.
create or replace function public.update_quote_line_item(_token text, _line_id uuid, _itemcode text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  _quote_id uuid;
  _status text;
  _margin numeric;
  _qty int;
  _sale numeric;
  _cost numeric;
  _desc text;
  _pic text;
  _height numeric;
  _diameter numeric;
  _spec text;
  _unit int;
  _supplier_unit int;
  _total int;
begin
  select id, status, margin_pct into _quote_id, _status, _margin
  from public.quotes where signing_token = _token;
  if _quote_id is null then
    raise exception 'Ongeldige link';
  end if;
  if _status not in ('draft','sent') then
    raise exception 'Deze offerte kan niet meer gewijzigd worden';
  end if;
  select quantity into _qty
  from public.quote_lines where id = _line_id and quote_id = _quote_id;
  if _qty is null then
    raise exception 'Regel niet gevonden';
  end if;
  _qty := greatest(1, coalesce(_qty,1));
  select v.suggested_sale_price, np.sales_price, v.description, v.item_picture_name, v.height, v.diameter
    into _sale, _cost, _desc, _pic, _height, _diameter
  from public.v_nieuwkoop_with_margin v
  join public.nieuwkoop_products np on np.itemcode = v.itemcode
  where v.itemcode = _itemcode and v.product_group_code = '275';
  if _sale is null and _cost is null then
    raise exception 'Product niet gevonden';
  end if;
  _spec := nullif(trim(both ' ·' from concat_ws(' · ',
      case when _height > 0 then 'H ' || round(_height) || ' cm' end,
      case when _diameter > 0 then 'Ø ' || round(_diameter) || ' cm' end)), '');
  if _margin is not null and _cost is not null then
    _unit := round(_cost * _margin * 100);
  else
    _unit := round(coalesce(_sale,0) * 100);
  end if;
  _supplier_unit := case when _cost is null then null else round(_cost * 100) end;
  _total := _unit * _qty;
  update public.quote_lines
  set nieuwkoop_itemcode = _itemcode,
      supplier = 'nieuwkoop',
      line_type = 'combination',
      name = coalesce(_desc, _itemcode),
      spec = _spec,
      image_url = case when _pic is not null and _pic <> ''
                       then '/api/nieuwkoop/image/' || _itemcode else null end,
      supplier_unit_price_cents = _supplier_unit,
      margin_pct = _margin,
      unit_price_cents = _unit,
      line_total_cents = _total
  where id = _line_id and quote_id = _quote_id;
  update public.quotes
  set subtotal_cents = (select coalesce(sum(line_total_cents),0)
                        from public.quote_lines where quote_id = _quote_id)
  where id = _quote_id;
  return (select jsonb_build_object(
    'id', id, 'name', name, 'spec', spec, 'image_url', image_url,
    'unit_price_cents', unit_price_cents, 'quantity', quantity,
    'line_total_cents', line_total_cents, 'nieuwkoop_itemcode', nieuwkoop_itemcode
  ) from public.quote_lines where id = _line_id);
end;
$function$;
