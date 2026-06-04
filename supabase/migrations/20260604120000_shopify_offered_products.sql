-- SteraPro webshop-selectie: welke combinaties bieden we aan?
--
-- Sleutel = de productnaam (description) — hetzelfde groeperingsniveau als de
-- Shopify-sync (één product per plant-pot-combinatie). Standaard bieden we niets
-- aan: een combinatie staat pas in de webshop als er hier een rij is met
-- offered = true. Beheerd via /admin/catalogus; de sync leest deze tabel.
--
-- Beveiliging: enkel beheerders (is_staff). De sync draait met de service-role
-- key en omzeilt RLS.

create table if not exists public.shopify_offered_products (
  group_name text primary key,
  offered    boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.shopify_offered_products enable row level security;

drop policy if exists "staff_manage" on public.shopify_offered_products;
create policy "staff_manage" on public.shopify_offered_products
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());
