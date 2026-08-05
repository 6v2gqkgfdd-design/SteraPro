-- =====================================================================
-- Full Nieuwkoop-catalogus + change-inbox + item-level webshop-selectie
-- Migration: 2026-08-05
-- =====================================================================

-- 1) Tracking op de ruwe catalogus-spiegel
alter table public.nieuwkoop_products
  add column if not exists first_seen_at timestamptz not null default now();

alter table public.nieuwkoop_products
  add column if not exists last_seen_at timestamptz not null default now();

alter table public.nieuwkoop_products
  add column if not exists is_active_at_source boolean not null default true;

alter table public.nieuwkoop_products
  add column if not exists discontinued_at timestamptz;

create index if not exists nieuwkoop_products_last_seen_idx
  on public.nieuwkoop_products (last_seen_at desc);

create index if not exists nieuwkoop_products_active_source_idx
  on public.nieuwkoop_products (is_active_at_source);

create index if not exists nieuwkoop_products_main_group_desc_idx
  on public.nieuwkoop_products (main_group_description_nl);

create index if not exists nieuwkoop_products_group_desc_idx
  on public.nieuwkoop_products (group_description_nl);

-- 2) Item-level selectie voor de webshop (full catalog)
--    Bestaande shopify_offered_products (group_name) blijft voor combi-groepen;
--    nieuwe selectie loopt primair via itemcode.
create table if not exists public.shopify_offered_items (
  itemcode   text primary key references public.nieuwkoop_products(itemcode) on delete cascade,
  offered    boolean not null default true,
  updated_at timestamptz not null default now()
);

create index if not exists shopify_offered_items_offered_idx
  on public.shopify_offered_items (offered)
  where offered = true;

alter table public.shopify_offered_items enable row level security;

drop policy if exists "staff_manage_offered_items" on public.shopify_offered_items;
create policy "staff_manage_offered_items" on public.shopify_offered_items
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- 3) Ochtend-inbox: nieuw / weer op voorraad / prijs / specs / verdwenen
create table if not exists public.catalog_changes (
  id               uuid primary key default gen_random_uuid(),
  itemcode         text not null references public.nieuwkoop_products(itemcode) on delete cascade,
  change_type      text not null check (change_type in (
    'new',
    'back_in_stock',
    'price_changed',
    'spec_changed',
    'discontinued'
  )),
  summary          text,
  before_data      jsonb,
  after_data       jsonb,
  created_at       timestamptz not null default now(),
  acknowledged_at  timestamptz,
  acknowledged_by  uuid
);

create index if not exists catalog_changes_open_idx
  on public.catalog_changes (created_at desc)
  where acknowledged_at is null;

create index if not exists catalog_changes_type_idx
  on public.catalog_changes (change_type);

create index if not exists catalog_changes_itemcode_idx
  on public.catalog_changes (itemcode);

create index if not exists catalog_changes_created_idx
  on public.catalog_changes (created_at desc);

alter table public.catalog_changes enable row level security;

drop policy if exists "staff_manage_catalog_changes" on public.catalog_changes;
create policy "staff_manage_catalog_changes" on public.catalog_changes
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- 4) Helper-view: product + stock + offered + open changes (staff UI)
create or replace view public.v_catalog_admin as
select
  np.itemcode,
  np.description,
  np.item_description_nl,
  np.sales_price as cost_price,
  np.main_group_code,
  np.main_group_description_nl,
  np.product_group_code,
  np.product_group_description_nl,
  np.group_description_nl,
  np.item_variety_nl,
  np.pot_size,
  np.diameter,
  np.height,
  np.width,
  np.length,
  np.depth,
  np.item_picture_name,
  np.show_on_website,
  np.delivery_time_in_days,
  np.is_active_at_source,
  np.first_seen_at,
  np.last_seen_at,
  np.discontinued_at,
  np.sysmodified,
  coalesce(ns.stock_available, 0) as stock_available,
  coalesce(oi.offered, false) as offered,
  (
    select count(*)::int
    from public.catalog_changes cc
    where cc.itemcode = np.itemcode
      and cc.acknowledged_at is null
  ) as open_changes
from public.nieuwkoop_products np
left join public.nieuwkoop_stock ns on ns.itemcode = np.itemcode
left join public.shopify_offered_items oi on oi.itemcode = np.itemcode and oi.offered = true;

comment on table public.catalog_changes is
  'Inbox van cataloguswijzigingen (ochtend-scan): new, back_in_stock, price_changed, spec_changed, discontinued';

comment on table public.shopify_offered_items is
  'Itemcodes die we in de SteraPro-webshop willen aanbieden (full-catalog selectie)';
