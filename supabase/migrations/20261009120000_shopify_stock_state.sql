-- Voorraadstaat Shopify ← Supabase en het dagelijkse verslag.
-- Nog niet toepassen op productie: de cron draait dry-run tot de migratie
-- bewust is uitgevoerd en SHOPIFY_INVENTORY_SYNC_LIVE=1 staat.

create table if not exists public.shopify_stock_state (
  itemcode text primary key references public.nieuwkoop_products(itemcode) on delete cascade,
  shopify_product_id text,
  shopify_variant_id text,
  inventory_item_id text,
  last_qty int,
  last_synced_at timestamptz,
  zero_since date,
  hidden_at timestamptz,
  hidden_reason text check (hidden_reason in ('oos_14d', 'discontinued')),
  updated_at timestamptz not null default now()
);

create index if not exists shopify_stock_state_zero_since_idx
  on public.shopify_stock_state (zero_since)
  where zero_since is not null;

create index if not exists shopify_stock_state_hidden_idx
  on public.shopify_stock_state (hidden_at)
  where hidden_at is not null;

create table if not exists public.stock_sync_reports (
  id bigserial primary key,
  run_at timestamptz not null default now(),
  ok boolean not null,
  dry_run boolean not null default true,
  counts jsonb not null default '{}'::jsonb,
  details jsonb not null default '{}'::jsonb
);

create index if not exists stock_sync_reports_run_at_idx
  on public.stock_sync_reports (run_at desc);

alter table public.shopify_stock_state enable row level security;
alter table public.stock_sync_reports enable row level security;

drop policy if exists "staff_read_shopify_stock_state" on public.shopify_stock_state;
create policy "staff_read_shopify_stock_state" on public.shopify_stock_state
  for select to authenticated
  using (public.is_staff());

drop policy if exists "staff_read_stock_sync_reports" on public.stock_sync_reports;
create policy "staff_read_stock_sync_reports" on public.stock_sync_reports
  for select to authenticated
  using (public.is_staff());

grant select on public.shopify_stock_state to authenticated;
grant select on public.stock_sync_reports to authenticated;
grant select, insert, update, delete on public.shopify_stock_state to service_role;
grant select, insert, update, delete on public.stock_sync_reports to service_role;
grant usage, select on sequence public.stock_sync_reports_id_seq to service_role;

-- De ochtend-cron schrijft catalog_changes met de service role. Product-updates
-- lukken wel; als de inbox-insert "permission denied" geeft, herstelt deze grant dat.
grant select, insert, update, delete on public.catalog_changes to service_role;

comment on table public.shopify_stock_state is
  'Per SKU: laatst gezette Shopify-qty, zero_since en of deze job het product van Online Store haalde.';

comment on table public.stock_sync_reports is
  'Dagelijks verslag van de Supabase → Shopify voorraad-sync, ook van dry-runs.';
